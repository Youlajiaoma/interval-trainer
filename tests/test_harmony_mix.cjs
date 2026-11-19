'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('./helpers/app-harness.cjs');
function setup(storage) {
  const log = {reads:[],revoked:[],gains:[],connections:[],urls:new Map()}, destination = {};
  function node(type) {
    const value = {type,connect(...args) { log.connections.push([this,...args]); },disconnect() {}};
    return value;
  }
  const context = {currentTime:10,destination,
    createMediaElementSource:() => node('source'), createChannelSplitter:() => node('splitter'), createChannelMerger:() => node('merger'),
    createGain() {
      const value = node('gain'); value.gain = {value:1,cancelScheduledValues() {},setValueAtTime(v) { this.value=v; },linearRampToValueAtTime(v) { this.value=v; }};
      log.gains.push(value); return value;
    }
  };
  const buffers = new Map(), root = {caches:storage,document:{baseURI:'https://local.test/app/'},TonaloomAudio:{createChannel:() => ({ready:async()=>context,
    recording:async url => { log.reads.push(url); if (!buffers.has(url)) throw Error('missing'); return buffers.get(url); }})}};
  class LocalURL extends URL {
    static createObjectURL(blob) { const url=`blob:mix-${log.urls.size}`; log.urls.set(url,blob); return url; }
    static revokeObjectURL(url) { log.revoked.push(url); }
  }
  vm.runInNewContext(readSource('harmony-mix.js'),{window:root,Blob,Response,URL:LocalURL});
  return {api:root.TonaloomHarmonyMix,log,buffers,context,destination};
}
const buffer = (...channels) => ({numberOfChannels:channels.length,length:channels[0].length,sampleRate:44100,getChannelData:i=>Float32Array.from(channels[i])});

test('拒绝无效轨数、声道数和采样率不一致的输入', () => {
  const {api}=setup(), a=buffer([.5]);
  for (const stems of [[a],[a,a,a,a],[a,{...a,sampleRate:22050}],[a,buffer([.1],[.2],[.3])]]) {
    assert.throws(()=>api.pack(stems),/采样率相同/);
  }
});

test('临时音频保留两轨独立样本和幅度，不预先混合；较短音轨在末尾补零', () => {
  const {api} = setup(), packed = api.pack([buffer([.25,-.5,.75]),buffer([-.125,.5])]);
  const view = new DataView(packed.bytes);
  assert.equal(view.getUint16(20,true),3); assert.equal(view.getUint16(22,true),2);
  assert.equal(view.getUint32(24,true),44100); assert.equal(view.getUint32(40,true),24);
  const expected = [.25,-.125,-.5,.5,.75,0];
  expected.forEach((value,i) => assert.equal(view.getFloat32(44+i*4,true),value));
  assert.equal(packed.duration,3/44100); assert(!packed.stereo);
});

test('立体声输入保留各轨左右声道，不把平衡变成声像或丢弃一侧', () => {
  const {api} = setup(), packed = api.pack([buffer([.25],[.5]),buffer([-.125])]), view = new DataView(packed.bytes);
  assert(packed.stereo); assert.equal(view.getUint16(22,true),4);
  [.25,.5,-.125,-.125].forEach((value,i) => assert.equal(view.getFloat32(44+i*4,true),value));
});

test('双轨共用媒体时钟且路由到相同左右输出，音量改变不重载音源', async () => {
  const {api,buffers,log,destination} = setup();
  buffers.set('m',buffer([.25,.5])); buffers.set('h',buffer([.125,.25]));
  const media = {src:'',loads:0,load() { this.loads++; },play:async()=>{},pause(){}};
  const mixer = api.create(media), a=mixer.prepare(['m','h']), b=mixer.prepare(['m','h']);
  assert.equal(a,b); const prepared = await a;
  await mixer.prime(); mixer.assign(prepared);
  assert.equal(log.reads.length,2);
  const links = log.connections.filter(([source,target])=>source.type==='splitter' && target.type==='merger');
  assert.deepEqual(links.map(row=>row.slice(2)),[[0,0],[0,1],[1,0],[1,1]]);
  assert(log.connections.filter(([source,target])=>source.type==='gain' && target===destination).length===3);
  const source=media.src, loads=media.loads;
  mixer.setVolume('melody',25); mixer.setVolume('harmony',50);
  assert.deepEqual(log.gains.map(g=>g.gain.value),[.25,.5,0]);
  mixer.setMuted('melody',true); assert.deepEqual(log.gains.map(g=>g.gain.value),[0,.5,0]);
  mixer.setMuted('melody',false); assert.deepEqual(log.gains.map(g=>g.gain.value),[.25,.5,0]);
  assert.equal(media.src,source); assert.equal(media.loads,loads);
  mixer.single();
  assert(log.connections.at(-1)[0].type==='source' && log.connections.at(-1)[1]===destination,'单轨直接保持原音量，不经过混合音量节点');
  mixer.release(); assert(log.revoked.includes(source));
});

