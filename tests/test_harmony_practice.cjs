'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp,readSource} = require('./helpers/app-harness.cjs');
const {seededDatabase} = require('./helpers/fixtures.cjs');
const ids=['melody','harmony','guitar'];
const mixDouble=readSource('harmony-mix.js')+`\n(function(){
 const state=window.mixTest={prepared:[],assigned:0,released:0,volumes:{},muted:{},silent:false};
 window.TonaloomHarmonyMix={...window.TonaloomHarmonyMix,create(media){return {
  prepare(urls){state.prepared.push(urls);return state.pending||Promise.resolve({url:'blob:stems'});},
  prime(){media.src='blob:silent';media.load();return media.play();},ready:async()=>{},resume:async()=>{},single(){},
  assign(value){state.assigned++;media.pause();media.src=value.url;media.load();},
  setVolume(id,value){state.volumes[id]=value;},setMuted(id,value){state.muted[id]=value;},
  setSilent(value){state.silent=value;},release(){state.released++;}
 };}};
})();`;
async function setup(t,catalog) {
  const app=await createApp({database:seededDatabase(),sourceOverrides:{'harmony-mix.js':mixDouble,
    ...(catalog ? {'assets/harmony-songs.js':`window.TonaloomHarmonySongs=${JSON.stringify(catalog)};`} : {})}});
  t.after(()=>app.assertNoErrors());
  const media=app.get('harmony-audio'),actions=new Map();
  Object.assign(media,{src:'',paused:true,ended:false,duration:NaN,currentTime:0,playbackRate:1,muted:false,seeking:false,error:null,plays:[],loads:0,
    play(){this.plays.push(this.src);this.paused=false;this.ended=false;if(this.pendingPlay)return this.pendingPlay;this.dispatchEvent({type:'playing'});return Promise.resolve();},
    pause(){this.paused=true;this.dispatchEvent({type:'pause'});},
    load(){this.loads++;this.currentTime=0;this.duration=NaN;this.error=null;this.ended=false;},
    removeAttribute(key){delete this.attributes[key];if(key==='src')this.src='';}
  });
  app.window.navigator.audioSession={type:'auto'};
  app.window.navigator.mediaSession={metadata:null,playbackState:'none',setActionHandler:(name,handler)=>actions.set(name,handler),setPositionState(value){this.position=value;}};
  app.window.MediaMetadata=class {constructor(value){Object.assign(this,value);}};
  async function choose(index=0){app.get('harmony-directory').children[index].click();await app.settle();}
  async function open(){await app.click('home-harmony-practice');await choose();}
  function metadata(duration=100){media.duration=duration;media.dispatchEvent({type:'loadedmetadata'});}
  function volume(id,value){const input=app.get(`harmony-${id}-input`);input.value=String(value);input.dispatchEvent({type:'input'});}
  return {app,media,actions,choose,open,metadata,volume,state:app.window.mixTest};
}

test('歌曲直达三轨播放器并默认循环，返回目录和主页停止播放且不更改练习记录',async t=>{
  const {app,media,open,state}=await setup(t),before=new Map(app.database.records);
  await app.click('home-harmony-practice');assert(media.paused);assert.equal(media.plays.length,0);
  await open();assert(!media.paused);assert(media.loop);assert.equal(app.get('harmony-track-title').textContent,'在他乡');
  assert(app.get('harmony-directory').classList.contains('hidden'));
  for(const id of ids)assert(!app.get(`harmony-${id}`).classList.contains('hidden'));
  assert.equal(state.prepared.at(-1).length,3);
  assert(!readSource('index.html').includes('id="harmony-mode"'));
  assert(!readSource('index.html').includes('id="harmony-balance-input"'));
  for(const id of ['harmony-previous','harmony-next','harmony-track-number'])assert(app.get(id).classList.contains('hidden'));
  await app.click('back-home');assert(!app.get('harmony-directory').classList.contains('hidden'));
  assert.equal(app.get('harmony-directory').children.length,2);assert(media.paused);assert.equal(media.src,'');
  await app.click('back-home');assert(!app.get('home-screen').classList.contains('hidden'));assert(state.released>0);
  assert.deepEqual(app.database.records,before);
});

