'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp, createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys, seededDatabase} = require('./helpers/fixtures.cjs');
const allMelodic = Array.from({length: 12}, (_, i) => i + 1);

async function openApp(t, options) {
  const app = await createApp(options);
  t.after(() => app.assertNoErrors());
  return app;
}

const startupCases = [
  ['仅选纯一度的旧设置', {enabled: [0]}, [0], allMelodic],
  ['原来处于旋律模式的纯一度旧设置', {mode: 'melodic', enabled: [0]}, [0], allMelodic],
  ['已分模块但旋律只选纯一度的设置', {schema: 2, activeModule: 'melodic', modules: {
    harmonic: {enabled: [0]}, melodic: {enabled: [0]}
  }}, [0], allMelodic],
  ['旧设置混合可用音程与纯一度', {enabled: [0, 4, 7]}, [0, 4, 7], [4, 7]],
  ['旋律选择为空的设置', {schema: 2, modules: {
    harmonic: {enabled: [0]}, melodic: {enabled: []}
  }}, [0], allMelodic],
  ['已有正常的模块选择', {schema: 2, modules: {
    harmonic: {enabled: [0, 12]}, melodic: {enabled: [3, 8]}
  }}, [0, 12], [3, 8]],
  ['含重复或无效值但仍有可用音程的设置', {schema: 2, modules: {
    harmonic: {enabled: [0]}, melodic: {enabled: [0, 7, 7, '4', 3.5, -1, 13]}
  }}, [0], [7]]
];

for (const [name, settings, harmonic, melodic] of startupCases) {
  test(`${name}可进入旋律、打开设置、答题并重新载入`, async t => {
    const database = createMemoryDatabase(new Map([[keys.settings, JSON.stringify(settings)]]));
    let app = await openApp(t, {database});
    const before = await app.backup();
    assert.deepEqual(before.settings.modules.harmonic.enabled, harmonic);
    assert.deepEqual(before.settings.modules.melodic.enabled, melodic);
    assert.equal(before.harmonic.totalAnswers + before.melodic.totalAnswers, 0);
    await app.click('home-melodic');
    assert(!app.get('practice').classList.contains('hidden'));
    await app.click('open-settings');
    assert(app.get('settings-dialog').open);
    assert.equal(app.get('enabled-count').textContent, `已选 ${melodic.length} 种`);
    await app.click('settings-done');
    await app.answer('answer-grid', melodic[0]);
    const after = await app.backup();
    assert.equal(after.melodic.totalAnswers, 1);
    assert(melodic.includes(after.melodic.history[0].actual));
    assert.equal(after.harmonic.totalAnswers, 0);
    app = await openApp(t, {database});
    const restored = await app.backup();
    assert.deepEqual(restored.settings.modules.melodic.enabled, melodic);
    assert.deepEqual(restored.melodic, after.melodic);
    await app.click('home-harmonic');
    assert(app.get('answer-grid').querySelectorAll('button').some(button => Number(button.dataset.answer) === 0),
      '和声仍允许选择纯一度');
  });
}

for (const version of [1, 2, 3]) {
  test(`第 ${version} 版备份中的纯一度旧设置恢复后，可继续旋律练习且保留历史`, async t => {
    const database = seededDatabase();
    const app = await openApp(t, {database});
    const before = await app.backup();
    const backup = {...before, version, settings: {enabled: [0], volume: 37, autoPlayNext: false}};
    if (version === 1) backup.review = before.harmonic;
    await app.importBackup(backup);
    assert.equal(app.window.reloads, 1);
    const restored = await openApp(t, {database});
    const after = await restored.backup();
    assert.deepEqual(after.settings.modules.harmonic.enabled, [0]);
    assert.deepEqual(after.settings.modules.melodic.enabled, allMelodic);
    assert.equal(after.settings.modules.melodic.volume, 37);
    assert.equal(after.settings.modules.melodic.autoPlayNext, false);
    for (const category of ['harmonic', 'melodic', 'sight', 'staffInterval']) assert.deepEqual(after[category], before[category]);
    await restored.click('home-melodic'); await restored.click('open-settings');
    assert(restored.get('settings-dialog').open);
  });
}

test('从旧设置恢复后，可调整旋律选择，保留最后一种音程并保存', async t => {
  const database = createMemoryDatabase(new Map([[keys.settings, JSON.stringify({enabled: [0]})]]));
  const app = await openApp(t, {database});
  await app.click('home-melodic'); await app.click('open-settings');
  const toggle = semi => app.get('interval-toggles').children.find(button => button.textContent === app.window.IntervalLogic.INTERVALS[semi].name);
  for (const semi of allMelodic.filter(value => value !== 7)) {
    toggle(semi).click(); await app.settle();
  }
  assert.equal(app.get('enabled-count').textContent, '已选 1 种');
  toggle(7).click(); await app.settle();
  assert.match(app.get('toast').textContent, /至少需要选择一种/);
  const backup = await app.backup();
  assert.deepEqual(backup.settings.modules.melodic.enabled, [7]);
  assert.deepEqual(backup.settings.modules.harmonic.enabled, [0]);
  const reloaded = await openApp(t, {database});
  await reloaded.click('home-melodic');
  await reloaded.answer('answer-grid', 7);
  const record = (await reloaded.backup()).melodic;
  assert.equal(record.totalAnswers, 1);
  assert.equal(record.history[0].actual, 7);
  assert.equal(record.cards[7].correct, 1);
});
