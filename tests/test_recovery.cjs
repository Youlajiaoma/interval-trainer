'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp, createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys, sightSession} = require('./helpers/fixtures.cjs');

async function openApp(t, options) {
  const app = await createApp(options);
  t.after(() => app.assertNoErrors());
  return app;
}

async function resume(t, app, recovery, entry) {
  if (recovery === 'reload') app = await openApp(t, {database: app.database});
  else await app.click('back-home');
  await app.click(entry);
  return app;
}

for (const recovery of ['reenter', 'reload']) {
  const recoveryLabel = recovery === 'reenter' ? '返回再进入' : '刷新';
  for (const revealed of [false, true]) {
    test(`音程辨认最后一题${revealed ? '显示答案' : '答对'}后立即${recoveryLabel}，能显示完成且只记一次`, async t => {
      let app = await openApp(t);
      await app.click('home-staff-interval');
      for (let i = 0; i < 9; i++) {
        const state = app.window.StaffIntervalTrainer.backup();
        await app.answer('staff-interval-options', state.set.questions[i].semitones);
        await app.advance(1000);
      }
      const last = app.window.StaffIntervalTrainer.backup().set.questions[9];
      if (revealed) await app.click('staff-interval-reveal');
      else await app.answer('staff-interval-options', last.semitones);
      app = await resume(t, app, recovery, 'home-staff-interval');
      await app.advance(2000);
      const state = app.window.StaffIntervalTrainer.backup();
      assert.equal(state.set.pos, 10);
      assert.equal(state.review.totalAnswers, 10);
      assert.equal(state.review.history.filter(item => item.revealed).length, revealed ? 1 : 0);
      assert(!app.get('staff-interval-summary').classList.contains('hidden'));
      app = await resume(t, app, recovery, 'home-staff-interval');
      assert.equal(app.window.StaffIntervalTrainer.backup().review.totalAnswers, 10);
    });
  }

  test(`音程辨认答错后${recoveryLabel}，保留当前题和第一次错误，答对后仍按首次答错记录`, async t => {
    let app = await openApp(t);
    await app.click('home-staff-interval');
    const before = app.window.StaffIntervalTrainer.backup().set;
    const actual = before.questions[0].semitones, wrong = (actual + 1) % 13;
    await app.answer('staff-interval-options', wrong);
    app = await resume(t, app, recovery, 'home-staff-interval');
    const restored = app.window.StaffIntervalTrainer.backup();
    assert.equal(restored.set.pos, 0);
    assert.equal(restored.review.totalAnswers, 0);
    assert.deepEqual(Array.from(restored.set.questions, question => question.notes.join(',')),
      Array.from(before.questions, question => question.notes.join(',')));
    await app.answer('staff-interval-options', actual); await app.advance(1000);
    const after = app.window.StaffIntervalTrainer.backup();
    assert.equal(after.set.pos, 1);
    assert.equal(after.review.totalAnswers, 1);
    assert.equal(after.review.history[0].chosen, wrong);
    assert.equal(after.review.cards[actual].correct, 0);
  });

  for (const revealed of [false, true]) {
    test(`音符首次答错后立即${recoveryLabel}，再${revealed ? '显示答案' : '答对'}保留第一次错误`, async t => {
      const database = createMemoryDatabase(new Map([[keys.sightSession, JSON.stringify(sightSession())]]));
      let app = await openApp(t, {database});
      await app.click('home-sight');
      await app.answer('sight-keys', 2); // D; the actual note is C4.
      assert.equal(JSON.parse(database.records.get(keys.sightSession)).notes[0].mistakeChosen, 2,
        '红色提示结束之前就应保存首次错误');
      app = await resume(t, app, recovery, 'home-sight');
      await app.advance(400);
      // A later wrong choice must not replace the first one.
      await app.answer('sight-keys', 4); await app.advance(400);
      if (revealed) await app.click('sight-reveal');
      else await app.answer('sight-keys', 0);
      await app.advance(500);
      const record = (await app.backup()).sight.treble;
      assert.equal(record.totalAnswers, 1);
      assert.equal(record.cards[12].correct, 0);
      assert.equal(record.cards[12].wrong, 1);
      assert.equal(record.history[0].actual, 12);
      assert.equal(record.history[0].chosen, 15, '第一次误选的 D4 对应编号 15');
      assert.equal(record.history[0].revealed, revealed);
      assert.equal(app.get('sight-correct').textContent, '0');
      const reloaded = await openApp(t, {database});
      await reloaded.click('home-sight');
      assert.equal(reloaded.get('sight-count').textContent, '02');
      assert.equal((await reloaded.backup()).sight.treble.totalAnswers, 1);
    });
  }
}

test('音程辨认已经自动进入下一题后再返回，不多跳一题', async t => {
  let app = await openApp(t);
  await app.click('home-staff-interval');
  const actual = app.window.StaffIntervalTrainer.backup().set.questions[0].semitones;
  await app.answer('staff-interval-options', actual); await app.advance(1000);
  app = await resume(t, app, 'reenter', 'home-staff-interval');
  await app.advance(2000);
  const state = app.window.StaffIntervalTrainer.backup();
  assert.equal(state.set.pos, 1);
  assert.equal(state.review.totalAnswers, 1);
  assert.equal(state.set.questions[1].done, false);
});