test('梨花再开放目录项使用本地旋律、和声、吉他三轨播放',async t=>{
  const {app,media,choose,state}=await setup(t);
  await app.click('home-harmony-practice');
  assert.equal(app.get('harmony-directory').children.length,2);
  await choose(1);
  const song=app.window.TonaloomHarmonySongs[1];
  assert.equal(song.title,'梨花再开放');
  assert.equal(app.get('harmony-track-title').textContent,'梨花再开放');
  assert(!media.paused);assert(media.loop);
  assert.deepEqual([...state.prepared.at(-1)],[...Object.values(song.stems)]);
  await app.click('back-home');
  assert(media.paused);assert.equal(media.src,'');
});

test('三条音量条和M独立控制，静音中调整音量不出声，取消静音恢复当前值且不重播',async t=>{
  const {app,media,open,volume,state}=await setup(t);await open();media.currentTime=12;
  const source=media.src,plays=media.plays.length,loads=media.loads;
  for(const id of ids){
    for(const value of [0,37,100]){
      volume(id,value);assert.equal(state.volumes[id],value);
      assert.equal(app.get(`harmony-${id}-level`).textContent,`${value}%`);
      for(const other of ids.filter(other=>other!==id))assert.equal(state.volumes[other],100);
    }
    await app.click(`harmony-${id}-mute`);assert(state.muted[id]);assert(!media.muted);assert(!media.paused);
    assert.equal(app.get(`harmony-${id}-mute`).getAttribute('aria-pressed'),'true');
    for(const other of ids.filter(other=>other!==id))assert(!state.muted[other]);
    volume(id,37);assert.equal(app.get(`harmony-${id}-level`).textContent,'0%');assert(state.muted[id]);
    await app.click(`harmony-${id}-mute`);assert(!state.muted[id]);
    assert.equal(app.get(`harmony-${id}-level`).textContent,'37%');volume(id,100);
  }
  assert.equal(media.src,source);assert.equal(media.plays.length,plays);assert.equal(media.loads,loads);assert.equal(media.currentTime,12);
});

test('暂停与继续保留同一首歌、进度和循环状态，结束回退仍重播当前歌曲',async t=>{
  const {app,media,open,metadata,state}=await setup(t);await open();metadata();media.currentTime=37;
  const source=media.src;await app.click('harmony-play');assert(media.paused);
  await app.click('harmony-play');assert(!media.paused);assert.equal(media.currentTime,37);assert.equal(media.src,source);assert(media.loop);
  const plays=media.plays.length;
  media.ended=true;media.paused=true;media.dispatchEvent({type:'ended'});await app.settle();
  assert.equal(media.plays.length,plays+1);assert.equal(media.currentTime,0);assert(!media.paused);assert(media.loop);
  assert.equal(app.get('harmony-track-title').textContent,'在他乡');assert.equal(state.assigned,1);
});

test('拖动暂停静音全部三轨，等待seeked后按原状态恢复，各轨M与音量不变',async t=>{
  const {app,media,open,metadata,volume,state}=await setup(t);await open();metadata();volume('melody',25);await app.click('harmony-harmony-mute');
  const slider=app.get('harmony-seek'),plays=media.plays.length;
  slider.dispatchEvent({type:'pointerdown'});assert(media.paused);assert(media.muted);assert(state.silent);
  for(const value of ['20','80','50']){slider.value=value;slider.dispatchEvent({type:'input'});}
  volume('guitar',80);assert(state.silent);assert.equal(media.currentTime,50);
  media.seeking=true;app.window.dispatchEvent({type:'pointerup'});await app.settle();assert(media.paused);assert(media.muted);
  media.seeking=false;media.dispatchEvent({type:'seeked'});await app.settle();
  assert(!media.paused);assert(!media.muted);assert(!state.silent);assert.equal(media.plays.length,plays+1);
  assert(state.muted.harmony);assert.equal(state.volumes.melody,25);assert.equal(state.volumes.guitar,80);
  slider.dispatchEvent({type:'pointerdown'});await app.click('back-home');
  app.window.dispatchEvent({type:'pointerup'});media.dispatchEvent({type:'seeked'});await app.settle();
  assert(media.paused);assert.equal(media.src,'');assert.equal(media.plays.length,plays+1);
});

