'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp, createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys, NOW} = require('./helpers/fixtures.cjs');

const atDay = days => new Date(2026, 9, 15 + days, 10).getTime();
const values = app => app.get('stats-summary').children[0].children.map(card => card.children[1].textContent);
const view = (app, period = 'all') => app.window.TonaloomModules.get('sight').statistics(period, NOW);
async function period(app, value) {
  app.get('stats-period').value = String(value);
  app.get('stats-period').dispatchEvent({type:'change'});
  await app.settle();
}
async function open(t, events = [], settings = {clef:'both', accidentals:false}) {
  const database = createMemoryDatabase(new Map([[keys.sightSettings, JSON.stringify(settings)]]));
  const app = await createApp({database});
  t.after(() => app.assertNoErrors());
  const reviews = Object.fromEntries(['treble','bass'].map(clef => [clef,
    app.window.IntervalReview.createReviewManager(app.storage, keys[clef], {maxIndex:62})]));
  for (const event of events) reviews[event.clef].record({
    actual:event.actual ?? 15, chosen:event.chosen === undefined ? event.actual ?? 15 : event.chosen,
    now:event.at ?? atDay(event.day ?? 0), revealed:event.revealed ?? false
  });
  await app.settle();
  await app.click('home-stats'); await app.click('stats-sight');
  return app;
}

test('音符空记录使用共用概览、49 天日历和空状态，不显示其他类别的数据', async t => {
  const app = await open(t);
  assert.deepEqual(values(app), ['0', '—', '0 天', '0 天']);
  assert.equal(app.get('stats-performance-title').textContent, '各音符表现');
  assert.equal(app.get('stats-confusions-title').textContent, '易混淆音符');
  assert.equal(app.get('stats-calendar').children[0].children[0].children.length, 49);
  assert.match(app.get('stats-trend').textContent, /没有答题记录/);
  assert.match(app.get('stats-intervals').textContent, /各音符的正确率/);
  assert.match(app.get('stats-review-plan').textContent, /0 种音符/);
  assert.match(app.get('stats-storage-warning').textContent, /IndexedDB/);
});

test('音符两个谱号按答题数合计正确率，同一天只算一个练习日', async t => {
  const app = await open(t, [
    ...Array.from({length:3}, () => ({clef:'treble', actual:15})),
    {clef:'bass', actual:51, chosen:52}
  ]);
  assert.deepEqual(values(app), ['4', '75%', '1 天', '1 天']);
  const s = view(app);
  assert.equal(s.totals.answered, 4); assert.equal(s.totals.correct, 3);
  assert.equal(s.last49.at(-1).answered, 4);
  assert.equal(s.last49.at(-1).correct, 3);
  assert.equal(app.get('stats-trend').querySelectorAll('svg').length, 1);
  assert.equal(app.get('stats-intervals').children[0].children.length, 2);
});

test('音符高低音交替练习合并连续天数，断一天后重新计数，今天未练仍保留昨天的连续记录', async t => {
  const app = await open(t, [
    {clef:'treble', day:-3}, {clef:'bass', day:-2}, {clef:'treble', day:-1},
    {clef:'bass'}, {clef:'treble'}, {clef:'treble', day:-10}
  ]);
  assert.deepEqual(values(app), ['6', '100%', '5 天', '4 天']);
  const statistics = app.window.TonaloomModules.get('sight').statistics;
  assert.equal(statistics('all', atDay(1)).streak, 4);
  assert.equal(statistics('all', atDay(2)).streak, 0);
  assert.equal(statistics(1, NOW).practiceDays, 1);
  assert.equal(statistics(1, NOW).streak, 4, '连续练习沿用其他模块的全历史含义');
});

test('音符近 7、30、90 天与全部时间同步筛选总数、表现、误认和历史，日历保持最近 49 天', async t => {
  const app = await open(t, [
    {clef:'treble'}, {clef:'bass', day:-6, chosen:16}, {clef:'treble', day:-7},
    {clef:'bass', day:-29}, {clef:'treble', day:-30, chosen:16},
    {clef:'bass', day:-89}, {clef:'treble', day:-90}
  ]);
  for (const [range, answered, correct, wrong] of [[7,2,1,1], [30,4,3,1], [90,6,4,2], ['all',7,5,2]]) {
    await period(app, range);
    assert.deepEqual(values(app), [String(answered), Math.round(100*correct/answered)+'%', answered+' 天', '1 天']);
    const s = view(app, range);
    assert.equal(s.byInterval.reduce((sum,row) => sum+row.answered,0), answered);
    assert.equal(s.confusions.reduce((sum,row) => sum+row.count,0), wrong);
    assert.equal(app.get('stats-history').children[0].children.length, answered);
    const squares = app.get('stats-calendar').children[0].children[0].children;
    assert.equal(squares.length, 49);
    assert.equal(squares.filter(square => square.dataset.level !== '0').length, 5);
  }
});

