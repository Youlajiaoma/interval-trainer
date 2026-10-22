'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp} = require('./helpers/app-harness.cjs');
const {keys} = require('./helpers/fixtures.cjs');

test('音符题在后台记录首次作答用时，但不改变答题正确性和原有间隔', async t => {
  const app = await createApp();
  t.after(() => app.assertNoErrors());
  await app.click('home-sight');
  const saved = JSON.parse(app.database.records.get(keys.sightSession));
  const note = saved.notes[0];
  assert.equal(note.questionStartedAt, app.clock.now);
  await app.advance(6200);
  const pitchClasses = [0, 2, 4, 5, 7, 9, 11];
  const pitchClass = (pitchClasses[note.index % 7] + (note.alter === 1 ? 1 : note.alter === 2 ? -1 : 0) + 12) % 12;
  await app.answer('sight-keys', pitchClass);
  await app.advance(300);
  const backup = await app.backup();
  assert.equal(backup.sight.treble.history[0].responseMs, 6200);
  const card = backup.sight.treble.cards[backup.sight.treble.history[0].actual];
  assert.equal(card.correct, 1);
  assert.equal(card.wrong, 0);
  assert.equal(card.responseTotal, 6200);
  assert.equal(card.responseCount, 1);
  assert.equal(card.repetitions, 1);
  assert.equal(card.pendingAfter, null);
});

test('作答用时平滑提高后续抽题机会，短时音符仍保留基础机会', async t => {
  const app = await createApp();
  const review = app.window.IntervalReview.createReviewManager(app.storage, keys.treble,
    {maxIndex: 62, responseSensitive: true});
  review.record({actual: 30, chosen: 30, responseMs: 1000, now: app.clock.now});
  review.record({actual: 31, chosen: 31, responseMs: 3000, now: app.clock.now});
  await app.storage.flush();
  const data = review.snapshot();
  assert.equal(data.cards[30].repetitions, 1);
  assert.equal(data.cards[31].repetitions, 1);
  assert.equal(review.choose([30, 31], null, {now: app.clock.now, random: () => 0.6}), 31,
    '较长用时的音符在这个抽取区间内优先出现');
  assert.equal(review.choose([30, 31], null, {now: app.clock.now, random: () => 0.01}), 30,
    '较短用时的音符仍有非零基础机会');
  app.assertNoErrors();
});
