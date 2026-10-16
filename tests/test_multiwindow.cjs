'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp, createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys, NOW, reviewStore, sightSession} = require('./helpers/fixtures.cjs');

async function openApp(t, options) {
  const app = await createApp(options);
  t.after(() => app.assertNoErrors());
  return app;
}

function databaseFor(clef = 'treble', notifications = false) {
  const session = sightSession();
  for (const note of session.notes) note.clef = clef;
  for (const bar of session.bars) bar.clef = clef;
  const database = createMemoryDatabase(new Map([
    [keys.settings, JSON.stringify({schema: 2, modules: {
      harmonic: {enabled: [4], autoPlayNext: false}, melodic: {enabled: [7], autoPlayNext: false}
    }})],
    [keys.sightSession, JSON.stringify(session)]
  ]));
  if (!notifications) database.BroadcastChannel = undefined;
  return database;
}

const read = (database, key) => JSON.parse(database.records.get(key));
const summary = app => app.get('stats-summary').children[0].children[0].children[1].textContent;
const manager = app => app.window.IntervalReview.createReviewManager(app.storage, keys.harmonic);

function clickAnswer(app, container, answer) {
  const button = app.get(container).querySelectorAll('button')
    .find(button => Number(button.dataset.answer ?? button.dataset.semitone) === answer);
  assert(button && !button.disabled);
  button.click();
}

const exercises = [
  {name: '和声', entry: 'home-harmonic', container: 'answer-grid', answer: 4, key: keys.harmonic},
  {name: '旋律', entry: 'home-melodic', container: 'answer-grid', answer: 7, key: keys.melodic},
  {name: '高音谱号音符', entry: 'home-sight', container: 'sight-keys', answer: 0, key: keys.treble, clef: 'treble'},
  {name: '低音谱号音符', entry: 'home-sight', container: 'sight-keys', answer: 0, key: keys.bass, clef: 'bass'},
  {name: '音程辨认', entry: 'home-staff-interval', container: 'staff-interval-options', key: keys.staff}
];
for (const exercise of exercises) {
  test(`两个${exercise.name}窗口接近同时答题，没有窗口通知也保留两次成绩`, async t => {
    const database = databaseFor(exercise.clef);
    const apps = [await openApp(t, {database}), await openApp(t, {database, seed: 987654321})];
    const answers = [];
    for (const app of apps) {
      await app.click(exercise.entry);
      answers.push(exercise.answer ?? app.window.StaffIntervalTrainer.backup().set.questions[0].semitones);
    }
    // Do not wait for the first window's write before answering in the second.
    apps.forEach((app, i) => clickAnswer(app, exercise.container, answers[i]));
    if (exercise.clef) await Promise.all(apps.map(app => app.advance(500)));
    await Promise.all(apps.map(app => app.settle()));
    const record = read(database, exercise.key);
    assert.equal(record.totalAnswers, 2);
    assert.equal(record.history.length, 2);
    assert.equal(Object.values(record.cards).reduce((sum, card) => sum + card.correct, 0), 2);
    assert.equal(Object.values(record.daily)[0].answered, 2);
    if (exercise.key === keys.melodic) {
      assert.equal(Object.values(record.directionalCards).reduce((sum, card) => sum + card.attempts, 0), 2);
      assert.equal(Object.values(Object.values(record.directionalDaily)[0]).reduce((sum, row) => sum + row.answered, 0), 2);
    }
    if (exercise.key === keys.harmonic) {
      assert.equal(record.cards[4].repetitions, 2);
      assert.equal(record.cards[4].intervalDays, 3, '第二次答对按原规则安排三天后的复习');
    }
    const select = backup => exercise.key === keys.harmonic ? backup.harmonic : exercise.key === keys.melodic ? backup.melodic :
      exercise.key === keys.staff ? backup.staffInterval.review : backup.sight[exercise.clef];
    const beforeReload = select(await apps[0].backup());
    const reloaded = await openApp(t, {database});
    assert.deepEqual(select(await reloaded.backup()), beforeReload);
  });
}

