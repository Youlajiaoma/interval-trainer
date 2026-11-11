'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp,createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys,reviewStore,sightSession} = require('./helpers/fixtures.cjs');
const tasksKey = 'tonaloom-daily-tasks-v1', ids = ['harmonic','melodic','sight','staff'];
function config(enabled = ids, target = 10) {
  return {...Object.fromEntries(ids.map(id => [id,{enabled:enabled.includes(id),target}])),singing:{enabled:false,target:20}};
}
async function appFor(t,options) {
  const app = await createApp(options); t.after(() => app.assertNoErrors()); return app;
}
async function toggle(app,id,checked) {
  app.get('daily-'+id+'-enabled').checked = checked;
  app.get('daily-'+id+'-enabled').dispatchEvent({type:'change'}); await app.settle();
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
test('任务默认关闭，数量只通过加减按钮按10调整；取消不保存，保存后重新载入仍保留',async t => {
  const database = createMemoryDatabase(), app = await appFor(t,{database});
  await app.click('home-daily-tasks'); assert(app.get('daily-tasks-dialog').open);
  for (const id of ids) {
    assert.equal(app.get('daily-'+id+'-enabled').checked,false);
    assert(app.get('daily-'+id+'-quantity').classList.contains('hidden'));
    assert.equal(app.get('daily-'+id+'-target').textContent,'20');
  }
  await toggle(app,'harmonic',true); await app.click('daily-harmonic-plus');
  assert.equal(app.get('daily-harmonic-target').textContent,'30');
  assert(!progress(app,'harmonic').enabled,'未保存时不生效');
  await app.click('daily-tasks-close'); await app.click('home-daily-tasks');
  assert.equal(app.get('daily-harmonic-enabled').checked,false);
  for (const id of ids) { await toggle(app,id,true); await app.click('daily-'+id+'-minus'); }
  await app.click('daily-harmonic-minus');
  assert.equal(app.get('daily-harmonic-target').textContent,'10');
  assert(app.get('daily-harmonic-minus').disabled);
  await app.click('daily-melodic-plus'); await app.click('daily-melodic-plus');
  await app.click('daily-tasks-save'); assert(!app.get('daily-tasks-dialog').open);
  assert.equal(progress(app,'harmonic').target,10); assert.equal(progress(app,'melodic').target,30);
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
test('调整目标和关闭任务只影响勾选状态，不清除当天答题数',async t => {
  const app = await appFor(t,{database:databaseAtNine()}); await app.click('home-harmonic'); await app.answer('answer-grid',4); await app.click('back-home');
  await app.click('home-daily-tasks'); await app.click('daily-harmonic-plus'); await app.click('daily-tasks-save');
  assert.equal(progress(app,'harmonic').count,10); assert(!progress(app,'harmonic').complete);
  await app.click('home-daily-tasks'); await toggle(app,'harmonic',false); await app.click('daily-tasks-save');
  await app.click('home-harmonic'); assert(app.get('daily-practice-check').classList.contains('hidden')); await app.click('back-home');
  await app.click('home-daily-tasks'); await toggle(app,'harmonic',true); await app.click('daily-harmonic-minus'); await app.click('daily-tasks-save');
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
test('另一窗口答题和调整任务后同步完成状态，两个窗口的答题量共同累计',async t => {
  const database = databaseAtNine(), a = await appFor(t,{database}), b = await appFor(t,{database});
  await a.click('home-harmonic'); await b.click('home-harmonic'); await a.answer('answer-grid',4); await b.settle();
  assert(b.get('daily-practice-check').classList.contains('is-complete'));
  await b.answer('answer-grid',4); await a.settle(); assert.equal(progress(a,'harmonic').count,11);
  await a.click('back-home'); await a.click('home-daily-tasks'); await a.click('daily-harmonic-plus'); await a.click('daily-tasks-save'); await b.settle();
  assert(!b.get('daily-practice-check').classList.contains('is-complete'));
  assert.equal(progress(b,'harmonic').target,20);
});
test('任务保存失败时保留原设置和编辑内容，重试成功后才关闭设置',async t => {
  const database = createMemoryDatabase(), app = await appFor(t,{database});
  await app.click('home-daily-tasks'); await toggle(app,'harmonic',true);
  database.failNextWrite({after:0}); await app.click('daily-tasks-save');
  assert(app.get('daily-tasks-dialog').open);
  assert(!app.get('daily-tasks-error').classList.contains('hidden'));
  assert.equal(app.get('daily-harmonic-enabled').checked,true);
  assert.equal(app.storage.getItem(tasksKey),null);
  assert(!progress(app,'harmonic').enabled);
  await app.click('daily-tasks-save'); assert(!app.get('daily-tasks-dialog').open);
  assert(progress(app,'harmonic').enabled);
});
