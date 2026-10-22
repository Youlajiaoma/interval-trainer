'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp, createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys} = require('./helpers/fixtures.cjs');

const bounds = {
  treble: {bottom: 30, top: 38},
  bass: {bottom: 18, top: 26}
};

async function start(t, clef, rangeBelow, rangeAbove) {
  const settings = {clef, accidentals:false, rangeBelow, rangeAbove};
  const database = createMemoryDatabase(new Map([[keys.sightSettings, JSON.stringify(settings)]]));
  const app = await createApp({database});
  t.after(() => app.assertNoErrors());
  await app.click('home-sight');
  return app;
}

function assertRange(app, clef, rangeBelow, rangeAbove) {
  const session = JSON.parse(app.database.records.get(keys.sightSession));
  const {bottom, top} = bounds[clef];
  const low = bottom - rangeBelow * 2;
  const high = top + rangeAbove * 2;
  const notes = session.notes.filter(note => note.clef === clef);
  assert(notes.length > 0);
  assert(notes.every(note => note.index >= low && note.index <= high),
    `${clef} notes should stay between staff positions ${low} and ${high}`);
}

test('音符范围设置限制高音谱号和低音谱号的新题组，旧设置仍默认完整范围', async t => {
  const treble = await start(t, 'treble', 1, 2);
  assertRange(treble, 'treble', 1, 2);
  const bass = await start(t, 'bass', 2, 1);
  assertRange(bass, 'bass', 2, 1);
  const legacy = await start(t, 'treble', undefined, undefined);
  assertRange(legacy, 'treble', 3, 3);
});

test('调整音符范围会保存，并随备份导出和恢复', async t => {
  const app = await start(t, 'treble', 1, 1);
  await app.click('open-settings');
  const below = app.get('sight-range-below');
  const above = app.get('sight-range-above');
  assert.equal(below.value, '1');
  assert.equal(above.value, '1');
  below.value = '2'; below.dispatchEvent({type:'change'});
  above.value = '3'; above.dispatchEvent({type:'change'});
  await app.settle();

  const exported = await app.backup();
  assert.deepEqual(exported.sight.settings, {
    clef:'treble', accidentals:false, rangeBelow:2, rangeAbove:3
  });
  await app.importBackup(exported);
  const restored = await createApp({database:app.database});
  await restored.click('home-sight');
  assertRange(restored, 'treble', 2, 3);
  restored.assertNoErrors();
});
