'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource} = require('./helpers/app-harness.cjs');
const site = path.resolve(__dirname, '../site');

function serviceWorkerEnvironment() {
  const worker = {registration:{scope:'https://isolated.test/'}, addEventListener(){}};
  return {URL, self:worker, importScripts(file) {
    assert.equal(file, './build-info.js');
    vm.runInNewContext(readSource('build-info.js'), {self:worker});
  }};
}

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
      assert.equal(bytes.subarray(0, 4).toString(), 'RIFF', '应为 WAV 文件：' + file);
      assert.equal(bytes.subarray(8, 12).toString(), 'WAVE', '应为 WAV 文件：' + file);
      assert.equal(bytes.readUInt16LE(20), 3, '应为浮点 WAV：' + file);
      assert.equal(bytes.readUInt16LE(22), 2, '应为双声道录音：' + file);
      assert.equal(bytes.readUInt32LE(24), 44100, '采样率应为 44.1 kHz：' + file);
      assert.equal(bytes.readUInt16LE(34), 32, '应为 32 位录音：' + file);
      paths.push(file);
    }
  }
  assert.equal(new Set(paths).size, 96);
  assert.equal(fs.readdirSync(path.join(site, 'assets/melodic-recordings')).filter(file => file.endsWith('.m4a')).length, 0);
});

test('页面显示版本和构建编号，版本值来自统一版本文件', () => {
  const worker = {};
  vm.runInNewContext(readSource('build-info.js'), {self:worker});
  assert.equal(worker.TonaloomBuildInfo.version, '2.18.10');
  assert.equal(worker.TonaloomBuildInfo.build, 'local');
  const html = readSource('index.html');
  assert.match(html, /id="app-version"/);
  assert.match(html, /id="app-build"/);
});

test('主页版本标记能显示本地开发状态和发布构建编号', () => {
  const elements = {'app-version':{textContent:''},'app-build':{textContent:''}};
  const document = {getElementById:id => elements[id]};
  const source = readSource('build-info.js');
  vm.runInNewContext(source, {self:{}, document});
  assert.equal(elements['app-version'].textContent, '2.18.10');
  assert.equal(elements['app-build'].textContent, '本地开发版');
  vm.runInNewContext(source.replace("build:'local'", "build:'abc1234'"), {self:{}, document});
  assert.equal(elements['app-build'].textContent, '构建 abc1234');
});

test('网页引用的脚本与样式均列入离线清单，新增公共脚本可离线加载', () => {
  const env = serviceWorkerEnvironment();
  const core = vm.runInNewContext(readSource('sw.js')+'; CORE_FILES', env);
  const urls = new Set(Array.from(core, file => new URL(file, 'https://isolated.test/').href));
  const html = readSource('index.html');
  const referenced = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
  referenced.push(...[...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(match => match[1]));
  for (const file of referenced) {
    const url = new URL(file, 'https://isolated.test/');
    assert(urls.has(url.href), '网页依赖及其版本必须进入核心缓存：'+file);
    assert(fs.existsSync(path.join(site, url.pathname.slice(1))), '网页依赖文件必须存在：'+file);
  }
  assert(urls.has('https://isolated.test/audio.js') && urls.has('https://isolated.test/modules.js'));
});

test('离线录音清单与实际出题录音完全对应，没有遗漏或重复', () => {
  const env = serviceWorkerEnvironment();
  const files = Array.from(vm.runInNewContext(readSource('sw.js')+'; AUDIO_FILES', env));
  const context = {window:{}};
  vm.runInNewContext(readSource('assets/melodic-recordings.js'), context);
  const required = Object.values(context.window.MELODIC_RECORDINGS.intervals)
    .flatMap(interval => Object.values(interval).flatMap(direction => Object.values(direction)));
  assert.equal(files.length, 96);
  assert.equal(new Set(files).size, files.length);
  assert.deepEqual(files.sort(), required.sort());
});
