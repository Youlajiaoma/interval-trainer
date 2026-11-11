'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('./helpers/app-harness.cjs');
const env = {};
vm.runInNewContext(readSource('pitch.js'), env);
const pitch = env.TonaloomPitch;
const hz = (midi, cents = 0) => 440 * 2 ** ((midi - 69) / 12 + cents / 1200);
function signal(sampleRate, size, frequency, {vibrato = 0, noise = 0, amplitude = .4, harmonics = false} = {}) {
  const data = new Float32Array(size);
  let phase = 0, seed = 9876;
  for (let i = 0; i < size; i++) {
    const t = i / sampleRate;
    phase += 2 * Math.PI * frequency * 2 ** (vibrato * Math.sin(2 * Math.PI * 5 * t) / 1200) / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = amplitude * (harmonics ? .3 * Math.sin(phase) + .7 * Math.sin(2 * phase) + .35 * Math.sin(3 * phase) : Math.sin(phase)) + noise * (seed / 2 ** 32 - .5);
  }
  return data;
}
for (const sampleRate of [44100, 48000, 96000]) test(`YIN 在 ${sampleRate}Hz 下识别低、中、高音及强泛音人声型信号`, () => {
  const size = sampleRate > 48000 ? 16384 : 8192, detect = pitch.createDetector(sampleRate, size);
  for (const midi of [24, 36, 48, 60, 61, 69, 72, 84, 96]) for (const harmonics of [false, true]) {
    const result = detect(signal(sampleRate, size, hz(midi), {harmonics, noise:.012}));
    assert(result, `应检出 MIDI ${midi}，强泛音 ${harmonics}`);
    assert(Math.abs(1200 * Math.log2(result.hz / hz(midi))) < 12, `应检出基频而非泛音：${midi} → ${result.hz}`);
  }
});
test('静音、直流信号、低音量和非周期噪声不输出音高', () => {
  const detect = pitch.createDetector(48000, 8192);
  for (const data of [new Float32Array(8192), new Float32Array(8192).fill(.4),
    signal(48000, 8192, 440, {amplitude:.001}), signal(48000, 8192, 440, {amplitude:0, noise:.5})]) assert.equal(detect(data), null);
});
function evaluate(makeResult, duration = 1200, step = 50, target = 60) {
  const judge = pitch.createJudge(target);
  let passed = false;
  for (let time = 0; time <= duration; time += step) passed ||= judge.update(makeResult(time), time);
  return passed;
}
const voiced = frequency => ({hz:frequency, rms:.15, confidence:.98});
test('完整观察1.2秒后才判对，0.8秒和1.15秒时都不提前通过', () => {
  for (const step of [25,50,75,100]) {
    const judge = pitch.createJudge(60);
    for (let time = 0; time < 1200; time += step) assert(!judge.update(voiced(hz(60)), time), `不能提前在${time}毫秒通过`);
    assert(judge.update(voiced(hz(60)), 1200));
    judge.reset(); assert(!judge.update(voiced(hz(60)), 1250), '重播后重新累计观察时间');
  }
});
test('目标音及上下整八度都接受，所有其他音级均拒绝', () => {
  for (const octave of [-24,-12,0,12,24]) assert(evaluate(() => voiced(hz(60 + octave))));
  for (let semitone = 1; semitone < 12; semitone++) assert(!evaluate(() => voiced(hz(60 + semitone))));
});
test('人声自然抖动可以通过，持续偏高偏低和宽幅跑调不通过', () => {
  assert(evaluate(time => voiced(hz(60, 43 * Math.sin(2 * Math.PI * 5.2 * time / 1000)))));
  for (const offset of [-60, -40, 40, 60, 100]) assert(!evaluate(() => voiced(hz(60, offset))));
  for (const offset of [-30, 30]) assert(evaluate(() => voiced(hz(60, offset))));
  assert(!evaluate(time => voiced(hz(60, 200 * Math.sin(2 * Math.PI * time / 900)))));
});
test('短暂经过目标、静音、噪声、断续音和卡顿不算持续唱准', () => {
  assert(!evaluate(time => voiced(hz(60, (time - 600) / 2))));
  assert(!evaluate(() => voiced(hz(60)), 450));
  assert(!evaluate(() => null));
  assert(!evaluate(() => ({...voiced(hz(60)), confidence:.5})));
  assert(!evaluate(time => time % 400 < 150 ? voiced(hz(60)) : null));
  assert(!evaluate(() => voiced(hz(60)), 2400, 200));
  const judge = pitch.createJudge(60);
  for (let time = 0; time <= 750; time += 50) assert(!judge.update(voiced(hz(60)), time));
  judge.reset(); assert(!judge.update(voiced(hz(60)), 800));
  assert(!judge.update(voiced(hz(60)), 10000));
});
test('少量漏检仍可通过，判定不依赖屏幕刷新率', () => {
  for (const step of [25, 50, 75, 100]) assert(evaluate(time => time === 500 ? null : voiced(hz(60)), 1400, step));
});
test('音高跟踪过滤短暂向下八度及非整八度误判，恢复后不保留错误频率', () => {
  for (const ratio of [.5, .25, 1 / 3, .42]) for (const badFrames of [1, 2, 3, 4]) {
    const tracker = pitch.createTracker();
    for (let t = 0; t <= 300; t += 50) tracker.update(voiced(hz(49)), t);
    for (let i = 0; i < badFrames; i++) assert.equal(tracker.update(voiced(hz(49) * ratio), 350 + i * 50), null);
    const recovered = tracker.update(voiced(hz(49)), 350 + badFrames * 50);
    assert(recovered); assert.equal(recovered.hz, hz(49));
  }
});
test('真正持续的八度或其他大跳仍显示实际音高，不依赖题目的目标音', () => {
  for (const next of [37, 61, 42, 54]) {
    const tracker = pitch.createTracker();
    for (let t = 0; t <= 300; t += 50) tracker.update(voiced(hz(49)), t);
    let result;
    for (let t = 350; t <= 600; t += 50) result = tracker.update(voiced(hz(next)), t);
    assert(result); assert.equal(result.hz, hz(next));
  }
});
test('跟踪保留自然颤动和连续滑音，静音断线，恢复和重置时重新确认', () => {
  const tracker = pitch.createTracker();
  for (let time = 0; time <= 800; time += 50) {
    const input = voiced(hz(60, 43 * Math.sin(2 * Math.PI * 5.2 * time / 1000)));
    const output = tracker.update(input, time);
    if (time >= 100) assert.equal(output, input);
  }
  for (let time = 850; time <= 1500; time += 50) {
    const input = voiced(hz(60 + (time - 850) / 150));
    assert.equal(tracker.update(input, time), input);
  }
  assert.equal(tracker.update(null, 1550), null);
  assert.equal(tracker.update(null, 1900), null);
  assert.equal(tracker.update(voiced(hz(48)), 1950), null);
  tracker.update(voiced(hz(48)), 2000);
  assert(tracker.update(voiced(hz(48)), 2050));
  tracker.reset(); assert.equal(tracker.update(voiced(hz(48)), 2100), null);
});
