'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp,readSource} = require('./helpers/app-harness.cjs');
const {seededDatabase} = require('./helpers/fixtures.cjs');

const titles = ['旋律+和声','旋律','和声','伴奏'];
const song = {id:'test-song',title:'测试歌曲',tracks:titles.map((title,i) => ({id:String(i),title,src:`assets/harmony-practice/test/${i}.wav`}))};
async function setup(t, catalog = [song], extra = {}) {
  const app = await createApp({database:seededDatabase(),sourceOverrides:{...(catalog ? {
    'assets/harmony-songs.js':`window.TonaloomHarmonySongs = ${JSON.stringify(catalog)};`
  } : {}),...extra}});
  t.after(() => app.assertNoErrors());
  const media = app.get('harmony-audio'), actions = new Map();
  Object.assign(media,{src:'',paused:true,ended:false,duration:NaN,currentTime:0,playbackRate:1,loop:false,muted:false,seeking:false,error:null,plays:[],loads:0,
    play() {
      this.plays.push(this.src); this.paused = false; this.ended = false;
      if (this.pendingPlay) return this.pendingPlay;
      this.dispatchEvent({type:'playing'}); return Promise.resolve();
    },
    pause() { this.paused = true; this.dispatchEvent({type:'pause'}); },
    load() { this.loads++; this.currentTime = 0; this.duration = NaN; this.error = null; this.ended = false; },
    removeAttribute(key) { delete this.attributes[key]; if (key === 'src') this.src = ''; }
  });
  app.window.navigator.audioSession = {type:'auto'};
  app.window.navigator.mediaSession = {metadata:null,playbackState:'none',setActionHandler:(name,handler) => actions.set(name,handler),setPositionState(value) { this.position = value; }};
  app.window.MediaMetadata = class { constructor(value) { Object.assign(this,value); } };
  async function choose(index) { app.get('harmony-directory').children[index].click(); await app.settle(); }
  async function open(index = 0) { await app.click('home-harmony-practice'); await choose(0); await choose(index); }
  async function ended() { media.ended = true; media.paused = true; media.dispatchEvent({type:'ended'}); await app.settle(); }
  function metadata(duration = 90) { media.duration = duration; media.dispatchEvent({type:'loadedmetadata'}); }
  return {app,media,actions,choose,open,ended,metadata};
}

test('未添加音轨使用占位状态，保留目录层级且不更改练习记录', async t => {
  const emptySong = {...song,title:'在他乡',tracks:song.tracks.map(item => ({...item,src:null}))};
  const {app,media,choose} = await setup(t,[emptySong]), before = new Map(app.database.records);
  const catalog = app.window.TonaloomModules;
  assert.equal(catalog.activities.length,catalog.list.length+1);
  assert(!catalog.list.some(item => item.id === 'harmony-practice'));
  await app.click('home-harmony-practice');
  assert.equal(app.get('harmony-directory').children.length,1);
  assert.match(app.get('harmony-directory').textContent,/在他乡/);
  await choose(0);
  assert.deepEqual(app.get('harmony-directory').children.map(item => item.children[1].textContent),titles);
  for (let i = 0; i < 4; i++) {
    await choose(i);
    assert.equal(app.get('harmony-track-title').textContent,titles[i]);
    assert.equal(app.get('harmony-message').textContent,'音频待添加');
    assert(app.get('harmony-play').disabled);
    assert(app.get('harmony-seek').disabled);
    await app.click('back-home');
    assert(!app.get('harmony-directory').classList.contains('hidden'));
    assert.equal(app.get('harmony-directory').children.length,4);
  }
  await app.click('back-home'); assert.equal(app.get('harmony-directory').children.length,1);
  await app.click('back-home'); assert(!app.get('home-screen').classList.contains('hidden'));
  assert.equal(media.plays.length,0);
  assert.deepEqual(app.database.records,before);
  assert(app.get('harmony-navigation-spacer').classList.contains('hidden'));
});

const mixedSong = {...song,tracks:song.tracks.map((item,i) => i===0 ? {id:item.id,title:item.title,mix:['1','2']} : item)};
const mixDouble = readSource('harmony-mix.js')+`\n(function(){
 const gains=window.TonaloomHarmonyMix.gains;
 const state=window.mixTest={prepared:[],assigned:0,released:0};
 window.TonaloomHarmonyMix={...window.TonaloomHarmonyMix,create(media){return {
  prepare(urls){state.prepared.push(urls);return state.pending||Promise.resolve({url:'blob:stems'});},
  prime(){media.src='blob:silent';media.load();return media.play();},ready:async()=>{},resume:async()=>{},single(){},
  assign(value){state.assigned++;media.pause();media.src=value.url;media.load();},
  setBalance(value){return state.levels=gains(value);},setMuted(value){state.muted=value;},release(){state.released++;}
 };}};
})();`;

