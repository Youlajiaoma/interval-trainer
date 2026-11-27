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

test('CI���ĵ�����ͼ�ͻ��������޸�ֻ����ټ��', () => {
  assert.deepEqual(selectChecks(['README.md', 'AGENTS.md', 'docs/harmony-practice.md', 'tests/test_audio.cjs', 'tests/v15-phone-main.png']), []);
});

test('CI����ϰģ��ֻ��������������飬��ģ��Ķ�ȡ����', () => {
  const cases = [
    [['site/singing.js', 'site/pitch.js', 'site/singing.css'], ['singing']],
    [['site/harmony-practice.js', 'site/harmony-mix.js', 'site/harmony-practice.css',
      'site/assets/harmony-songs.js', 'site/assets/harmony-practice/�¸�/����.wav'], ['harmony']],
    [['site/sight.js', 'site/sight.css', 'site/staff-interval.js'], ['staff']],
    [['site/daily-tasks.js'], ['daily', 'motion']],
    [['site/pwa-register.js', 'site/sw.js', 'site/manifest.webmanifest', 'site/update.html', 'site/build-info.js', 'site/icons/icon-192.png'], ['pwa']],
    [['site/vendor/vexflow-loader.js'], ['staff', 'pwa']],
    [['tests/helpers/navigation-browser.cjs'], ['motion']],
    [['site/singing.js', 'site/harmony-mix.js', 'site/sw.js'], ['singing', 'harmony', 'pwa']]
  ];
  for (const [files, expected] of cases) assert.deepEqual(selectChecks(files), expected, files.join(', '));
});

test('CI������ҳ�桢��Ƶ���洢����鹤�ߵĸĶ�����ȫ����������', () => {
  for (const file of ['site/index.html', 'site/app.js', 'site/styles.css', 'site/audio.js', 'site/storage.js',
    'site/modules.js', 'site/logic.js', 'site/review.js', 'site/statistics.js', 'site/motion.js',
    'site/assets/piano-samples.js', 'tests/run.cjs', 'tests/ci-plan.cjs', 'tests/helpers/app-harness.cjs',
    '.github/workflows/checks.yml', '.github/workflows/pages.yml', 'site/new-module.js']) {
    assert.deepEqual(selectChecks([file]), all, file);
  }
});

test('CI���޸���������Ա��������ж�Ӧ���ԣ�����ģ�⻹Ҫ�� PWA ���', () => {
  assert.deepEqual(selectChecks(['tests/test_harmony_practice_browser.cjs']), ['harmony']);
  assert.deepEqual(selectChecks(['tests/test_ui_embedded.py']), ['ui']);
  assert.deepEqual(selectChecks(['tests/test_pwa_integration.py', 'tests/test_sw.cjs']), ['pwa']);
});

test('CI��һ�����Ͷ���ύʱ�Ƚ�����ǰ�󣬰��������ύ�����Ƶ�޸�', () => {
  const plan = planChecks(push, {before: base}, (from, to) => {
    assert.equal(from, base); assert.equal(to, head);
    return ['site/singing.js', 'README.md'];
  });
  assert.deepEqual(plan.checks, ['singing']);
});

test('CI�������ľɡ���·����ͬ������鷶Χ�����������ĵ�Ŀ¼��©��', () => {
  assert.deepEqual(selectChecks(['site/harmony-mix.js', 'docs/old-mix.js']), ['harmony']);
});