test('音符表现保留同位置三种升降形式的合计，误认和历史保留具体拼写及高低音谱号', async t => {
  const app = await open(t, [
    {clef:'treble', actual:15}, {clef:'treble', actual:16},
    {clef:'treble', actual:17, chosen:15}, {clef:'bass', actual:51, chosen:52}
  ], {clef:'both', accidentals:true});
  const rows = app.get('stats-intervals').children[0].children;
  assert.equal(rows.length, 2);
  assert(rows.some(row => row.textContent.includes('高音谱号 · D4') && row.textContent.includes('67%  ·  2/3')));
  assert(rows.some(row => row.textContent.includes('低音谱号 · D4') && row.textContent.includes('0%  ·  0/1')));
  const confused = app.get('stats-confusions').textContent;
  assert.match(confused, /高音谱号 · D4♭ → 高音谱号 · D4/);
  assert.match(confused, /低音谱号 · D4 → 低音谱号 · D4♯/);
  assert.match(app.get('stats-history').textContent, /高音谱号 · D4♯/);
  assert.match(app.get('stats-history').textContent, /低音谱号 · D4/);
});

test('音符昨日错题和到期复习按实际谱号与升降号设置显示，历史仍包含全部设置下的作答', async t => {
  const events = [
    {clef:'treble', actual:15, chosen:16, day:-1},
    {clef:'treble', actual:16, chosen:15, day:-1},
    {clef:'bass', actual:51, chosen:52, day:-1}
  ];
  const treble = await open(t, events, {clef:'treble', accidentals:false});
  assert.equal(view(treble).yesterdayWrong.length, 1);
  assert.equal(view(treble).due, 1);
  assert.match(treble.get('stats-review-plan').textContent, /昨日答错 1 种音符/);
  assert.match(treble.get('stats-review-plan').textContent, /高音谱号 · D4/);
  assert(!treble.get('stats-review-plan').textContent.includes('低音谱号'));
  assert.equal(view(treble).history.length, 3);
  const both = await open(t, events, {clef:'both', accidentals:true});
  assert.equal(view(both).yesterdayWrong.length, 3);
  assert.equal(view(both).due, 3);
  assert.match(both.get('stats-review-plan').textContent, /低音谱号 · D4/);
});

test('音符最近答题合并两个谱号后按时间排序，显示答案仍按错误显示且不成为误认组合', async t => {
  const events = Array.from({length:30}, (_,i) => ({clef:i%2?'treble':'bass', actual:i%2?15:51,
    at:NOW-i*1000, ...(i===0?{chosen:null,revealed:true}:{})}));
  const app = await open(t, events);
  const rows = app.get('stats-history').children[0].children;
  assert.equal(rows.length, 25);
  assert.match(rows[0].textContent, /低音谱号 · D4 · 显示答案错误/);
  assert.match(rows[1].textContent, /高音谱号 · D4正确/);
  assert.equal(view(app).confusions.length, 0);
  assert.deepEqual(Array.from(view(app).history, h=>h.at), events.map(event=>event.at));
});

test('切换音符与其他三类统计后标题和内容更新，筛选、查看及重新载入都不修改保存数据', async t => {
  const app = await open(t, [{clef:'treble', actual:15}, {clef:'bass', actual:51, chosen:52}]);
  const before = [...app.database.records];
  for (const mode of ['harmonic', 'melodic', 'staff']) {
    await app.click('stats-'+mode);
    assert.equal(app.get('stats-performance-title').textContent, '各音程表现');
    assert.equal(app.get('stats-confusions-title').textContent, '易混淆音程');
    assert.equal(values(app)[0], '0');
    await app.click('stats-sight'); await period(app, 7);
    assert.equal(values(app)[0], '2');
  }
  assert.deepEqual([...app.database.records], before);
  const reloaded = await createApp({database:app.database});
  await reloaded.click('home-stats'); await reloaded.click('stats-sight');
  assert.deepEqual(values(reloaded), values(app));
  assert.deepEqual([...app.database.records], before);
  reloaded.assertNoErrors();
});

test('共用统计仍保留另外三类的正确率、旋律上下行、乐器、误判和复习范围', async t => {
  const app = await open(t);
  for (const [mode, key] of [['harmonic',keys.harmonic], ['melodic',keys.melodic], ['staff',keys.staff]]) {
    const review = app.window.IntervalReview.createReviewManager(app.storage, key, {directional:mode==='melodic'});
    review.record({actual:7, chosen:6, direction:1, timbre:'guitar', now:NOW-1000});
    review.record({actual:7, chosen:7, direction:-1, timbre:'piano', now:NOW});
    await app.settle(); await app.click('stats-'+mode);
    assert.deepEqual(values(app), ['2', '50%', '1 天', '1 天']);
    assert.equal(app.get('stats-performance-title').textContent, '各音程表现');
    const text = app.get('stats-intervals').textContent;
    if (mode === 'melodic') {
      assert.match(text, /↑ 纯五度0%  ·  0\/1/);
      assert.match(text, /↓ 纯五度100%  ·  1\/1/);
      assert.match(app.get('stats-history').textContent, /↓ 纯五度 · 钢琴正确/);
      assert.match(app.get('stats-confusions').textContent, /↑ 纯五度 → 三全音/);
    } else assert.match(text, /纯五度50%  ·  1\/2/);
    assert.match(app.get('stats-review-plan').textContent, /种音程/);
  }
});