test('在他乡目录只保留混合与伴奏，原音轨仅供混合使用且顺序不再经过单轨入口', async t => {
  const {app,media,choose} = await setup(t,null,{'harmony-mix.js':mixDouble});
  await app.click('home-harmony-practice'); await choose(0);
  assert.deepEqual(app.get('harmony-directory').children.map(item => item.children[1].textContent),['旋律+和声','伴奏']);
  await choose(0);
  assert.equal(app.get('harmony-track-number').textContent,'01 / 02');
  assert(!media.paused); assert(!app.get('harmony-balance').classList.contains('hidden'));
  assert.deepEqual(Array.from(app.window.mixTest.prepared.at(-1)),[
    'assets/harmony-practice/zai-ta-xiang/melody.wav','assets/harmony-practice/zai-ta-xiang/harmony.wav'
  ]);
  media.ended=true; media.paused=true; media.dispatchEvent({type:'ended'}); await app.settle();
  assert.equal(app.get('harmony-track-title').textContent,'伴奏');
  assert.equal(app.get('harmony-track-number').textContent,'02 / 02');
  assert(app.get('harmony-next').disabled); assert(media.paused);
  assert.equal(app.get('harmony-message').textContent,'音频待添加');
  await app.click('back-home'); assert.equal(app.get('harmony-directory').children.length,2);
});

test('混合入口读取两份原音轨，平衡不改变进度，单轨页不显示平衡条', async t => {
  const {app,media,open,metadata} = await setup(t,[mixedSong],{'harmony-mix.js':mixDouble});
  const mixed=app.get('harmony-audio'), state=app.window.mixTest;
  await open();
  assert(!app.get('harmony-balance').classList.contains('hidden'));
  assert.deepEqual(Array.from(state.prepared.at(-1)),[song.tracks[1].src,song.tracks[2].src]);
  assert.equal(state.assigned,1); assert(!mixed.paused); assert.equal(mixed,media);
  mixed.duration=50; mixed.currentTime=17;
  const plays=mixed.plays.length, source=mixed.src;
  for (const [value,m,h] of [[-100,0,1],[-50,.5,1],[0,1,1],[50,1,.5],[100,1,0]]) {
    app.get('harmony-balance-input').value=String(value); app.get('harmony-balance-input').dispatchEvent({type:'input'});
    assert.equal(state.levels.melody,m); assert.equal(state.levels.harmony,h);
    assert.equal(app.get('harmony-melody-level').textContent,`${m*100}%`);
    assert.equal(app.get('harmony-harmony-level').textContent,`${h*100}%`);
    assert.equal(mixed.currentTime,17); assert.equal(mixed.plays.length,plays); assert.equal(mixed.src,source);
  }
  app.get('harmony-seek').value='50'; app.get('harmony-seek').dispatchEvent({type:'input'}); assert.equal(mixed.currentTime,25);
  await app.click('harmony-play'); assert(mixed.paused);
  await app.click('harmony-play'); assert(!mixed.paused); assert.equal(mixed.currentTime,25); assert.equal(state.assigned,1);
  await app.click('harmony-mode'); assert(mixed.loop);
  await app.click('harmony-next'); metadata(); assert(!media.paused); assert.equal(media.src,song.tracks[1].src);
  assert(app.get('harmony-balance').classList.contains('hidden'));
  await app.click('back-home'); assert.equal(mixed.src,''); assert.equal(media.src,'');
});

test('M同时静音双轨，静音时调整平衡不漏音，取消M恢复当前平衡且不重播', async t => {
  const {app,media,open}=await setup(t,[mixedSong],{'harmony-mix.js':mixDouble});
  await open(); media.currentTime=12;
  const plays=media.plays.length;
  await app.click('harmony-mute');
  assert(media.muted); assert(app.window.mixTest.muted); assert(!media.paused);
  assert.equal(app.get('harmony-mute').getAttribute('aria-pressed'),'true');
  assert(app.get('harmony-mute').classList.contains('is-active'));
  app.get('harmony-balance-input').value='50'; app.get('harmony-balance-input').dispatchEvent({type:'input'});
  assert(media.muted); assert.equal(app.get('harmony-melody-level').textContent,'0%');
  assert.equal(app.get('harmony-harmony-level').textContent,'0%');
  await app.click('harmony-mute');
  assert(!media.muted); assert(!app.window.mixTest.muted);
  assert.equal(app.get('harmony-mute').getAttribute('aria-pressed'),'false');
  assert.equal(app.get('harmony-melody-level').textContent,'100%');
  assert.equal(app.get('harmony-harmony-level').textContent,'50%');
  assert.equal(media.currentTime,12); assert.equal(media.plays.length,plays);
});

