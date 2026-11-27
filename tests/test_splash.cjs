'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = path.resolve(__dirname, '../site');
const read = file => fs.readFileSync(path.join(site, file), 'utf8');

function runSplash(reduced = false, readyState = 'complete', forcePreview = false) {
  const listeners = new Map();
  const classes = new Set();
  let domReady;
  let removed = false;
  const splash = {
    remove() { removed = true; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    classList: {add(name) { classes.add(name); }, contains(name) { return classes.has(name); }}
  };
  const window = {location:{search:forcePreview ? '?previewSplash=1' : ''},matchMedia: () => ({matches: reduced, addEventListener() {}})};
  const document = {readyState,getElementById: id => id === 'splash-screen' ? splash : null,
    addEventListener(type, listener) { if (type === 'DOMContentLoaded') domReady = listener; }};
  vm.runInNewContext(read('splash.js'), {document, window, URLSearchParams});
  return {splash, listeners, removed: () => removed, hasClass: name => classes.has(name), start: () => domReady?.()};
}

test('开屏只用原 Logo 五根竖条与配色，最终回到原始比例', () => {
  const html = read('index.html'), css = read('splash.css');
  const splash = html.match(/<div class="splash-screen"[\s\S]*?<\/div>/)?.[0];
  assert(splash);
  assert.match(splash, /viewBox="161 141 202 231"/);
  assert.equal((splash.match(/<rect\b/g) || []).length, 5);
  assert.doesNotMatch(splash, /<(?:text|image)\b/i);
  assert.match(css, /background:\s*#6c5ba7/i);
  assert.match(css, /fill:\s*#ebe1ff/i);
  assert.match(css, /--splash-motion-duration:\s*2s/);
  assert.match(css, /--splash-amplitude:\s*\.34/);
  assert.match(css, /--splash-hold-duration:\s*\.3s/);
  assert.match(css, /100%\s*\{[\s\S]*?transform:\s*scaleY\(1\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(read('manifest.webmanifest'), /"background_color":\s*"#6c5ba7"/);
});

test('开屏淡出结束后移除；用户减少动态效果时立即移除', () => {
  const normal = runSplash(false,'loading');
  assert.equal(normal.removed(), false);
  normal.start();
  normal.listeners.get('animationend')({target: {}, animationName: 'splash-wave'});
  assert.equal(normal.removed(), false);
  normal.listeners.get('animationend')({target: normal.splash, animationName: 'splash-exit'});
  assert.equal(normal.removed(), true);
  const reduced = runSplash(true);
  assert.equal(reduced.removed(), true);
  const preview = runSplash(true,'complete',true);
  assert.equal(preview.removed(), false);
  assert.equal(preview.hasClass('splash-preview-force'), true);
  preview.listeners.get('animationend')({target:preview.splash,animationName:'splash-exit'});
  assert.equal(preview.removed(), true);
});