test('原本暂停时键盘拖动不恢复播放，拖到末尾的ended也不重启',async t=>{
  const {app,media,open,metadata}=await setup(t);await open();metadata();await app.click('harmony-play');await app.click('harmony-guitar-mute');
  const plays=media.plays.length,slider=app.get('harmony-seek');
  slider.dispatchEvent({type:'keydown',key:'End'});slider.value='100';slider.dispatchEvent({type:'input'});assert(media.muted);
  slider.dispatchEvent({type:'keyup',key:'End'});media.ended=true;media.dispatchEvent({type:'ended'});await app.settle();
  assert(media.paused);assert(!media.muted);assert.equal(media.plays.length,plays);
  assert.equal(app.get('harmony-guitar-mute').getAttribute('aria-pressed'),'true');
});

test('加载中返回目录或暂停后，迟到的三轨不会恢复播放',async t=>{
  for(const action of ['back-home','harmony-play']){
    const {app,media,open,state}=await setup(t);let resolve;state.pending=new Promise(yes=>{resolve=yes;});
    await open();await app.click(action);resolve({url:'blob:late'});await app.settle();
    assert(media.paused);assert.equal(state.assigned,0);
    if(action==='back-home')assert.equal(media.src,'');
  }
});

test('系统媒体控制及后台可继续播放，返回清除会话且恢复音频设备设置',async t=>{
  const {app,media,actions,open,metadata}=await setup(t);await open();metadata();
  assert.equal(app.window.navigator.audioSession.type,'playback');
  app.window.document.hidden=true;app.window.document.dispatchEvent({type:'visibilitychange'});assert(!media.paused);
  actions.get('pause')();assert(media.paused);await actions.get('play')();assert(!media.paused);
  actions.get('seekto')({seekTime:30});actions.get('seekforward')({seekOffset:10});actions.get('seekbackward')({seekOffset:15});assert.equal(media.currentTime,25);
  await app.click('back-home');assert(media.paused);assert.equal(media.src,'');assert.equal(app.window.navigator.audioSession.type,'auto');
  assert.equal(app.window.navigator.mediaSession.metadata,null);
  for(const handler of actions.values())assert.equal(handler,null);
});

test('迟到的播放失败不影响目录，加载失败与自动播放限制可重试，pagehide停止音频',async t=>{
  const {app,media,open}=await setup(t);let reject;
  media.pendingPlay=new Promise((_yes,no)=>{reject=no;});await open();await app.click('back-home');
  reject(Object.assign(Error('cancelled'),{name:'AbortError'}));await app.settle();assert(media.paused);assert.equal(media.src,'');
  delete media.pendingPlay;
  media.play=function(){this.paused=true;return Promise.reject(Object.assign(Error('policy'),{name:'NotAllowedError'}));};
  await open();assert.match(app.get('harmony-message').textContent,/点击播放继续/);
  media.play=function(){this.paused=false;return Promise.resolve();};await app.click('harmony-play');assert(!media.paused);
  media.error={code:2};media.dispatchEvent({type:'error'});assert(media.paused);assert.match(app.get('harmony-message').textContent,/加载失败/);
  const loads=media.loads;await app.click('harmony-play');assert.equal(media.loads,loads+1);
  app.window.dispatchEvent({type:'pagehide'});assert(media.paused);assert.equal(media.src,'');
  await app.click('harmony-play');assert(!media.paused);assert(media.loop);
});

test('旧双轨及多项目清单仍能手动切换，缺失文件保持停止且不改变其他模块',async t=>{
  const song={id:'old',title:'旧清单',stems:{melody:'assets/m.wav',harmony:'assets/h.wav'},tracks:[
    {id:'mix',title:'双轨',mix:['melody','harmony']},{id:'missing',title:'未添加',src:null},{id:'single',title:'单轨',src:'assets/s.wav'}]};
  const {app,media,choose}=await setup(t,[song]);await app.click('home-harmony-practice');await choose();await choose();
  assert(!app.get('harmony-melody').classList.contains('hidden'));assert(app.get('harmony-guitar').classList.contains('hidden'));assert(media.loop);
  await app.click('harmony-next');assert(media.paused);assert(app.get('harmony-play').disabled);assert.equal(app.get('harmony-message').textContent,'音频待添加');
  await app.click('harmony-next');assert.equal(media.src,'assets/s.wav');assert(media.loop);assert(app.get('harmony-melody').classList.contains('hidden'));
  await app.click('back-home');await app.click('back-home');await app.click('back-home');
  await app.click('home-singing');assert.equal(app.get('practice-mode-title').textContent,'模唱');assert(media.paused);
});