test('进度拖动期间持续暂停静音，松手且seeked后才恢复播放，离开后不迟到恢复', async t => {
  const {app,media,open,metadata}=await setup(t,[mixedSong],{'harmony-mix.js':mixDouble});
  await open(); metadata(100); const plays=media.plays.length;
  const slider=app.get('harmony-seek'); slider.dispatchEvent({type:'pointerdown'});
  assert(media.paused); assert(media.muted); assert(app.window.mixTest.muted);
  assert.equal(app.get('harmony-mute').getAttribute('aria-pressed'),'false');
  for (const value of ['20','80','50']) { slider.value=value; slider.dispatchEvent({type:'input'}); }
  assert.equal(media.currentTime,50); assert.equal(media.plays.length,plays);
  media.seeking=true; app.window.dispatchEvent({type:'pointerup'}); await app.settle();
  assert(media.paused); assert(media.muted);
  media.seeking=false; media.dispatchEvent({type:'seeked'}); await app.settle();
  assert(!media.paused); assert(!media.muted); assert.equal(media.currentTime,50);
  assert.equal(media.plays.length,plays+1);
  slider.dispatchEvent({type:'pointerdown'}); await app.click('back-home');
  app.window.dispatchEvent({type:'pointerup'}); media.dispatchEvent({type:'seeked'}); await app.settle();
  assert(media.paused); assert.equal(media.src,''); assert.equal(media.plays.length,plays+1);
});

test('暂停时键盘拖动保持暂停，M状态不变，拖到末尾不会自动换轨', async t => {
  const {app,media,open,metadata}=await setup(t,[mixedSong],{'harmony-mix.js':mixDouble});
  await open(); metadata(100); await app.click('harmony-play'); await app.click('harmony-mute');
  const plays=media.plays.length,slider=app.get('harmony-seek');
  slider.dispatchEvent({type:'keydown',key:'End'}); slider.value='100'; slider.dispatchEvent({type:'input'});
  slider.dispatchEvent({type:'change'}); assert(media.muted); assert(media.paused);
  slider.dispatchEvent({type:'keyup',key:'End'}); media.ended=true; media.dispatchEvent({type:'ended'}); await app.settle();
  assert(media.paused); assert(media.muted); assert.equal(media.plays.length,plays);
  assert.equal(app.get('harmony-track-title').textContent,'旋律+和声');
  assert.equal(app.get('harmony-mute').getAttribute('aria-pressed'),'true');
  await app.click('harmony-mute'); assert(!media.muted); assert(media.paused);
});

test('混合加载中离开或暂停，迟到的音轨不会开始播放', async t => {
  const {app,open}=await setup(t,[mixedSong],{'harmony-mix.js':mixDouble});
  const mixed=app.get('harmony-audio'),state=app.window.mixTest;
  let resolve; state.pending=new Promise(yes=>{resolve=yes;});
  await open(); assert.equal(app.get('harmony-play-label').textContent,'暂停');
  await app.click('back-home'); resolve({url:'blob:late'}); await app.settle();
  assert(mixed.paused); assert.equal(mixed.src,''); assert.equal(state.assigned,0);
  await app.click('back-home'); await app.click('back-home'); assert(state.released > 0);
});

test('顺序从选中的音轨继续到最后后停止，换轨保留系统媒体会话且不叠加', async t => {
  const {app,media,open,ended} = await setup(t);
  await open(1);
  assert.deepEqual(media.plays,[song.tracks[1].src]);
  media.dispatchEvent({type:'ended'}); await app.settle();
  assert.equal(app.get('harmony-track-title').textContent,'旋律','忽略切换音源后迟到的 ended 事件');
  const session = app.window.navigator.mediaSession, released = [];
  const setHandler = session.setActionHandler;
  session.setActionHandler = (name,handler) => { if (handler === null) released.push(name); setHandler(name,handler); };
  await ended(); assert.equal(app.get('harmony-track-title').textContent,'和声');
  await ended(); assert.equal(app.get('harmony-track-title').textContent,'伴奏');
  assert.equal(released.length,0,'自动换轨不取消后台媒体控制');
  await ended();
  assert.equal(media.plays.length,3); assert(media.paused); assert(!media.loop);
  assert.equal(app.get('harmony-play-label').textContent,'播放');
  await app.click('back-home'); assert.equal(media.src,'');
  assert(released.length > 0);
});

