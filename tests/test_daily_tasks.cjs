'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createApp,createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys,reviewStore,sightSession} = require('./helpers/fixtures.cjs');
const tasksKey = 'tonaloom-daily-tasks-v1', ids = ['harmonic','melodic','sight','staff'];
function config(enabled = ids, target = 10) {
  return {...Object.fromEntries(ids.map(id => [id,{enabled:enabled.includes(id),target:enabled.includes(id)?target:0}])),singing:{enabled:false,target:0}};
}
async function appFor(t,options) {
  const app = await createApp(options); t.after(() => app.assertNoErrors()); return app;
}
const settingsDialog = id => ({harmonic:'settings-dialog',melodic:'settings-dialog',sight:'sight-settings-dialog',staff:'staff-interval-settings',singing:'singing-settings'})[id];
const settingsDone = id => ({harmonic:'settings-done',melodic:'settings-done',sight:'sight-settings-done',staff:'staff-interval-settings-done',singing:'singing-settings-done'})[id];
async function openDaily(app,id='harmonic') {
  const module = app.window.TonaloomModules.get(id);
  if (!module.isActive?.()) await app.click(module.homeId);
  if (!app.get(settingsDialog(id)).open) await app.click('open-settings');
}
async function closeSettings(app,id='harmonic') {
  if (app.get(settingsDialog(id)).open) await app.click(settingsDone(id));
}
const progress = (app,id) => app.window.TonaloomDailyTasks.progress(id);
function databaseAtNine() {
  return createMemoryDatabase(new Map([
    [tasksKey,JSON.stringify(config())],
    [keys.settings,JSON.stringify({schema:2,modules:{harmonic:{enabled:[4],autoPlayNext:false},melodic:{enabled:[7],autoPlayNext:false}}})],
    [keys.harmonic,JSON.stringify(reviewStore({count:9}))],
    [keys.melodic,JSON.stringify(reviewStore({actual:7,directional:true,count:9}))],
    [keys.treble,JSON.stringify(reviewStore({actual:30,maxIndex:62,count:5}))],
    [keys.bass,JSON.stringify(reviewStore({actual:30,maxIndex:62,count:4}))],
    [keys.sightSession,JSON.stringify(sightSession())],
    [keys.staff,JSON.stringify(reviewStore({actual:3,count:9}))]
  ]));
}
test('daily goals autosave independently per module',async t => {
  const html = fs.readFileSync(path.join(__dirname,'../site/index.html'),'utf8');
  assert.doesNotMatch(html,/id="daily-[a-z]+-save"/,'daily goals do not need a Save button');
  assert(!html.includes('id="home-daily-tasks"') && !html.includes('id="daily-tasks-dialog"'));
  for (const [id,stats] of [['harmonic','open-stats'],['melodic','open-stats'],['sight','sight-open-stats'],['staff','staff-open-stats'],['singing','singing-open-stats']]) {
    assert(html.indexOf(`id="daily-${id}-settings"`) < html.indexOf(`id="${stats}"`),`${id} 每日任务应在统计上方`);
  }
  for (const id of ['open-stats','sight-open-stats','staff-open-stats','singing-open-stats']) {
    const tag = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];
    assert(tag?.includes('open-stats-button'),`${id} 应使用共用统计按钮样式`);
  }

  const database = createMemoryDatabase(), app = await appFor(t,{database});
  const expectedTargets = Object.fromEntries(['harmonic','melodic','sight','staff','singing'].map(id=>[id,0]));
  for (const id of ['harmonic','melodic','sight','staff','singing']) {
    await openDaily(app,id);
    const prefix = 'daily-' + id;
    assert.equal(app.get(prefix+'-target').textContent,'0');
    assert(app.get(prefix+'-minus').disabled,'0题时不能继续减少');
    await app.click(prefix+'-plus');
    assert.equal(app.get(prefix+'-target').textContent,'10');
    if (id === 'harmonic') {
      for (let i=0;i<12;i++) await app.click(prefix+'-plus');
      assert.equal(app.get(prefix+'-target').textContent,'130','题量不应受100题等人为上限限制');
      assert(!app.get(prefix+'-plus').disabled);
    }
    assert(progress(app,id).enabled,'adjustment should autosave the goal');
    expectedTargets[id] = id === 'harmonic' ? 130 : 10;
    for (const other of Object.keys(expectedTargets)) assert.equal(progress(app,other).target,expectedTargets[other],`设置 ${id} 不应改变其他模块`);
    await closeSettings(app,id); await app.click('back-home');
  }

  await openDaily(app,'harmonic');
  for (let i=0;i<13;i++) await app.click('daily-harmonic-minus');
  assert.equal(app.get('daily-harmonic-target').textContent,'0');
  assert(app.get('daily-harmonic-minus').disabled);
  assert(!progress(app,'harmonic').enabled && progress(app,'harmonic').target===0);
  const refreshed = await appFor(t,{database});
  assert.deepEqual(JSON.parse(JSON.stringify(refreshed.window.TonaloomDailyTasks.backup())),JSON.parse(app.storage.getItem(tasksKey)));
});
for (const id of ids) test(`${id} 达标立即点亮，主页同步打勾，达标后仍能继续练习`,async t => {
  const app = await appFor(t,{database:databaseAtNine()});
  assert.equal(progress(app,id).count,9); assert(!progress(app,id).complete);
  const entry = app.window.TonaloomModules.get(id).homeId;
  await app.click(entry);
  assert(!app.get('daily-practice-check').classList.contains('hidden'));
  assert(!app.get('daily-practice-check').classList.contains('is-complete'));
  async function answer() {
    if (id === 'harmonic' || id === 'melodic') await app.answer('answer-grid',id === 'harmonic' ? 4 : 7);
    else if (id === 'sight') { await app.click('sight-reveal'); await app.advance(500); }
    else {
      const current = app.window.StaffIntervalTrainer.backup().set;
      await app.answer('staff-interval-options',current.questions[current.pos].semitones);
    }
  }
  await answer(); assert.equal(progress(app,id).count,10); assert(progress(app,id).complete);
  assert(app.get('daily-practice-check').classList.contains('is-complete'));
  if (id === 'harmonic' || id === 'melodic') await app.click('next-question');
  else if (id === 'staff') await app.advance(1000);
  await answer(); assert.equal(progress(app,id).count,11);
  await app.click('back-home'); assert.equal(app.get(entry+'-marker').textContent,'✓');
  assert(app.get('daily-practice-check').classList.contains('hidden'));
  for (const other of ids.filter(other => other !== id)) assert.equal(progress(app,other).count,9);
});
test('显示答案只计一次；左右按钮独立，未答题点下一题不提交答案',async t => {
  const app = await appFor(t,{database:databaseAtNine()}); await app.click('home-harmonic');
  assert(app.get('next-question').classList.contains('hidden'));
  await app.click('next-question'); assert.equal(progress(app,'harmonic').count,9);
  await app.click('reveal-answer'); await app.click('reveal-answer');
  assert.equal(progress(app,'harmonic').count,10);
  assert(app.get('reveal-answer').classList.contains('hidden'));
  assert(!app.get('next-question').classList.contains('hidden'));
  await app.click('next-question'); await app.click('next-question');
  assert.equal(progress(app,'harmonic').count,10);
  assert(!app.get('reveal-answer').classList.contains('hidden'));
});
test('按当地日期跨天重新计算任务，已完成记录和目标设置保留',async t => {
  const database = databaseAtNine(), app = await appFor(t,{database});
  await app.click('home-harmonic'); await app.answer('answer-grid',4);
  assert(progress(app,'harmonic').complete);
  const before = database.records.get(keys.harmonic), goal = database.records.get(tasksKey);
  const now = new Date(app.clock.now), midnight = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime();
  await app.advance(midnight-app.clock.now+30);
  assert.equal(progress(app,'harmonic').count,0);
  assert(!app.get('daily-practice-check').classList.contains('is-complete'));
  assert.equal(app.get('home-harmonic-marker').textContent,'→');
  assert.equal(database.records.get(keys.harmonic),before); assert.equal(database.records.get(tasksKey),goal);
});
test('把任务设为0只关闭目标，不清除已完成题目；重新增加可继续达标',async t => {
  const app = await appFor(t,{database:databaseAtNine()}); await app.click('home-harmonic'); await app.answer('answer-grid',4);
  assert(progress(app,'harmonic').complete); await app.click('back-home');
  await openDaily(app); await app.click('daily-harmonic-minus');
  assert(!progress(app,'harmonic').enabled);
  assert.equal(JSON.parse(app.storage.getItem(keys.harmonic)).totalAnswers,10);
  await closeSettings(app); await app.click('back-home');
  await openDaily(app); await app.click('daily-harmonic-plus');
  assert(progress(app,'harmonic').complete); assert.equal(progress(app,'harmonic').count,10);
});
test('任务设置随备份恢复，旧备份保留本机任务设置，无效任务不能覆盖任何记录',async t => {
  const source = await appFor(t,{database:databaseAtNine()}), backup = await source.backup();
  const target = await appFor(t); await target.importBackup(backup);
  assert.deepEqual(JSON.parse(target.storage.getItem(tasksKey)),config());
  const old = {...backup}; delete old.dailyTasks;
  await target.importBackup(old); assert.deepEqual(JSON.parse(target.storage.getItem(tasksKey)),config());
  for (const value of [null,{},config(ids,15),{...config(),harmonic:{enabled:'yes',target:10}}]) {
    const before = new Map(target.database.records);
    await target.importBackup({...backup,dailyTasks:value});
    assert.deepEqual(target.database.records,before);
  }
});
test('另一窗口答题和调整目标后同步完成状态，两个窗口的答题量共同累计',async t => {
  const database = databaseAtNine(), a = await appFor(t,{database}), b = await appFor(t,{database});
  await a.click('home-harmonic'); await b.click('home-harmonic'); await a.answer('answer-grid',4); await b.settle();
  assert(b.get('daily-practice-check').classList.contains('is-complete'));
  await b.answer('answer-grid',4); await a.settle(); assert.equal(progress(a,'harmonic').count,11);
  await a.click('back-home'); await openDaily(a); await a.click('daily-harmonic-plus'); await b.settle();
  assert(!b.get('daily-practice-check').classList.contains('is-complete'));
  assert.equal(progress(b,'harmonic').target,20);
});
test('autosave failure is reported and a later adjustment is saved',async t => {
  const database = createMemoryDatabase(), app = await appFor(t,{database});
  await openDaily(app); database.failNextWrite({after:0}); await app.click('daily-harmonic-plus');
  assert(!app.get('daily-harmonic-error').classList.contains('hidden'));
  assert.equal(app.get('daily-harmonic-target').textContent,'10');
  assert.equal(app.storage.getItem(tasksKey),null);
  assert(!progress(app,'harmonic').enabled);
  await app.click('daily-harmonic-plus');
  assert(progress(app,'harmonic').enabled);
  assert.equal(progress(app,'harmonic').target,20);
});

test('rapid daily-goal taps all persist',async t => {
  const app = await appFor(t); await openDaily(app);
  const plus=app.get('daily-harmonic-plus'); plus.click(); plus.click(); plus.click();
  await app.settle();
  assert.equal(app.get('daily-harmonic-target').textContent,'30');
  assert.equal(progress(app,'harmonic').target,30);
});
