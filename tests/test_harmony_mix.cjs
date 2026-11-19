'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('./helpers/app-harness.cjs');
function setup() {
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
  const buffers = new Map(), root = {TonaloomAudio:{createChannel:() => ({ready:async()=>context,
    recording:async url => { log.reads.push(url); if (!buffers.has(url)) throw Error('missing'); return buffers.get(url); }})}};
  vm.runInNewContext(readSource('harmony-mix.js'),{window:root,Blob,URL:{createObjectURL(blob) { const url=`blob:mix-${log.urls.size}`; log.urls.set(url,blob); return url; },revokeObjectURL:url=>log.revoked.push(url)}});
  return {api:root.TonaloomHarmonyMix,log,buffers,context,destination};
}
const buffer = (...channels) => ({numberOfChannels:channels.length,length:channels[0].length,sampleRate:44100,getChannelData:i=>Float32Array.from(channels[i])});

test('平衡中点为1:1，向旋律端只衰减旋律，向和声端只衰减和声', () => {
  const {api} = setup();
  for (let x=-100;x<=100;x++) {
    const {melody,harmony} = api.gains(x);
    assert.equal(melody,x >= 0 ? 1 : (100+x)/100);
    assert.equal(harmony,x <= 0 ? 1 : (100-x)/100);
    assert(melody >= 0 && melody <= 1 && harmony >= 0 && harmony <= 1);
  }
  assert.equal(api.gains(0).melody,1); assert.equal(api.gains(0).harmony,1);
  assert.equal(api.gains(-100).melody,0); assert.equal(api.gains(100).harmony,0);
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
  assert(log.connections.filter(([source,target])=>source.type==='gain' && target===destination).length===2);
  const source=media.src, loads=media.loads;
  for (const [value,expected] of [[-100,[0,1]],[-50,[.5,1]],[0,[1,1]],[50,[1,.5]],[100,[1,0]]]) {
    mixer.setBalance(value); assert.deepEqual(log.gains.map(g=>g.gain.value),expected);
  }
  mixer.setMuted(true); assert.deepEqual(log.gains.map(g=>g.gain.value),[0,0]);
  mixer.setBalance(50); assert.deepEqual(log.gains.map(g=>g.gain.value),[0,0]);
  mixer.setMuted(false); assert.deepEqual(log.gains.map(g=>g.gain.value),[1,.5]);
  assert.equal(media.src,source); assert.equal(media.loads,loads);
  mixer.single();
  assert(log.connections.at(-1)[0].type==='source' && log.connections.at(-1)[1]===destination,'单轨直接保持原音量，不经过混合音量节点');
  mixer.release(); assert(log.revoked.includes(source));
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
