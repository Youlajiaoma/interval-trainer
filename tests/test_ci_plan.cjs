'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync, execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {selectChecks, planChecks} = require('./ci-plan.cjs');

const all = ['staff', 'daily', 'motion', 'singing', 'harmony', 'ui', 'pwa'];
const base = 'a'.repeat(40), head = 'b'.repeat(40);
const push = {GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/dev', GITHUB_SHA: head};

test('CI：文档、截图和基础测试修改只需快速检查', () => {
  assert.deepEqual(selectChecks(['README.md', 'AGENTS.md', 'docs/harmony-practice.md', 'tests/test_audio.cjs', 'tests/v15-phone-main.png']), []);
});

test('CI：练习模块只加跑相关浏览器检查，多模块改动取并集', () => {
  const cases = [
    [['site/singing.js', 'site/pitch.js', 'site/singing.css'], ['singing']],
    [['site/harmony-practice.js', 'site/harmony-mix.js', 'site/harmony-practice.css',
      'site/assets/harmony-songs.js', 'site/assets/harmony-practice/新歌/旋律.wav'], ['harmony']],
    [['site/sight.js', 'site/sight.css', 'site/staff-interval.js'], ['staff']],
    [['site/daily-tasks.js'], ['daily', 'motion']],
    [['site/pwa-register.js', 'site/sw.js', 'site/manifest.webmanifest', 'site/update.html', 'site/build-info.js', 'site/icons/icon-192.png'], ['pwa']],
    [['site/vendor/vexflow-loader.js'], ['staff', 'pwa']],
    [['site/singing.js', 'site/harmony-mix.js', 'site/sw.js'], ['singing', 'harmony', 'pwa']]
  ];
  for (const [files, expected] of cases) assert.deepEqual(selectChecks(files), expected, files.join(', '));
});

test('CI：公共页面、音频、存储及检查工具的改动保留全部浏览器检查', () => {
  for (const file of ['site/index.html', 'site/app.js', 'site/styles.css', 'site/audio.js', 'site/storage.js',
    'site/modules.js', 'site/logic.js', 'site/review.js', 'site/statistics.js', 'site/motion.js',
    'site/assets/piano-samples.js', 'tests/run.cjs', 'tests/ci-plan.cjs', 'tests/helpers/app-harness.cjs',
    '.github/workflows/checks.yml', '.github/workflows/pages.yml', 'site/new-module.js']) {
    assert.deepEqual(selectChecks([file]), all, file);
  }
});

test('CI：修改浏览器测试本身会运行对应测试，缓存模拟还要求 PWA 检查', () => {
  assert.deepEqual(selectChecks(['tests/test_harmony_practice_browser.cjs']), ['harmony']);
  assert.deepEqual(selectChecks(['tests/test_ui_embedded.py']), ['ui']);
  assert.deepEqual(selectChecks(['tests/test_pwa_integration.py', 'tests/test_sw.cjs']), ['pwa']);
});

test('CI：一次推送多个提交时比较推送前后，包含较早提交里的音频修改', () => {
  const plan = planChecks(push, {before: base}, (from, to) => {
    assert.equal(from, base); assert.equal(to, head);
    return ['site/singing.js', 'README.md'];
  });
  assert.deepEqual(plan.checks, ['singing']);
});

test('CI：改名的旧、新路径共同决定检查范围，不因移入文档目录而漏检', () => {
  assert.deepEqual(selectChecks(['site/harmony-mix.js', 'docs/old-mix.js']), ['harmony']);
});

test('CI：main 发布、向 main 合并及手动执行必须完整检查，即使只改文档', () => {
  const noDiff = () => { assert.fail('完整检查不应依赖差异结果'); };
  for (const [environment, event] of [
    [{...push, CI_FULL: 'true'}, {before: base}],
    [{...push, GITHUB_REF: 'refs/heads/main', CI_FULL: 'false'}, {before: base}],
    [{...push, GITHUB_EVENT_NAME: 'pull_request', CI_FULL: 'false'}, {pull_request: {base: {ref: 'main', sha: base}}}],
    [{GITHUB_EVENT_NAME: 'workflow_dispatch'}, {}],
    [{GITHUB_EVENT_NAME: 'workflow_call'}, {}]
  ]) assert.deepEqual(planChecks(environment, event, noDiff).checks, all);
});

test('CI：dev PR 比较目标分支和当前合并结果', () => {
  const environment = {...push, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/7/merge'};
  const event = {pull_request: {base: {ref: 'dev', sha: base}, head: {sha: 'c'.repeat(40)}}};
  const plan = planChecks(environment, event, (from, to) => {
    assert.equal(from, base); assert.equal(to, head);
    return ['site/sight.js'];
  });
  assert.deepEqual(plan.checks, ['staff']);
});

test('CI：首次推送、缺少差异或无法识别事件时退回完整检查', () => {
  const unavailable = () => { throw Error('before commit unavailable'); };
  assert.deepEqual(planChecks(push, {before: '0'.repeat(40)}, unavailable).checks, all);
  assert.deepEqual(planChecks(push, {}, unavailable).checks, all);
  assert.deepEqual(planChecks(push, null, unavailable).checks, all);
  assert.deepEqual(planChecks({...push, GITHUB_SHA: '--unsafe'}, {before: base}, unavailable).checks, all);
  assert.deepEqual(planChecks(push, {before: base}, unavailable).checks, all);
  assert.deepEqual(planChecks({GITHUB_EVENT_NAME: 'unknown'}, {}, unavailable).checks, all);
});

test('CI：选择浏览器检查时拒绝拼写错误、空列表和互相冲突的参数', () => {
  for (const args of [['--browser-only='], ['--browser-only=singng'], ['--browser-only=singing', '--full'],
    ['--browser-only=staff', '--browser-only=harmony']]) {
    const result = spawnSync(process.execPath, ['tests/run.cjs', ...args], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true
    });
    assert.equal(result.status, 2, args.join(' '));
  }
});

test('CI：选定的浏览器检查缺少环境时返回失败，不重复运行基础检查', () => {
  for (const id of ['staff', 'ui']) {
    const result = spawnSync(process.execPath, ['tests/run.cjs', '--browser-only=' + id], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true,
      env: {...process.env, CHROMIUM_PATH: path.join(__dirname, 'missing-browser'), PYTHON: path.join(__dirname, 'missing-python')}
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /通过 0，失败 0，跳过 1/);
    assert.doesNotMatch(result.stdout, /离线缓存模拟|\[通过\]/);
  }
});

test('CI：实际命令输出正确传递快速与完整检查范围，使用独立的摘要文件', () => {
  const root = path.resolve(__dirname, '..');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8', windowsHide: true}).trim();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonaloom-ci-plan-'));
  const payload = path.join(directory, 'event.json'), output = path.join(directory, 'output'), summary = path.join(directory, 'summary');
  try {
    fs.writeFileSync(payload, JSON.stringify({before: sha}));
    for (const full of [false, true]) {
      fs.writeFileSync(output, ''); fs.writeFileSync(summary, '');
      const result = spawnSync(process.execPath, ['tests/ci-plan.cjs'], {
        cwd: root, encoding: 'utf8', windowsHide: true,
        env: {...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/dev', GITHUB_SHA: sha,
          CI_FULL: String(full), GITHUB_EVENT_PATH: payload, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary}
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const outputs = Object.fromEntries(fs.readFileSync(output, 'utf8').trimEnd().split('\n').map(line => line.split('=')));
      assert.equal(outputs.needs_browser, String(full));
      assert.equal(outputs.needs_python, String(full));
      assert.equal(outputs.browser_checks, full ? all.join(',') : '');
      assert.match(fs.readFileSync(summary, 'utf8'), /基础与离线缓存模拟始终运行/);
    }
  } finally {
    for (const file of [payload, output, summary]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});
