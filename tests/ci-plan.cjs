'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

// Shared with the local runner so CI cannot silently omit a newly listed suite.
const browserChecks = [
  {id: 'staff', name: '��������������', file: 'tests/test_staff_interval.cjs', runtime: 'node'},
  {id: 'daily', name: 'ÿ��������������', file: 'tests/test_daily_tasks_browser.cjs', runtime: 'node'},
  {id: 'motion', name: '���涯����������', file: 'tests/test_motion_browser.cjs', runtime: 'node'},
  {id: 'singing', name: 'ģ����������', file: 'tests/test_singing_browser.cjs', runtime: 'node'},
  {id: 'harmony', name: '����������������', file: 'tests/test_harmony_practice_browser.cjs', runtime: 'node'},
  {id: 'ui', name: '�ֻ���ƽ�����', file: 'tests/test_ui_embedded.py', runtime: 'python'},
  {id: 'pwa', name: 'PWA ����������뱣��', file: 'tests/test_pwa_integration.py', runtime: 'python'}
];
const allChecks = browserChecks.map(check => check.id);

function selectChecks(files) {
  const selected = new Set();
  for (const file of files) {
    const browserTest = browserChecks.find(check => check.file === file);
    if (browserTest) { selected.add(browserTest.id); continue; }
    // No browser behavior changes for documentation or dependency-free tests.
    if (/\.md$/i.test(file) || /^docs\//.test(file) || /^tests\/.*\.(png|jpg)$/.test(file)) continue;
    if (/^tests\/test_.*\.cjs$/.test(file) && file !== 'tests/test_sw.cjs') continue;
    if (file === 'tests/helpers/navigation-browser.cjs') { selected.add('motion'); continue; }
    if (/^site\/(singing\.(js|css)|pitch\.js)$/.test(file)) selected.add('singing');
    else if (/^site\/(harmony-(practice\.(js|css)|mix\.js)|assets\/(harmony-songs\.js|harmony-practice\/.*))$/.test(file)) selected.add('harmony');
    else if (/^site\/(sight\.(js|css)|staff-interval\.js)$/.test(file)) selected.add('staff');
    else if (file === 'site/daily-tasks.js') { selected.add('daily'); selected.add('motion'); }
    else if (/^site\/vendor\//.test(file)) { selected.add('staff'); selected.add('pwa'); }
    else if (/^site\/(sw\.js|pwa-register\.js|manifest\.webmanifest|update\.html|build-info\.js|icons\/.*)$/.test(file) || file === 'tests/test_sw.cjs') selected.add('pwa');
    // Shared UI, audio, storage, test tooling, workflows and unfamiliar files
    // use every suite. New code defaults to safety until explicitly classified.
    else return [...allChecks];
  }
  return allChecks.filter(id => selected.has(id));
}

function planChecks(environment, event, diff) {
  event = event || {};
  const full = reason => ({checks: [...allChecks], reason});
  if (environment.CI_FULL === 'true' || environment.GITHUB_EVENT_NAME === 'workflow_dispatch' ||
      event.pull_request?.base?.ref === 'main') return full('�������ֶ����л���÷�Ҫ���������');

  const valid = sha => typeof sha === 'string' && /^[a-f0-9]{40}$/i.test(sha) && !/^0+$/.test(sha);
  let base;
  if (valid(environment.CI_BASE_SHA)) base = environment.CI_BASE_SHA;
  else if (environment.GITHUB_EVENT_NAME === 'push' &&
      ['refs/heads/dev', 'refs/heads/main'].includes(environment.GITHUB_REF)) base = event.before;
  else if (environment.GITHUB_EVENT_NAME === 'pull_request' && event.pull_request?.base?.ref === 'dev') base = event.pull_request.base.sha;
  else return full('�޷�ȷ�����θĶ���Χ�������������');

  const head = environment.GITHUB_SHA;
  if (!valid(base) || !valid(head)) return full('�״����ͻ�ȱ���ύ��Ϣ�������������');
  try {
    // Push: compare the entire push, not just the last commit. PR: compare the
    // base with GitHub's checked-out merge result, including merge effects.
    const checks = selectChecks(diff(base, head));
    return {checks, reason: checks.length === allChecks.length ? '����������������иĶ��������������' : '�����θĶ�ѡ�������������'};
  } catch {
    return full('�޷���ȡ�ύ���죬�����������');
  }
}

function diffFiles(base, head) {
  const root = path.resolve(__dirname, '..');
  const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8', timeout: 60000,
    maxBuffer: 8 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  try { git(['cat-file', '-e', base + '^{commit}']); }
  catch {
    // Fetch only the needed snapshot. Full history contains large old audio
    // files and would make even documentation-only pushes expensive.
    git(['fetch', '--no-tags', '--depth=1', 'origin', base]);
  }
  // --no-renames includes both old and new paths; -z handles Unicode/spaces.
  return git(['diff', '--no-renames', '--name-only', '-z', base, head, '--']).split('\0').filter(Boolean);
}

function main() {
  let event = {};
  try { event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')); }
  catch { /* An unavailable payload causes the safe, full-check fallback. */ }
  const plan = planChecks(process.env, event, diffFiles);
  const outputs = {
    browser_checks: plan.checks.join(','),
    needs_browser: String(plan.checks.length > 0),
    needs_python: String(browserChecks.some(check => plan.checks.includes(check.id) && check.runtime === 'python'))
  };
  console.log(plan.reason + '��');
  console.log('���������߻���ģ�⣺ʼ�����С�');
  console.log('�������飺' + (plan.checks.map(id => browserChecks.find(check => check.id === id).name).join('��') || '������������'));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(outputs).map(([key, value]) => key + '=' + value + '\n').join(''));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '### ��鷶Χ\n\n' + plan.reason + '�����������߻���ģ��ʼ�����С�\n\n' +
    (plan.checks.length ? plan.checks.map(id => '- ' + browserChecks.find(check => check.id === id).name).join('\n') : '���������������飬����װ�����������') + '\n');
}

module.exports = {browserChecks, selectChecks, planChecks};
if (require.main === module) main();
