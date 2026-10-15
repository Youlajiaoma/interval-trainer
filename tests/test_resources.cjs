'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource} = require('./helpers/app-harness.cjs');
const site = path.resolve(__dirname, '../site');

test('C2 至 C7 的 61 个钢琴采样键均有非空音频数据', () => {
  const context = {window: {}};
  vm.runInNewContext(readSource('assets/piano-samples.js'), context);
  const samples = context.window.PIANO_SAMPLES;
  assert.equal(Object.keys(samples).length, 61);
  for (let midi = 36; midi <= 96; midi++) {
    assert.equal(typeof samples[midi], 'string');
    assert(Buffer.from(samples[midi], 'base64').length > 100, '钢琴采样不应为空：' + midi);
  }
});

test('12 类旋律音程的上下行、四乐器共 96 个录音路径可读取', () => {
  const context = {window: {}};
  vm.runInNewContext(readSource('assets/melodic-recordings.js'), context);
  const library = context.window.MELODIC_RECORDINGS;
  const paths = [];
  for (let semi = 1; semi <= 12; semi++) for (const direction of ['up', 'down']) {
    for (const timbre of ['piano', 'guitar', 'sax', 'flute']) {
      const file = library.intervals[semi]?.[direction]?.[timbre];
      assert.equal(typeof file, 'string', '应包含每种录音组合');
      assert(file.startsWith('assets/melodic-recordings/'));
      const bytes = fs.readFileSync(path.join(site, file));
      assert(bytes.length > 100);
      assert.equal(bytes.subarray(4, 8).toString(), 'ftyp', '应为可识别的录音容器：' + file);
      paths.push(file);
    }
  }
  assert.equal(new Set(paths).size, 96);
});