test('循环使用原生 loop，切换模式不改变音轨、播放进度或发起额外播放', async t => {
  const {app,media,open,metadata} = await setup(t);
  await open(); metadata(); media.currentTime = 37;
  await app.click('harmony-mode');
  assert(media.loop); assert.equal(app.get('harmony-mode-label').textContent,'循环播放');
  assert.equal(media.currentTime,37); assert.equal(media.plays.length,1);
  await app.click('harmony-mode');
  assert(!media.loop); assert.equal(media.currentTime,37);
  await app.click('harmony-play'); assert(media.paused);
  await app.click('harmony-play'); assert(!media.paused); assert.equal(media.src,song.tracks[0].src);
});

test('拖动进度、上下音轨和边界操作正确，缺失音轨停止而不跳过', async t => {
  const {app,media,open,metadata,ended} = await setup(t,[{...song,tracks:song.tracks.map((item,i) => i === 2 ? {...item,src:null} : item)}]);
  await open(); metadata(100);
  assert(app.get('harmony-previous').disabled);
  app.get('harmony-seek').value = '65'; app.get('harmony-seek').dispatchEvent({type:'input'});
  assert.equal(media.currentTime,65);
  await app.click('harmony-next'); assert.equal(media.src,song.tracks[1].src);
  await ended();
  assert.equal(app.get('harmony-track-title').textContent,'和声'); assert(media.paused);
  assert.equal(media.plays.length,2); assert(app.get('harmony-play').disabled);
  await app.click('harmony-next'); assert.equal(media.src,song.tracks[3].src);
  assert(app.get('harmony-next').disabled);
  await app.click('harmony-previous'); assert.equal(app.get('harmony-message').textContent,'音频待添加');
});

test('后台不暂停，系统媒体控制有效，返回目录清除锁屏控制并恢复音频设置', async t => {
  const {app,media,actions,open,metadata} = await setup(t);
  await open(); metadata();
  assert.equal(app.window.navigator.audioSession.type,'playback');
  assert.equal(app.window.navigator.mediaSession.metadata.artist,song.title);
  app.window.document.hidden = true; app.window.document.dispatchEvent({type:'visibilitychange'});
  assert(!media.paused);
  actions.get('pause')(); assert(media.paused);
  await actions.get('play')(); assert(!media.paused);
  actions.get('seekto')({seekTime:30}); assert.equal(media.currentTime,30);
  actions.get('seekforward')({seekOffset:10}); assert.equal(media.currentTime,40);
  actions.get('seekbackward')({seekOffset:15}); assert.equal(media.currentTime,25);
  actions.get('nexttrack')(); assert.equal(media.src,song.tracks[1].src);
  await app.click('back-home'); assert(media.paused); assert.equal(media.src,'');
  assert.equal(app.window.navigator.audioSession.type,'auto');
  assert.equal(app.window.navigator.mediaSession.playbackState,'none');
  assert.equal(app.window.navigator.mediaSession.metadata,null);
  for (const handler of actions.values()) assert.equal(handler,null);
});

test('返回时尚未结束的播放请求及迟到失败不会恢复声音或污染下一页', async t => {
  const {app,media,open} = await setup(t);
  let reject;
  media.pendingPlay = new Promise((_resolve,no) => { reject = no; });
  await open();
  await app.click('harmony-play'); assert(media.paused);
  await app.click('harmony-play');
  await app.click('back-home');
  reject(Object.assign(Error('cancelled'),{name:'AbortError'})); await app.settle();
  assert(media.paused); assert.equal(media.src,'');
  assert(app.get('harmony-message').classList.contains('hidden'));
  media.dispatchEvent({type:'ended'}); await app.settle();
  assert.equal(app.get('harmony-directory').children.length,4);
  await app.click('back-home'); await app.click('back-home');
  await app.click('home-singing'); assert.equal(app.get('practice-mode-title').textContent,'模唱');
  assert(app.get('harmony-practice').classList.contains('hidden'));
});

test('加载失败或自动播放被拒绝可重试，页面退出后音源释放', async t => {
  const {app,media,open} = await setup(t);
  media.play = function() { this.paused = true; return Promise.reject(Object.assign(Error('policy'),{name:'NotAllowedError'})); };
  await open(); assert.match(app.get('harmony-message').textContent,/点击播放继续/);
  media.play = function() { this.paused = false; return Promise.resolve(); };
  await app.click('harmony-play'); assert(!media.paused);
  media.error = {code:2}; media.dispatchEvent({type:'error'});
  assert(media.paused); assert.match(app.get('harmony-message').textContent,/加载失败/);
  const loads = media.loads; await app.click('harmony-play'); assert.equal(media.loads,loads+1);
  app.window.dispatchEvent({type:'pagehide'}); assert(media.paused); assert.equal(media.src,'');
  await app.click('harmony-play'); assert(!media.paused); assert.equal(media.src,song.tracks[0].src);
});