test('三轨按原样保存独立声道、补零及统一时长，同时支持三份立体声', () => {
  const {api}=setup();
  const mono=api.pack([buffer([.25,.5]),buffer([-.25]),buffer([.125,-.125])]);
  assert.equal(mono.stemCount,3); assert.equal(mono.duration,2/44100);
  const m=new DataView(mono.bytes); assert.equal(m.getUint16(22,true),3);
  [.25,-.25,.125,.5,0,-.125].forEach((value,i)=>assert.equal(m.getFloat32(44+i*4,true),value));
  const stereo=api.pack([buffer([.25],[.5]),buffer([-.25]),buffer([.125],[-.125])]);
  const s=new DataView(stereo.bytes); assert(stereo.stereo); assert.equal(s.getUint16(22,true),6);
  [.25,.5,-.25,-.25,.125,-.125].forEach((value,i)=>assert.equal(s.getFloat32(44+i*4,true),value));
});

test('三轨全部0至100整数音量独立线性生效，M保留音量且临时静音涵盖三轨', async () => {
  const {api,buffers,log}=setup();
  for (const id of ['m','h','g']) buffers.set(id,buffer([.25,.5]));
  const media={src:'',loads:0,load(){this.loads++;},play:async()=>{},pause(){}};
  const mixer=api.create(media), transport=await mixer.prepare(['m','h','g']);
  await mixer.prime(); mixer.assign(transport);
  const levels=()=>log.gains.map(g=>g.gain.value), source=media.src, loads=media.loads;
  assert.deepEqual(levels(),[1,1,1]);
  const links=log.connections.filter(([from,to])=>from.type==='splitter' && to.type==='merger');
  assert.deepEqual(links.map(row=>row.slice(2)),[[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]]);
  for (const [index,id] of ['melody','harmony','guitar'].entries()) {
    for (let volume=0;volume<=100;volume++) {
      const expected=[1,1,1]; expected[index]=volume/100;
      mixer.setVolume(id,volume); assert.deepEqual(levels(),expected);
    }
    mixer.setMuted(id,true); mixer.setVolume(id,37);
    const expected=[1,1,1]; expected[index]=0; assert.deepEqual(levels(),expected);
    mixer.setMuted(id,false); expected[index]=.37; assert.deepEqual(levels(),expected);
    mixer.setVolume(id,100);
  }
  mixer.setVolume('melody',25); mixer.setVolume('harmony',50); mixer.setMuted('guitar',true);
  mixer.setSilent(true); mixer.setVolume('guitar',80); assert.deepEqual(levels(),[0,0,0]);
  mixer.setSilent(false); assert.deepEqual(levels(),[.25,.5,0]);
  mixer.setMuted('guitar',false); assert.deepEqual(levels(),[.25,.5,.8]);
  mixer.setVolume('melody',-20); mixer.setVolume('harmony',150); assert.deepEqual(levels(),[0,1,.8]);
  assert.throws(()=>mixer.setVolume('unknown',50),/未知音轨/);
  assert.equal(media.src,source); assert.equal(media.loads,loads);
});

test('下载失败可重试，离开后迟到下载不会保留或恢复临时音源', async () => {
  const {api,buffers,log} = setup(), mixer=api.create({});
  buffers.set('m',buffer([.5]));
  await assert.rejects(mixer.prepare(['m','h']),/missing/);
  buffers.set('h',buffer([.25]));
  const operation=mixer.prepare(['m','h']); mixer.release();
  await assert.rejects(operation,/取消/); assert.equal(log.urls.size,0);
  const retry=await mixer.prepare(['m','h']); assert(retry.url);
});

test('提前准备不播放，重新打开后直接使用本地成品，不再下载、解码和封装音轨', async () => {
  const entries=new Map(), storage={open:async()=>({match:async key=>entries.get(key)?.clone(),put:async(key,value)=>entries.set(key,value.clone())})};
  const first=setup(storage);
  first.buffers.set('m?v=1',buffer([.25,.5]));first.buffers.set('h?v=1',buffer([-.25]));
  const transport=await first.api.create({}).prepare(['m?v=1','h?v=1']);
  assert.equal(entries.size,1);assert.equal(first.log.gains.length,0,'准备时不解锁音频输出');
  const expected=await first.log.urls.get(transport.url).arrayBuffer();
  const second=setup(storage), mixer=second.api.create({});
  const local=await mixer.prepare(['m?v=1','h?v=1']);
  assert.equal(second.log.reads.length,0,'重开后不再下载或解码');
  assert.equal(local.stemCount,2);assert.equal(local.duration,transport.duration);
  assert.deepEqual(await second.log.urls.get(local.url).arrayBuffer(),expected,'本地成品逐样本保持不变');
  mixer.release();assert(second.log.revoked.includes(local.url),'退出仍释放内存音源');assert.equal(entries.size,1,'退出保留设备上的成品');
  await assert.rejects(mixer.prepare(['m?v=2','h?v=1']),/missing/,'替换音频必须重新准备，不能误用旧成品');
});

test('本地存储被禁用或写满时，正常播放仍可使用原音轨', async () => {
  for(const storage of [{open:async()=>{throw Error('denied');}},
    {open:async()=>({match:async()=>undefined,put:async()=>{throw Error('full');}})}]){
    const {api,buffers}=setup(storage);buffers.set('m',buffer([.5]));buffers.set('h',buffer([.25]));
    assert((await api.create({}).prepare(['m','h'])).url);
  }
});
