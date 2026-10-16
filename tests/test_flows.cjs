'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp, createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys, seededDatabase, sightSession} = require('./helpers/fixtures.cjs');

test('四模块可以分别进入和返回，单纯导航不产生答题记录', async () => {
  const app = await createApp();
  for (const [entry, page] of [['home-harmonic', 'practice'], ['home-melodic', 'practice'],
    ['home-sight', 'sight-practice'], ['home-staff-interval', 'staff-interval-practice']]) {
    await app.click(entry);
    assert(!app.get(page).classList.contains('hidden'));
    await app.click('back-home');
    assert(!app.get('home-screen').classList.contains('hidden'));
    assert(app.get(page).classList.contains('hidden'));
  }
  const backup = await app.backup();
  assert.equal(backup.harmonic.totalAnswers + backup.melodic.totalAnswers + backup.sight.treble.totalAnswers +
    backup.sight.bass.totalAnswers + backup.staffInterval.review.totalAnswers, 0);
  app.assertNoErrors();
});

test('和声与旋律分别保存作答，刷新后仍各保留一次', async () => {
  const app = await createApp();
  await app.click('home-harmonic'); await app.answer('answer-grid', 4);
  await app.click('back-home'); await app.click('home-melodic'); await app.answer('answer-grid', 5);
  const reloaded = await createApp({database: app.database});
  const backup = await reloaded.backup();
  assert.equal(backup.harmonic.totalAnswers, 1);
  assert.equal(backup.melodic.totalAnswers, 1);
  assert([1, -1].includes(backup.melodic.history[0].direction));
  app.assertNoErrors(); reloaded.assertNoErrors();
});

test('先保存再打开另一个窗口，新的窗口可以在已有成绩上继续累计', async () => {
  const first = await createApp();
  await first.click('home-harmonic'); await first.answer('answer-grid', 4);
  const second = await createApp({database: first.database});
  await second.click('home-harmonic'); await second.answer('answer-grid', 4);
  assert.equal((await second.backup()).harmonic.totalAnswers, 2);
  first.assertNoErrors(); second.assertNoErrors();
});

for (const [mode, label] of [['harmonic', '和声'], ['melodic', '旋律'], ['staff', '音程辨认']]) {
  test(label + '统计页清空历史不影响其他模块', async () => {
    const app = await createApp({database: seededDatabase()});
    const before = await app.backup();
    await app.click('home-stats'); await app.click('stats-sight'); await app.click('stats-' + mode);
    assert.equal(app.get('stats-performance-title').textContent, '各音程表现');
    await app.click('clear-review');
    const after = await app.backup();
    for (const category of ['harmonic', 'melodic', 'staff']) {
      const previous = category === 'staff' ? before.staffInterval.review : before[category];
      const current = category === 'staff' ? after.staffInterval.review : after[category];
      if (category === mode) assert.equal(current.totalAnswers, 0);
      else assert.deepEqual(current, previous);
    }
    assert.deepEqual(after.sight, before.sight);
    app.assertNoErrors();
  });
}

test('音符正常答对后进入下一题并保存首次正确成绩', async () => {
  const database = createMemoryDatabase(new Map([[keys.sightSession, JSON.stringify(sightSession())]]));
  const app = await createApp({database});
  await app.click('home-sight'); await app.answer('sight-keys', 0); await app.advance(500);
  const reloaded = await createApp({database});
  const backup = await reloaded.backup();
  assert.equal(backup.sight.treble.totalAnswers, 1);
  assert.equal(backup.sight.treble.cards[12].correct, 1);
  assert.equal(JSON.parse(database.records.get(keys.sightSession)).pos, 1);
  app.assertNoErrors(); reloaded.assertNoErrors();
});

test('音程辨认正常答对后自动前进，重复点击不会重复计分', async () => {
  const app = await createApp();
  await app.click('home-staff-interval');
  const q = app.window.StaffIntervalTrainer.backup().set.questions[0];
  await app.answer('staff-interval-options', q.semitones);
  // A disabled answer must not dispatch another click.
  app.get('staff-interval-options').querySelectorAll('button')[0].click();
  await app.advance(1200);
  const state = app.window.StaffIntervalTrainer.backup();
  assert.equal(state.set.pos, 1);
  assert.equal(state.review.totalAnswers, 1);
  app.assertNoErrors();
});

test('整体格式不合法的备份会被拒绝且不会改变保存数据', async () => {
  const app = await createApp({database: seededDatabase()});
  const before = [...app.database.records];
  await app.importBackup({format: 'unrelated-file', version: 3});
  assert.deepEqual([...app.database.records], before);
  assert.equal(app.window.reloads, 0);
  assert.match(app.get('toast').textContent, /导入失败/);
  app.assertNoErrors();
});
