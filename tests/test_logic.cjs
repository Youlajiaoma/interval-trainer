'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('./helpers/app-harness.cjs');
const context = {window: {}};
for (const file of ['logic.js', 'review.js']) vm.runInNewContext(readSource(file), context);
const {IntervalLogic: logic, IntervalReview: reviewApi} = context.window;

// Independent musical expectations; do not derive expected distances from the
// implementation's INTERVALS table. The existing tritone spelling is an A4.
const expectedIntervals = [[0, 0], [1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3],
  [7, 4], [8, 5], [9, 5], [10, 6], [11, 6], [12, 7]];
function parseNote(label) {
  const match = /^([A-G])(𝄫|𝄪|♭|♯)?(-?\d+)$/.exec(label);
  assert(match, '应生成可识别的音名：' + label);
  const [, letter, sign = '', octaveText] = match;
  const octave = Number(octaveText);
  const alteration = {'': 0, '♯': 1, '♭': -1, '𝄪': 2, '𝄫': -2}[sign];
  return {midi: 12 * (octave + 1) + {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11}[letter] + alteration,
    position: octave * 7 + 'CDEFGAB'.indexOf(letter)};
}

test('793 组音程拼写同时符合实际音高和音名字母间距', () => {
  assert.equal(logic.INTERVALS.length, expectedIntervals.length);
  for (let root = 36; root <= 96; root++) for (const [semitones, steps] of expectedIntervals) {
    const interval = logic.INTERVALS.find(item => item.semitones === semitones);
    assert(interval);
    const [lower, upper] = logic.spellPair(root, interval).map(parseNote);
    assert.equal(lower.midi, root);
    assert.equal(upper.midi - lower.midi, semitones);
    assert.equal(upper.position - lower.position, steps);
  }
});

test('各音区及随机端点生成的题目均保持在所选范围内', () => {
  for (const [low, high] of [[36, 48], [48, 60], [60, 72], [84, 96]]) {
    for (const [semi] of expectedIntervals) for (const edge of [0, .999999]) {
      const question = logic.makeQuestion([semi], low, high, null, () => edge);
      assert(question);
      assert(question.low >= low && question.high <= high);
      assert.equal(question.high - question.low, semi);
      assert.equal(question.semitones, semi);
    }
  }
  assert.equal(logic.makeQuestion([12], 60, 65, null), null);
});

test('旋律的上行、下行统计独立，同时保留合计和刷新后的记录', () => {
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
  const review = reviewApi.createReviewManager(storage, 'directions', {directional: true});
  const now = new Date(2026, 9, 15, 10).getTime();
  review.record({actual: 6, chosen: 3, direction: 1, now});
  review.record({actual: 6, chosen: 6, direction: -1, now: now + 1000});
  const restored = reviewApi.createReviewManager(storage, 'directions', {directional: true});
  const stats = restored.statistics('all', now + 2000);
  assert.equal(stats.totals.answered, 2); assert.equal(stats.totals.correct, 1);
  const up = stats.byDirection.find(row => row.semi === 6 && row.direction === 1);
  const down = stats.byDirection.find(row => row.semi === 6 && row.direction === -1);
  assert.equal(up.answered, 1); assert.equal(up.correct, 0);
  assert.equal(down.answered, 1); assert.equal(down.correct, 1);
});