test('两个窗口连续交错答对、答错、显示答案和跳题，统计与复习顺序保持一致', async t => {
  const database = databaseFor();
  const first = await openApp(t, {database});
  const second = await openApp(t, {database});
  const a = manager(first), b = manager(second);
  for (let i = 0; i < 3; i++) {
    a.record({actual: 4, chosen: 4, now: NOW + i * 3, low: 60, high: 64, responseMs: 1000});
    b.record({actual: 4, chosen: 3, hinted: true, now: NOW + i * 3 + 1, low: 60, high: 64, responseMs: 1000});
    a.record({actual: 4, chosen: null, revealed: true, now: NOW + i * 3 + 2, low: 60, high: 64, responseMs: 1000});
  }
  a.skip({now: NOW}); b.skip({now: NOW});
  await Promise.all([first.settle(), second.settle()]);
  const record = read(database, keys.harmonic);
  const day = Object.values(record.daily)[0];
  assert.equal(record.totalAnswers, 9);
  assert.deepEqual(record.history.map(item => item.chosen), [4, 3, null, 4, 3, null, 4, 3, null]);
  assert.equal(record.cards[4].correct, 3);
  assert.equal(record.cards[4].wrong, 6);
  assert.equal(record.cards[4].repetitions, 0);
  assert.equal(record.cards[4].pendingAfter, 11);
  assert.equal(record.confusions['4>3'], 3);
  assert.deepEqual([day.answered, day.correct, day.hints, day.skipped, day.responseTotal, day.responseCount], [9, 3, 3, 2, 9000, 9]);
  const backup = await first.backup();
  assert.deepEqual(backup.harmonic, record, '旧窗口导出时也能取得所有新记录');
});

test('另一窗口清空后，旧窗口继续作答不会恢复已清除的历史', async t => {
  const database = databaseFor();
  database.records.set(keys.harmonic, JSON.stringify(reviewStore({actual: 9, chosen: 8, count: 3})));
  const first = await openApp(t, {database});
  const second = await openApp(t, {database});
  await second.click('home-harmonic');
  await first.click('home-stats'); await first.click('clear-review');
  await second.answer('answer-grid', 4);
  const record = read(database, keys.harmonic);
  assert.equal(record.totalAnswers, 1);
  assert.equal(record.history.length, 1);
  assert.deepEqual(Object.keys(record.cards), ['4']);
  assert.deepEqual(record.confusions, {});
});

test('答题、另一窗口清空、继续答题连续排队时，只有清空后的作答保留', async t => {
  const database = databaseFor();
  const first = await openApp(t, {database});
  const second = await openApp(t, {database});
  const a = manager(first), b = manager(second);
  a.record({actual: 9, chosen: 8, now: NOW});
  b.reset();
  a.record({actual: 4, chosen: 4, now: NOW + 1});
  await Promise.all([first.settle(), second.settle()]);
  const record = read(database, keys.harmonic);
  assert.equal(record.totalAnswers, 1);
  assert.deepEqual(record.history.map(item => item.actual), [4]);
  assert.deepEqual(record.confusions, {});
});

test('另一窗口恢复备份后，旧窗口作答累计在恢复的记录上', async t => {
  const database = databaseFor();
  database.records.set(keys.harmonic, JSON.stringify(reviewStore({count: 2})));
  const first = await openApp(t, {database});
  const second = await openApp(t, {database});
  await second.click('home-harmonic');
  const backup = await first.backup();
  backup.harmonic = reviewStore({actual: 9, chosen: 8, count: 3});
  await first.importBackup(backup);
  assert.equal(first.window.reloads, 1);
  await second.answer('answer-grid', 4);
  const record = read(database, keys.harmonic);
  assert.equal(record.totalAnswers, 4);
  assert.equal(record.cards[9].attempts, 3);
  assert.equal(record.cards[4].attempts, 1, '不能带回备份恢复前的两次作答');
  assert.equal(record.confusions['9>8'], 3);
});

test('另一窗口导入旧音符编号后，已打开的音符练习仍按正确编号累计', async t => {
  const database = databaseFor();
  const first = await openApp(t, {database});
  const second = await openApp(t, {database});
  await second.click('home-sight');
  const backup = await first.backup();
  backup.sight.treble = reviewStore({actual: 14, chosen: 13, maxIndex: 20});
  await first.importBackup(backup);
  assert.equal(first.window.reloads, 1);
  await second.answer('sight-keys', 0); await second.advance(500);
  const record = read(database, keys.treble);
  assert.equal(record.cardRange, 63);
  assert.equal(record.totalAnswers, 2);
  assert.equal(record.cards[54].wrong, 1, '旧编号 14 按原有范围转换成 54');
  assert.equal(record.cards[12].correct, 1, '当前 C4 仍按现有编号 12 保存');
  assert.equal(record.confusions['54>51'], 1);
});

