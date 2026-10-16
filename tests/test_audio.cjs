'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource, createApp, createMemoryDatabase} = require('./helpers/app-harness.cjs');
const {keys, sightSession} = require('./helpers/fixtures.cjs');

function environment() {
  const state = {contexts:[], decodes:[], fetches:[], voices:[], gains:[], failDecode:false, failFetch:false};
  class Context {
    constructor() { this.currentTime = 5; this.state = 'suspended'; this.destination = {}; this.resumes = 0; state.contexts.push(this); }
    async resume() { this.state = 'running'; this.resumes++; }
    async decodeAudioData(bytes) {
      state.decodes.push(new Uint8Array(bytes)[0]);
      if (state.failDecode) throw Error('模拟解码失败');
      return {duration:2.5, marker:new Uint8Array(bytes)[0]};
    }
    createGain() {
      const events = [], gain = {value:1,
        setValueAtTime: (...args) => events.push(['set', ...args]),
        linearRampToValueAtTime: (...args) => events.push(['ramp', ...args]),
        setTargetAtTime: (...args) => events.push(['target', ...args])};
      const node = {gain, events, connect(target) { this.target = target; }, disconnect() { this.disconnected = true; }};
      state.gains.push(node); return node;
    }
    createBufferSource() {
      const voice = {playbackRate:{setValueAtTime(value, at) { this.value = value; this.at = at; }},
        connect(target) { this.target = target; }, disconnect() { this.disconnected = true; },
        start(at) { this.at = at; }, stop(at) { (this.stops ??= []).push(at); }};
      state.voices.push(voice); return voice;
    }
  }
  const root = {AudioContext:Context, PIANO_SAMPLES:{36:'JA==', 60:'PA==', 64:'QA==', 96:'YA=='}};
  vm.runInNewContext(readSource('audio.js'), {window:root, URL, Uint8Array,
    document:{baseURI:'https://isolated.test/app/'}, atob:input => Buffer.from(input, 'base64').toString('binary'),
    fetch: async url => { state.fetches.push(url); return {ok:!state.failFetch, status:503, arrayBuffer:async () => Uint8Array.of(200).buffer}; }});
  return {state, root, channel:level => root.TonaloomAudio.createChannel(level)};
}

test('不同模块同时请求同一钢琴采样，只创建一个设备并解码一次', async () => {
  const {state, channel} = environment();
  const a = channel(.52), b = channel(.42), c = channel(.43);
  assert.equal(state.contexts.length, 0, '仅进入模块不应创建音频设备');
  const samples = await Promise.all([a.piano(60), b.piano(60), c.piano(60)]);
  assert.equal(state.contexts.length, 1);
  assert.deepEqual(state.decodes, [60]);
  assert.equal(samples[0].buffer, samples[1].buffer);
  assert.equal(samples[1].buffer, samples[2].buffer);
  await a.ready(); await b.ready();
  assert.equal(state.contexts[0].resumes, 1);
});

test('音符超出钢琴采样范围时使用边界采样，播放倍率仍对应实际音高', async () => {
  const {state, channel} = environment(), audio = channel(.42);
  const low = await audio.piano(35, true), high = await audio.piano(97, true);
  assert.deepEqual(state.decodes, [36, 96]);
  assert.equal(low.rate, 2 ** (-1/12));
  assert.equal(high.rate, 2 ** (1/12));
  await assert.rejects(audio.piano(35), /缺少钢琴采样/);
});

test('采样解码失败后可以重新加载，不保留失败的加载请求', async () => {
  const {state, channel} = environment(), audio = channel(.52);
  state.failDecode = true;
  await assert.rejects(audio.piano(60), /模拟解码失败/);
  state.failDecode = false;
  assert.equal((await audio.piano(60)).buffer.marker, 60);
  assert.deepEqual(state.decodes, [60, 60]);
});

test('旋律录音按网页路径加载且共用解码结果，下载失败可以重试', async () => {
  const {state, channel} = environment(), a = channel(.52), b = channel(.42);
  state.failFetch = true;
  await assert.rejects(a.recording('assets/tune.m4a'), /503/);
  state.failFetch = false;
  const [first, second] = await Promise.all([a.recording('assets/tune.m4a'), b.recording('./assets/tune.m4a')]);
  assert.equal(first, second);
  assert.deepEqual(state.fetches, ['https://isolated.test/app/assets/tune.m4a', 'https://isolated.test/app/assets/tune.m4a']);
  assert.deepEqual(state.decodes, [200]);
  a.playRecording(first, 5.06);
  assert.equal(state.voices[0].playbackRate.value, 1, '原始旋律录音不移调');
  assert.equal(state.voices[0].target.gain.value, 3);
  assert.equal(state.voices[0].stops[0], 7.56);
});

