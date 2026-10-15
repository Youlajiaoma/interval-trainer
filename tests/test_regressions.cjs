'use strict';

// These assertions describe desired behavior. Known audit defects remain real
// failures until fixed; no expected-failure flag or inverted assertion hides them.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp, createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys, reviewStore, seededDatabase, sightSession, fillHistory} = require('./helpers/fixtures.cjs');

async function openApp(t, options) {
  const app = await createApp(options);
  t.after(() => app.assertNoErrors());
  return app;
}

test('A1 音符辨认页清空历史只影响音符记录', async t => {
  const app = await openApp(t, {database: seededDatabase()});
  const before = await app.backup();
  await app.click('home-stats');
  await app.click('stats-sight');
  await app.click('clear-review');
  const after = await app.backup();
  assert.deepEqual(after.harmonic, before.harmonic, '和声记录不应被清空');
  assert.deepEqual(after.melodic, before.melodic);
  assert.deepEqual(after.staffInterval.review, before.staffInterval.review);
  assert.equal(after.sight.treble.totalAnswers + after.sight.bass.totalAnswers, 0);
});

test('A2 完整备份恢复保留两个谱号的高编号音符记录', async t => {
  const app = await openApp(t, {database: seededDatabase()});
  const before = await app.backup();
  await app.importBackup(before);
  assert.equal(app.window.reloads, 1, '有效备份应完成恢复');
  const reloaded = await openApp(t, {database: app.database});
  const after = await reloaded.backup();
  for (const clef of ['treble', 'bass']) {
    assert.deepEqual(after.sight[clef], before.sight[clef], clef + ' 的题目、每日统计和复习安排应完整保留');
  }
});

test('A3 备份最后一部分损坏时，所有已保存数据保持不变', async t => {
  const app = await openApp(t, {database: seededDatabase()});
  const backup = await app.backup();
  backup.harmonic = reviewStore({actual: 3, count: 2});
  backup.staffInterval.review = {version: 999};
  const before = new Map(app.database.records);
  await app.importBackup(backup);
  assert.equal(app.window.reloads, 0);
  assert.match(app.get('toast').textContent, /导入失败/);
  const changed = [...new Set([...before.keys(), ...app.database.records.keys()])]
    .filter(key => before.get(key) !== app.database.records.get(key));
  assert.deepEqual(changed, [], '拒绝备份前不得覆盖任何模块');
});

test('A4 当前记录保留上限生成的大备份可以经文件入口重新导入', async t => {
  const database = seededDatabase();
  for (const key of [keys.harmonic, keys.melodic, keys.treble, keys.bass, keys.staff]) {
    database.records.set(key, JSON.stringify(fillHistory(JSON.parse(database.records.get(key)))));
  }
  const app = await openApp(t, {database});
  const text = await app.exportText();
  const before = JSON.parse(text);
  assert(Buffer.byteLength(text) > 8 * 1024 * 1024, '用例必须覆盖超过原有文件限制的备份');
  t.diagnostic('完整备份大小：' + (Buffer.byteLength(text) / 1024 / 1024).toFixed(2) + ' MiB');
  await app.importFile(text);
  assert.equal(app.window.reloads, 1, '程序自身导出的有效备份不应被文件大小限制拒绝');
  const reloaded = await openApp(t, {database});
  assert.deepEqual(await reloaded.backup(), before, '大备份恢复后的全部记录和设置应保持完整');
});

test('A5 两个窗口各答一题后，重新打开应保留两题', async t => {
  const database = createMemoryDatabase();
  const first = await openApp(t, {database, seed: 12345});
  const second = await openApp(t, {database, seed: 987654321});
  for (const app of [first, second]) {
    await app.click('home-harmonic');
    await app.answer('answer-grid', 4);
  }
  const reopened = await openApp(t, {database});
  assert.equal((await reopened.backup()).harmonic.totalAnswers, 2, '另一个窗口保存的成绩不应被旧副本覆盖');
});

test('A6 同一小节 C♯4、D4、C4 的第三个音必须带还原号', async t => {
  const session = sightSession({accidentals: true});
  const database = createMemoryDatabase(new Map([[keys.sightSession, JSON.stringify(session)]]));
  const app = await openApp(t, {database});
  await app.click('home-sight');
  assert.equal(app.engraver.notes.length, 20, '应恢复并送出完整的二十音谱面');
  const third = app.engraver.notes[2];
  assert.equal(third.options.keys[0], 'c/4');
  assert(third.modifiers.some(({modifier}) => modifier.type === 'n'), '返回 C 自然音时应向记谱组件传入还原号');
});

for (const completion of ['correct', 'reveal']) for (const recovery of ['reenter', 'reload']) {
  const action = completion === 'correct' ? '答对' : '显示答案';
  const resume = recovery === 'reenter' ? '返回再进入' : '刷新';
  test(`A7 音程辨认${action}后立即${resume}，可以继续且不重复计分`, async t => {
    let app = await openApp(t);
    await app.click('home-staff-interval');
    if (completion === 'correct') {
      const question = app.window.StaffIntervalTrainer.backup().set.questions[0];
      await app.answer('staff-interval-options', question.semitones);
    } else await app.click('staff-interval-reveal');
    await app.advance(100);
    if (recovery === 'reenter') await app.click('back-home');
    else app = await openApp(t, {database: app.database});
    await app.click('home-staff-interval');
    await app.advance(2000);
    const state = app.window.StaffIntervalTrainer.backup();
    assert.equal(state.set.pos, 1, '恢复后应进入下一题');
    assert.equal(state.review.totalAnswers, 1, '已经完成的题目只能计分一次');
    assert(app.get('staff-interval-options').querySelectorAll('button').some(button => !button.disabled));
  });
}

test('A8 音符答错后刷新再答对，仍然按首次答错统计一次', async t => {
  const database = createMemoryDatabase(new Map([[keys.sightSession, JSON.stringify(sightSession())]]));
  const first = await openApp(t, {database});
  await first.click('home-sight');
  await first.answer('sight-keys', 2); // First note is C4; D is incorrect.
  await first.advance(400);
  const reloaded = await openApp(t, {database});
  await reloaded.click('home-sight');
  await reloaded.answer('sight-keys', 0);
  await reloaded.advance(500);
  const record = (await reloaded.backup()).sight.treble;
  assert.equal(record.totalAnswers, 1);
  assert.equal(record.cards[12].correct, 0, '刷新不能把首次答错变为首次答对');
  assert.equal(record.cards[12].wrong, 1);
});

test('A9 只选纯一度的旧设置不会阻断旋律练习', async t => {
  const database = createMemoryDatabase(new Map([[keys.settings, JSON.stringify({enabled: [0]})]]));
  const app = await openApp(t, {database});
  await app.click('home-melodic');
  assert(!app.get('practice').classList.contains('hidden'), '应为无可用录音的旧设置提供有效选择');
  await app.click('open-settings');
  assert(app.get('settings-dialog').open, '应能打开旋律设置继续调整');
});
