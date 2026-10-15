'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp} = require('./helpers/app-harness.cjs');
const {keys, reviewStore, seededDatabase, sightSession} = require('./helpers/fixtures.cjs');

async function openApp(t, options) {
  const app = await createApp(options);
  t.after(() => app.assertNoErrors());
  return app;
}

async function changedBackup(app) {
  // Include the staff exercise in addition to its review history.
  await app.click('home-staff-interval');
  await app.click('back-home');
  const backup = await app.backup();
  backup.settings.activeModule = 'melodic';
  backup.settings.modules.harmonic.enabled = [3, 4];
  backup.settings.modules.melodic.enabled = [5, 7];
  backup.harmonic = reviewStore({actual: 9, chosen: 8, count: 2});
  backup.melodic = reviewStore({actual: 7, chosen: 6, directional: true, count: 3});
  backup.sight.treble = reviewStore({actual: 62, chosen: 61, maxIndex: 62, count: 2});
  backup.sight.bass = reviewStore({actual: 61, chosen: 62, maxIndex: 62, count: 3});
  backup.sight.settings = {clef: 'bass', accidentals: true};
  backup.staffInterval.review = reviewStore({actual: 8, chosen: 7, count: 4});
  return backup;
}

async function stateOf(app) {
  const records = new Map(app.database.records);
  return {records, cache: new Map(Object.values(keys).map(key => [key, app.storage.getItem(key)])),
    live: await app.backup()};
}

async function assertUnchanged(app, before) {
  assert.equal(app.window.reloads, 0, '失败或取消时不应刷新页面');
  assert.deepEqual(app.database.records, before.records, '保存的记录不能被部分替换');
  for (const [key, value] of before.cache) assert.equal(app.storage.getItem(key), value, '内存中的保存副本也不能改变：' + key);
  assert.deepEqual(await app.backup(), before.live, '正在使用的设置和记录不能改变');
}

test('完整备份在另一份数据中恢复四模块记录、错题、复习安排和设置', async t => {
  const source = await openApp(t, {database: seededDatabase()});
  const backup = await changedBackup(source);
  const database = seededDatabase();
  const session = JSON.stringify(sightSession());
  database.records.set(keys.sightSession, session);
  const target = await openApp(t, {database});
  await target.importBackup(backup);
  assert.equal(target.window.reloads, 1);
  const reloaded = await openApp(t, {database});
  assert.deepEqual(await reloaded.backup(), backup, '恢复后再次导出应保留完整内容');
  assert.equal(database.records.get(keys.sightSession), session, '备份未包含的音符当前题组保持不变');
  assert.deepEqual(JSON.parse(database.records.get(keys.staffSession)),
    {setting: backup.staffInterval.setting, set: backup.staffInterval.set});
});

for (const version of [1, 2, 3]) {
  test(`第 ${version} 版备份只替换所包含的模块，保留其他模块记录`, async t => {
    const app = await openApp(t, {database: seededDatabase()});
    await app.click('home-staff-interval');
    await app.click('back-home');
    const before = await app.backup();
    const harmonic = reviewStore({actual: 10, count: 2});
    const melodic = reviewStore({actual: 5, directional: true, count: 3});
    const backup = {format: 'interval-trainer-backup', version, settings: {enabled: [3, 4]},
      ...(version === 1 ? {review: harmonic} : {harmonic, melodic})};
    await app.importBackup(backup);
    assert.equal(app.window.reloads, 1);
    const reloaded = await openApp(t, {database: app.database});
    const after = await reloaded.backup();
    assert.deepEqual(after.harmonic, harmonic);
    assert.deepEqual(after.melodic, version === 1 ? before.melodic : melodic);
    assert.deepEqual(after.sight, before.sight);
    assert.deepEqual(after.staffInterval, before.staffInterval);
    for (const mode of ['harmonic', 'melodic']) assert.deepEqual(after.settings.modules[mode].enabled, [3, 4]);
  });
}

test('旧版自然音备份恢复后，音符编号按原有规则转换而不丢失', async t => {
  const app = await openApp(t, {database: seededDatabase()});
  const backup = await app.backup();
  for (const clef of ['treble', 'bass']) {
    backup.sight[clef] = reviewStore({actual: 14, chosen: 13, maxIndex: 20});
  }
  await app.importBackup(backup);
  assert.equal(app.window.reloads, 1);
  const reloaded = await openApp(t, {database: app.database});
  const after = await reloaded.backup();
  for (const [clef, actual, chosen] of [['treble', 54, 51], ['bass', 57, 54]]) {
    const store = after.sight[clef];
    assert.equal(store.cardRange, 63);
    assert.equal(store.totalAnswers, 1);
    assert.equal(store.cards[actual].wrong, 1);
    assert.equal(store.confusions[`${actual}>${chosen}`], 1);
    assert.equal(store.history[0].actual, actual);
    assert.equal(store.history[0].chosen, chosen);
    assert.equal(Object.values(store.daily)[0].intervals[actual].answered, 1);
  }
});

const invalidParts = [
  ['练习设置', backup => { backup.settings.modules.melodic.enabled = [-1]; }],
  ['和声记录', backup => { backup.harmonic.version = 999; }],
  ['旋律记录', backup => { backup.melodic.version = 999; }],
  ['高音谱号记录', backup => { backup.sight.treble.version = 999; }],
  ['低音谱号记录', backup => { backup.sight.bass.version = 999; }],
  ['音程辨认记录', backup => { backup.staffInterval.review.version = 999; }]
];
for (const [name, damage] of invalidParts) {
  test(`${name}无效时，导入不改变已保存数据或当前页面记录`, async t => {
    const app = await openApp(t, {database: seededDatabase()});
    const backup = await changedBackup(app);
    const before = await stateOf(app);
    damage(backup);
    await app.importBackup(backup);
    assert.match(app.get('toast').textContent, /导入失败/);
    await assertUnchanged(app, before);
  });
}

for (const synchronous of [false, true]) {
  test(`导入${synchronous ? '提交前抛错' : '最后一项写入失败'}时全部保留，随后可以重试`, async t => {
    const app = await openApp(t, {database: seededDatabase()});
    const backup = await changedBackup(app);
    const before = await stateOf(app);
    // A complete v3 import writes eight entries; fail after staging seven.
    app.database.failNextWrite({after: synchronous ? 1 : 7, synchronous});
    await app.importBackup(backup);
    assert.match(app.get('toast').textContent, /导入失败/);
    await assertUnchanged(app, before);
    await app.importBackup(backup);
    assert.equal(app.window.reloads, 1, '临时导入失败不应阻止重试');
    const reloaded = await openApp(t, {database: app.database});
    assert.deepEqual(await reloaded.backup(), backup);
  });
}

test('取消文件导入确认时，四模块记录、设置和题组保持不变', async t => {
  const app = await openApp(t, {database: seededDatabase()});
  const backup = await changedBackup(app);
  const before = await stateOf(app);
  app.window.confirm = () => false;
  await app.importFile(JSON.stringify(backup));
  await assertUnchanged(app, before);
});