test('CI��main �������Ķ�ѡ���������飬�ֶ�����ʽ��������� main PR ��ȫ��', () => {
  const noDiff = () => { assert.fail('������鲻Ӧ����������'); };
  for (const [environment, event] of [
    [{...push, CI_FULL: 'true'}, {before: base}],
    [{...push, GITHUB_EVENT_NAME: 'pull_request', CI_FULL: 'false'}, {pull_request: {base: {ref: 'main', sha: base}}}],
    [{GITHUB_EVENT_NAME: 'workflow_dispatch'}, {}],
    [{GITHUB_EVENT_NAME: 'workflow_call'}, {}]
  ]) assert.deepEqual(planChecks(environment, event, noDiff).checks, all);
  const plan = planChecks({...push, GITHUB_REF: 'refs/heads/main', CI_FULL: 'false'}, {before: base},
    (from, to) => { assert.equal(from, base); assert.equal(to, head); return ['tests/helpers/navigation-browser.cjs']; });
  assert.deepEqual(plan.checks, ['motion']);
  assert.deepEqual(planChecks({...push, GITHUB_REF: 'refs/heads/main', CI_FULL: 'false'}, {}, noDiff).checks, all);
});

test('CI: reusable workflow accepts the caller base SHA for changed-file checks', () => {
  const environment = {GITHUB_EVENT_NAME: 'workflow_call', GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: head, CI_FULL: 'false', CI_BASE_SHA: base};
  const plan = planChecks(environment, {}, (from, to) => {
    assert.equal(from, base); assert.equal(to, head); return ['tests/helpers/navigation-browser.cjs'];
  });
  assert.deepEqual(plan.checks, ['motion']);
});

test('CI��dev PR �Ƚ�Ŀ���֧�͵�ǰ�ϲ����', () => {
  const environment = {...push, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/7/merge'};
  const event = {pull_request: {base: {ref: 'dev', sha: base}, head: {sha: 'c'.repeat(40)}}};
  const plan = planChecks(environment, event, (from, to) => {
    assert.equal(from, base); assert.equal(to, head);
    return ['site/sight.js'];
  });
  assert.deepEqual(plan.checks, ['staff']);
});

test('CI���״����͡�ȱ�ٲ�����޷�ʶ���¼�ʱ�˻��������', () => {
  const unavailable = () => { throw Error('before commit unavailable'); };
  assert.deepEqual(planChecks(push, {before: '0'.repeat(40)}, unavailable).checks, all);
  assert.deepEqual(planChecks(push, {}, unavailable).checks, all);
  assert.deepEqual(planChecks(push, null, unavailable).checks, all);
  assert.deepEqual(planChecks({...push, GITHUB_SHA: '--unsafe'}, {before: base}, unavailable).checks, all);
  assert.deepEqual(planChecks(push, {before: base}, unavailable).checks, all);
  assert.deepEqual(planChecks({GITHUB_EVENT_NAME: 'unknown'}, {}, unavailable).checks, all);
});

test('CI��ѡ����������ʱ�ܾ�ƴд���󡢿��б��ͻ����ͻ�Ĳ���', () => {
  for (const args of [['--browser-only='], ['--browser-only=singng'], ['--browser-only=singing', '--full'],
    ['--browser-only=staff', '--browser-only=harmony']]) {
    const result = spawnSync(process.execPath, ['tests/run.cjs', ...args], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true
    });
    assert.equal(result.status, 2, args.join(' '));
  }
});

test('CI��ѡ������������ȱ�ٻ���ʱ����ʧ�ܣ����ظ����л������', () => {
  for (const id of ['staff', 'ui']) {
    const result = spawnSync(process.execPath, ['tests/run.cjs', '--browser-only=' + id], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true,
      env: {...process.env, CHROMIUM_PATH: path.join(__dirname, 'missing-browser'), PYTHON: path.join(__dirname, 'missing-python')}
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /ͨ�� 0��ʧ�� 0������ 1/);
    assert.doesNotMatch(result.stdout, /���߻���ģ��|\[ͨ��\]/);
  }
});

test('CI��ʵ�����������ȷ���ݿ�����������鷶Χ��ʹ�ö�����ժҪ�ļ�', () => {
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
      assert.match(fs.readFileSync(summary, 'utf8'), /���������߻���ģ��ʼ������/);
    }
  } finally {
    for (const file of [payload, output, summary]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});
