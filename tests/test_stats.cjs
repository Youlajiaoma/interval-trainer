'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp} = require('./helpers/app-harness.cjs');
const {keys, reviewStore, seededDatabase} = require('./helpers/fixtures.cjs');

function databaseWithSightMistakes() {
  const database = seededDatabase();
  database.records.set(keys.treble, JSON.stringify(reviewStore({actual: 30, chosen: 29, maxIndex: 62})));
  database.records.set(keys.bass, JSON.stringify(reviewStore({actual: 45, chosen: 44, maxIndex: 62})));
  return database;
}

function assertSightCleared(backup) {
  for (const clef of ['treble', 'bass']) {
    const record = backup.sight[clef];
    assert.equal(record.totalAnswers, 0);
    for (const field of ['cards', 'confusions', 'daily']) assert.deepEqual(record[field], {}, clef + ' 的 ' + field + ' 应清空');
    assert.deepEqual(record.history, []);
    assert.equal(record.cardRange, 63, '清空后仍应支持完整的音符记录范围');
  }
}

function assertOtherModulesUnchanged(before, after) {
  for (const category of ['harmonic', 'melodic', 'staffInterval']) assert.deepEqual(after[category], before[category]);
  assert.deepEqual(after.settings, before.settings);
  assert.deepEqual(after.sight.settings, before.sight.settings);
}

for (const [mode, label] of [['harmonic', '和声'], ['melodic', '旋律'], ['staff', '音程辨认']]) {
  test('从' + label + '切到音符统计后清空，只清除两个谱号的历史并保存', async () => {
    const database = databaseWithSightMistakes();
    const app = await createApp({database});
    const before = await app.backup();
    await app.click('home-stats'); await app.click('stats-' + mode); await app.click('stats-sight');
    const kpis = () => app.get('sight-stats-content').children[0].children.map(item => item.children[1].textContent);
    assert.equal(kpis()[0], '2', '清空前应显示两个谱号的记录');
    await app.click('clear-review');
    const after = await app.backup();
    assertSightCleared(after);
    assertOtherModulesUnchanged(before, after);
    assert.deepEqual(kpis(), ['0', '—', '0', '0'], '当前页面的计数应立即更新');
    assert(app.get('stats-dialog').open);
    assert(app.get('stats-sight').classList.contains('active'));
    const reloaded = await createApp({database});
    const persisted = await reloaded.backup();
    assertSightCleared(persisted);
    assertOtherModulesUnchanged(before, persisted);
    app.assertNoErrors(); reloaded.assertNoErrors();
  });
}

test('从音符练习设置进入统计，取消清空不改数据，确认后仍保留当前练习', async () => {
  const database = databaseWithSightMistakes();
  const app = await createApp({database});
  await app.click('home-sight'); await app.click('open-settings'); await app.click('sight-open-stats');
  assert(app.get('stats-sight').classList.contains('active'));
  const before = await app.backup();
  const storedBefore = [...database.records];
  app.window.confirm = () => false;
  await app.click('clear-review');
  assert.deepEqual(await app.backup(), before, '取消时不能清空任一类别');
  assert.deepEqual([...database.records], storedBefore, '取消时不能写入清空后的数据');
  app.window.confirm = () => true;
  await app.click('clear-review');
  const after = await app.backup();
  assertSightCleared(after);
  assertOtherModulesUnchanged(before, after);
  assert.equal(database.records.get(keys.sightSession), new Map(storedBefore).get(keys.sightSession), '当前练习题组不应被清空历史替换');
  await app.click('close-stats');
  await app.click('home-stats');
  assert(!app.get('stats-dialog').classList.contains('sight-stats-active'), '重新打开默认统计时不能沿用音符统计状态');
  app.assertNoErrors();
});