test('统一播放保留起音、保持、收音和停止时刻，声音结束后清理连接', async () => {
  const {state, channel} = environment(), audio = channel(.52);
  const sample = await audio.piano(60);
  audio.tone(sample, 6, 2, .72, {attack:.013, hold:1.83, floor:.0001, tail:.02});
  const voice = state.voices[0];
  assert.deepEqual(voice.target.events, [['set',0,6],['ramp',.72,6.013],['set',.72,7.83],['ramp',.0001,8]]);
  assert.equal(voice.stops[0], 8.02);
  const master = voice.target.target;
  assert.equal(master.gain.value, .52);
  audio.setVolume(.2);
  assert.deepEqual(master.events, [['target',.2,5,.015]]);
  voice.onended();
  assert(voice.disconnected && voice.target.disconnected);
});

test('停止一个模块只取消自己的声音，不影响其他模块的播放', async () => {
  const {state, channel} = environment(), a = channel(.52), b = channel(.43);
  const sample = await a.piano(60), envelope = {attack:.01,hold:.8,floor:.001,tail:.02};
  a.tone(sample, 6, 1, .7, envelope); b.tone(sample, 6, 1, .6, envelope);
  const token = a.token;
  a.stop();
  assert.notEqual(a.token, token);
  assert.equal(state.voices[0].stops.length, 2);
  assert.equal(state.voices[1].stops.length, 1);
});

async function appFor(t, initial) {
  const app = await createApp({database:createMemoryDatabase(initial)});
  t.after(() => app.assertNoErrors());
  return app;
}
const starts = app => app.audioEvents.filter(event => event.type === 'start');

test('和声两个音同时发声，答题后的分开听仍先低后高', async t => {
  const app = await appFor(t, new Map([[keys.settings, JSON.stringify({enabled:[4], low:60, high:72, autoPlayNext:false})]]));
  await app.click('home-harmonic'); await app.click('play-harmonic');
  const chord = starts(app);
  assert.equal(chord.length, 2);
  assert.equal(chord[0].at, chord[1].at);
  assert.equal(chord[1].midi-chord[0].midi, 4);
  await app.answer('answer-grid', 4); await app.click('hint');
  const split = starts(app).slice(-2);
  assert.equal(split[1].midi-split[0].midi, 4);
  assert(Math.abs(split[1].at-split[0].at-1.26) < 1e-9);
});

test('旋律使用包含前后两个音的原录音，重听复用资源，不拆成合成音', async t => {
  const app = await appFor(t, new Map([[keys.settings, JSON.stringify({enabled:[7],autoPlayNext:false})]]));
  await app.click('home-melodic'); await app.click('play-harmonic'); await app.click('play-harmonic');
  assert.equal(starts(app).length, 2, '每次播放一段完整录音');
  assert(starts(app).every(event => event.rate === 1));
  assert.equal(app.audioEvents.filter(event => event.type === 'decode').length, 1);
  assert(app.get('hint').classList.contains('hidden'));
});

test('音符答对的声音对应谱面实际音高，音程辨认答对仍同时播放双音', async t => {
  const app = await appFor(t, new Map([[keys.sightSession, JSON.stringify(sightSession({accidentals:true}))]]));
  await app.click('home-sight'); await app.answer('sight-keys', 1);
  assert.equal(starts(app)[0].midi, 61, 'C♯4 使用 MIDI 61');
  await app.advance(500); await app.click('back-home'); await app.click('home-staff-interval');
  const question = app.window.StaffIntervalTrainer.backup().set.questions[0];
  await app.answer('staff-interval-options', question.semitones);
  const chord = starts(app).slice(-2);
  assert.deepEqual(chord.map(event => event.midi), [question.low, question.high]);
  assert.equal(chord[0].at, chord[1].at);
  assert.equal(app.audioEvents.filter(event => event.type === 'context').length, 1);
});

for (const sight of [false, true]) {
  test(`${sight ? '音符' : '音程辨认'}声音尚在解码时退出，不在首页迟到发声`, async t => {
    const app = await appFor(t, new Map([[keys.sightSession, JSON.stringify(sightSession())]]));
    const finishes = [];
    app.window.AudioContext.prototype.decodeAudioData = () => new Promise(resolve => { finishes.push(() => resolve({duration:1, midi:60})); });
    await app.click(sight ? 'home-sight' : 'home-staff-interval');
    const answer = sight ? 0 : app.window.StaffIntervalTrainer.backup().set.questions[0].semitones;
    await app.answer(sight ? 'sight-keys' : 'staff-interval-options', answer);
    assert(finishes.length > 0);
    await app.click('back-home'); finishes.forEach(finish => finish()); await app.settle();
    assert.equal(starts(app).length, 0);
  });
}
