'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp, readSource} = require('./helpers/app-harness.cjs');

test('浏览器保存了旧统计脚本时，新页面仍加载配套脚本并打开首页及音符统计', async () => {
  const base = 'http://localhost:8000/';
  const files = ['app.js', 'statistics.js', 'sight.js'];
  // Model a browser cache keyed by the complete request URL, including search.
  const cached = new Map(files.map(file => [new URL(file, base).href,
    `throw Error('旧版 ${file} 与新统计页面不兼容');`]));
  const sourceOverrides = {};
  for (const match of readSource('index.html').matchAll(/<script\s+src="([^"]+)"/g)) {
    const url = new URL(match[1], base), file = url.pathname.slice(1);
    if (files.includes(file)) sourceOverrides[file] = cached.get(url.href) ?? readSource(file);
  }
  const app = await createApp({sourceOverrides});
  await app.click('home-stats');
  assert(app.get('stats-dialog').open, '首页统计必须能打开');
  await app.click('stats-sight');
  assert.equal(app.get('stats-performance-title').textContent, '各音符表现');
  assert.equal(app.get('stats-summary').children[0].children.length, 4);
  assert.equal(app.get('stats-calendar').children[0].children[0].children.length, 49);
  await app.click('stats-staff');
  assert.equal(app.get('stats-performance-title').textContent, '各音程表现');
  app.assertNoErrors();
});

test('音符旧页遗留的隐藏状态不会让共用统计空白，四类统计都能恢复显示', async () => {
  const app = await createApp();
  await app.click('home-stats');
  for (const mode of ['sight', 'staff', 'melodic', 'harmonic']) {
    app.get('stats-dialog').classList.add('sight-stats-active');
    await app.click('stats-'+mode);
    assert(!app.get('stats-dialog').classList.contains('sight-stats-active'), '旧样式的隐藏条件必须移除');
    assert.equal(app.get('stats-summary').children[0].children.length, 4);
    assert.equal(app.get('stats-calendar').children[0].children[0].children.length, 49);
  }
  app.assertNoErrors();
});
