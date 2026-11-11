'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp, createMemoryDatabase} = require('./helpers/app-harness.cjs');
const KEY = 'tonaloom-singing-settings-v1';
async function appFor(t, options) { const app = await createApp(options); t.after(() => app.assertNoErrors()); return app; }
test('模唱入口、设置和返回共用现有导航，进入不播放也不请求麦克风', async t => {
  const app = await appFor(t), before = await app.backup();
  await app.click('home-singing');
  assert(!app.get('singing-practice').classList.contains('hidden'));
  assert.equal(app.get('practice-mode-title').textContent, '模唱');
  assert.equal(app.audioEvents.filter(event => event.type === 'start').length, 0);
  assert.equal(app.get('singing-frequency').textContent, '— Hz');
  await app.click('open-settings'); assert(app.get('singing-settings').open);
  assert.equal(app.get('singing-low').value, '48'); assert.equal(app.get('singing-high').value, '72');
  await app.click('singing-settings-done'); await app.click('back-home');
  assert(app.get('singing-practice').classList.contains('hidden'));
  assert.deepEqual((await app.backup()).singing, before.singing);
});
test('音域包含端点及半音，重播使用同一音高，下一题和音域改变停止旧钢琴', async t => {
  const app = await appFor(t, {database:createMemoryDatabase(new Map([[KEY,JSON.stringify({low:60,high:61,volume:65})]]))});
  await app.click('home-singing'); await app.click('singing-play');
  const first = app.audioEvents.filter(event => event.type === 'start').at(-1).midi;
  assert([60,61].includes(first));
  const start = app.audioEvents.find(event => event.type === 'start'), end = app.audioEvents.find(event => event.type === 'stop');
  assert(Math.abs(end.at - start.at - 1.5) < 1e-9, '钢琴恢复最初的1.5秒播放时长');
  assert.equal(start.rate, 1, '保持原音高和原速，不通过加速缩短');
  await app.click('singing-play'); assert.equal(app.audioEvents.filter(event => event.type === 'start').at(-1).midi, first);
  await app.click('singing-next'); assert.equal(app.audioEvents.filter(event => event.type === 'start').at(-1).midi, first === 60 ? 61 : 60);
  await app.click('open-settings');
  app.get('singing-low').value = '84'; app.get('singing-low').dispatchEvent({type:'change'}); await app.settle();
  assert.equal(app.get('singing-high').value, '84');
  await app.click('singing-settings-done'); await app.click('singing-play');
  assert.equal(app.audioEvents.filter(event => event.type === 'start').at(-1).midi, 84);
  await app.click('back-home'); assert(app.audioEvents.filter(event => event.type === 'stop').length > 0);
});
test('不支持麦克风时说明启动方式，不产生答题记录', async t => {
  const app = await appFor(t); await app.click('home-singing'); await app.click('singing-play');
  assert.match(app.get('singing-error').textContent, /HTTPS.*localhost/);
  assert.equal((await app.backup()).singing.review.totalAnswers, 0);
});
test('模唱设置与记录随备份恢复，旧备份缺少模唱和任务时保留本机数据', async t => {
  const source = await appFor(t, {database:createMemoryDatabase(new Map([[KEY,JSON.stringify({low:55,high:67,volume:42})]]))});
  const manager = source.window.TonaloomModules.get('singing').reviewManager();
  manager.record({actual:1, chosen:1, low:61, high:61, timbre:'piano'}); await source.settle();
  const backup = await source.backup(), target = await appFor(t);
  await target.importBackup(backup);
  const reloaded = await appFor(t, {database:target.database});
  assert.deepEqual((await reloaded.backup()).singing, backup.singing);
  const goals = reloaded.window.TonaloomDailyTasks.backup();
  goals.singing = {enabled:true,target:30};
  reloaded.storage.setItem('tonaloom-daily-tasks-v1', JSON.stringify(goals)); await reloaded.settle();
  const old = await source.backup(); delete old.singing; delete old.dailyTasks.singing;
  await reloaded.importBackup(old);
  assert.deepEqual(JSON.parse(reloaded.storage.getItem(KEY)), backup.singing.settings);
  assert.equal(JSON.parse(reloaded.storage.getItem('tonaloom-singing-review-v1')).totalAnswers, 1);
  assert.deepEqual(JSON.parse(reloaded.storage.getItem('tonaloom-daily-tasks-v1')).singing, {enabled:true,target:30});
});
test('无效模唱设置备份整份拒绝，现有数据不变；统计显示音高而非音程', async t => {
  const app = await appFor(t), backup = await app.backup(), before = new Map(app.database.records);
  backup.singing.settings.high = 100; await app.importBackup(backup);
  assert.deepEqual(app.database.records, before);
  await app.click('home-stats'); await app.click('stats-singing');
  assert.equal(app.get('stats-performance-title').textContent, '各音高表现');
});
for (const action of ['repeat', 'next', 'leave']) test(`钢琴尚未解码时 ${action}，过期请求不会迟到或叠加播放`, async t => {
  const app = await appFor(t, {database:createMemoryDatabase(new Map([[KEY,JSON.stringify({low:60,high:61,volume:65})]]))});
  const finishes = [];
  app.window.AudioContext.prototype.decodeAudioData = bytes => new Promise(resolve => {
    const midi = new Uint8Array(bytes)[0]; finishes.push(() => resolve({duration:1, midi}));
  });
  await app.click('home-singing'); await app.click('singing-play');
  assert.equal(finishes.length, 1);
  await app.click(action === 'repeat' ? 'singing-play' : action === 'next' ? 'singing-next' : 'back-home');
  if (action === 'next') { assert.equal(finishes.length, 2); finishes[1](); await app.settle(); }
  finishes[0](); await app.settle();
  const starts = app.audioEvents.filter(event => event.type === 'start');
  assert.equal(starts.length, action === 'leave' ? 0 : 1);
});
test('模唱完成量单独计入每日任务，达标后点亮并允许继续练习', async t => {
  const app = await appFor(t);
  await app.click('home-daily-tasks');
  app.get('daily-singing-enabled').checked = true; app.get('daily-singing-enabled').dispatchEvent({type:'change'});
  await app.click('daily-singing-minus'); await app.click('daily-tasks-save'); await app.click('home-singing');
  const manager = app.window.TonaloomModules.get('singing').reviewManager();
  for (let i = 0; i < 10; i++) manager.record({actual:0,chosen:0,low:60,high:60});
  await app.settle();
  assert(app.get('daily-practice-check').classList.contains('is-complete'));
  assert.equal(app.window.TonaloomDailyTasks.progress('singing').count, 10);
  await app.click('singing-next'); assert(!app.get('singing-next').disabled);
  manager.record({actual:0,chosen:0,low:60,high:60}); await app.settle();
  assert.equal(app.window.TonaloomDailyTasks.progress('singing').count, 11);
  assert.equal(app.window.TonaloomModules.get('harmonic').reviewManager().snapshot().totalAnswers, 0);
  await app.click('back-home'); assert.equal(app.get('home-singing-marker').textContent, '✓');
});
