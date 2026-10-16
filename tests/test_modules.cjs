'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp} = require('./helpers/app-harness.cjs');
const {keys, seededDatabase} = require('./helpers/fixtures.cjs');

async function appFor(t) {
  const app = await createApp({database:seededDatabase()});
  t.after(() => app.assertNoErrors());
  return app;
}

test('模块目录保留原有九个存储名称、五份记录范围及四个备份字段', async t => {
  const app = await appFor(t), catalog = app.window.TonaloomModules;
  assert.deepEqual(Array.from(catalog.storageKeys).sort(), Object.values(keys).sort());
  assert.deepEqual(Array.from(catalog.reviewDefinitions, item => item.maxIndex), [12, 12, 62, 62, 12]);
  assert.deepEqual(Array.from(catalog.list, item => item.backupField), ['harmonic', 'melodic', 'sight', 'staffInterval']);
  assert.equal(app.window.IntervalPwaStorage.REVIEW_KEY, keys.harmonic);
  assert.equal(app.window.IntervalPwaStorage.SIGHT_TREBLE_KEY, keys.treble);
  assert.equal(app.window.IntervalPwaStorage.STAFF_REVIEW_KEY, keys.staff);
  for (const definition of catalog.list) {
    const module = catalog.get(definition.id);
    for (const method of ['enter','openSettings','isActive','backup','backupEntries','clearHistory']) assert.equal(typeof module[method], 'function');
  }
});

test('四模块共用入口仍能进入对应设置和返回首页，不产生额外记录', async t => {
  const app = await appFor(t), before = await app.backup();
  for (const [entry, dialog, title] of [
    ['home-harmonic', 'settings-dialog', '和声音程'], ['home-melodic', 'settings-dialog', '旋律音程'],
    ['home-sight', 'sight-settings-dialog', '音符辨认'], ['home-staff-interval', 'staff-interval-settings', '音程辨认']
  ]) {
    await app.click(entry); await app.click('open-settings');
    assert(app.get(dialog).open);
    assert.equal(app.get('practice-mode-title').textContent, title);
    await app.click('back-home');
    assert(!app.get('home-screen').classList.contains('hidden'));
    assert(!app.get(dialog).open);
  }
  const after = await app.backup();
  for (const field of ['harmonic','melodic','sight']) assert.deepEqual(after[field], before[field]);
  assert.deepEqual(after.staffInterval.review, before.staffInterval.review);
});

test('统计全部十六种切换路径中，清空与日期选择始终作用于当前类别', async t => {
  const modes = ['harmonic', 'melodic', 'sight', 'staff'];
  for (const from of modes) for (const to of modes) {
    const app = await appFor(t), before = await app.backup();
    await app.click('home-stats'); await app.click('stats-'+from); await app.click('stats-'+to);
    assert.equal(app.window.TonaloomModules.statisticsMode, to);
    for (const mode of modes) assert.equal(app.get('stats-'+mode).getAttribute('aria-pressed'), String(mode === to));
    app.get('stats-period').value = '7';
    app.get('stats-period').dispatchEvent({type:'change'}); await app.settle();
    assert.equal(app.get('stats-performance-title').textContent, to === 'sight' ? '各音符表现' : '各音程表现');
    await app.click('clear-review');
    const after = await app.backup();
    for (const [mode, field] of [['harmonic','harmonic'],['melodic','melodic'],['sight','sight'],['staff','staffInterval']]) {
      if (mode !== to) assert.deepEqual(after[field], before[field], `${from} → ${to} 不影响 ${mode}`);
      else if (mode === 'sight') assert.equal(after.sight.treble.totalAnswers+after.sight.bass.totalAnswers, 0);
      else assert.equal((mode === 'staff' ? after[field].review : after[field]).totalAnswers, 0);
    }
  }
});