for (const sight of [false, true]) {
  test(`另一窗口保存${sight ? '音符' : '和声'}成绩后，已打开的统计会更新`, async t => {
    const database = databaseFor('treble', true);
    const watcher = await openApp(t, {database});
    const writer = await openApp(t, {database});
    await watcher.click('home-stats');
    if (sight) await watcher.click('stats-sight');
    assert.equal(summary(watcher), '0');
    await writer.click(sight ? 'home-sight' : 'home-harmonic');
    await writer.answer(sight ? 'sight-keys' : 'answer-grid', sight ? 0 : 4);
    if (sight) await writer.advance(500);
    await watcher.settle();
    assert.equal(summary(watcher), '1');
    assert(watcher.get('stats-dialog').open);
  });
}

test('没有窗口通知时，切回窗口会重新读取成绩并更新已打开的统计', async t => {
  const database = databaseFor();
  const watcher = await openApp(t, {database});
  const writer = await openApp(t, {database});
  await watcher.click('home-stats');
  await writer.click('home-harmonic'); await writer.answer('answer-grid', 4);
  assert.equal(summary(watcher), '0');
  watcher.window.dispatchEvent({type: 'focus'});
  await watcher.settle();
  assert.equal(summary(watcher), '1');
});

test('没有窗口通知时，旧窗口重新打开统计和导出都能取得新成绩', async t => {
  const database = databaseFor();
  const watcher = await openApp(t, {database});
  const writer = await openApp(t, {database});
  await writer.click('home-harmonic'); await writer.answer('answer-grid', 4);
  assert.equal((await watcher.backup()).harmonic.totalAnswers, 1);
  await writer.click('next-question'); await writer.answer('answer-grid', 4);
  await watcher.click('home-stats');
  assert.equal(summary(watcher), '2');
});

test('没有窗口通知时，从每个练习的设置打开统计都能读取另一窗口的新成绩', async t => {
  for (const exercise of exercises) {
    const database = databaseFor(exercise.clef);
    const watcher = await openApp(t, {database});
    const writer = await openApp(t, {database});
    await watcher.click(exercise.entry); await writer.click(exercise.entry);
    const answer = exercise.answer ?? writer.window.StaffIntervalTrainer.backup().set.questions[0].semitones;
    await writer.answer(exercise.container, answer);
    if (exercise.clef) await writer.advance(500);
    assert.equal(JSON.parse(watcher.storage.getItem(exercise.key) || '{}').totalAnswers ?? 0, 0);
    await watcher.click('open-settings');
    await watcher.click(exercise.key === keys.staff ? 'staff-open-stats' : exercise.clef ? 'sight-open-stats' : 'open-stats');
    assert.equal(summary(watcher), '1', exercise.name);
  }
});

test('旧副本触发旋律方向记录初始化时，不覆盖其他窗口已保存的作答', async t => {
  const database = databaseFor();
  const first = await openApp(t, {database});
  const second = await openApp(t, {database});
  const key = 'isolated-multiwindow-direction-migration';
  const a = first.window.IntervalReview.createReviewManager(first.storage, key, {directional: true});
  a.record({actual: 7, chosen: 7, direction: 1, now: NOW});
  await first.settle();
  // The second adapter still has no cached value for this key.
  const b = second.window.IntervalReview.createReviewManager(second.storage, key, {directional: true});
  b.record({actual: 7, chosen: 6, direction: -1, now: NOW + 1});
  await second.settle();
  const record = read(database, key);
  assert.equal(record.totalAnswers, 2);
  assert.equal(record.directionalCards['7:up'].correct, 1);
  assert.equal(record.directionalCards['7:down'].wrong, 1);
});

test('排队作答中一次保存失败时，不把后续作答重复算作失败前的记录', async () => {
  const database = databaseFor();
  const app = await createApp({database});
  const review = manager(app);
  database.failNextWrite({after: 0});
  review.record({actual: 4, chosen: 4, low: 60, high: 64, now: NOW});
  review.record({actual: 4, chosen: 3, low: 60, high: 64, now: NOW + 1});
  await assert.rejects(app.storage.flush(), /模拟保存空间不足|学习数据保存失败/);
  await new Promise(setImmediate);
  const saved = read(database, keys.harmonic);
  assert.equal(saved.totalAnswers, 1);
  assert.deepEqual(saved.history.map(item => item.chosen), [3]);
  // The unsaved answer remains in memory for recovery, once each rather than
  // replacing it with a second copy of the later answer.
  const inMemory = review.snapshot();
  assert.equal(inMemory.totalAnswers, 2);
  assert.deepEqual(Array.from(inMemory.history, item => item.chosen).sort(), [3, 4]);
  assert.equal(review.storageAvailable, false);
  assert.equal(review.statistics().storageAvailable, false);
  assert.equal(app.errors.length, 1);
  assert.match(app.errors[0], /学习数据保存失败/);
});
