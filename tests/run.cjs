'use strict';

// No package install, asset download, workflow change or persistent browser
// profile is performed by this entry point.
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {run} = require('node:test');
const root = path.resolve(__dirname, '..');
const options = new Set(process.argv.slice(2));
const allowed = new Set(['--help', '--full', '--details']);
if ([...options].some(option => !allowed.has(option))) {
  console.error('未知选项。使用 node tests/run.cjs --help 查看用法。');
  process.exit(2);
}
if (options.has('--help')) {
  console.log('用法：node tests/run.cjs [--full] [--details]\n' +
    '默认：运行不需要额外依赖的基础和回归检查；缺少资源的附加检查明确跳过。\n' +
    '--full：还要求离线缓存及三项浏览器检查；缺少条件也返回失败。\n' +
    '--details：显示失败断言的详细原因。\n' +
    '有任何功能失败时返回非零退出码。准备方式见 tests/README.md。');
  process.exit(0);
}

const environment = {...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1'};
const totals = {passed: 0, failed: 0, skipped: 0};
function skipped(name, reason) { totals.skipped++; console.log('[跳过] ' + name + '：' + reason); }
function command(executable, args, capture = false) {
  return new Promise(resolve => {
    const child = spawn(executable, args, {cwd: root, env: environment, windowsHide: true,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit']});
    let stdout = '', stderr = '';
    child.stdout?.on('data', data => { stdout += data; });
    child.stderr?.on('data', data => { stderr += data; });
    child.on('error', error => resolve({code: 127, stdout, stderr: error.message}));
    child.on('close', code => resolve({code: code ?? 1, stdout, stderr}));
  });
}
async function externalTest(name, executable, args) {
  const result = await command(executable, args);
  if (result.code === 0) { totals.passed++; console.log('[通过] ' + name); }
  else { totals.failed++; console.log('[失败] ' + name + '（退出码 ' + result.code + '）'); }
}

async function main() {
  console.log('运行基础与回归检查；所有练习数据均与日常浏览器隔离。');
  const optionalFiles = new Set(['test_sw.cjs', 'test_staff_interval.cjs']);
  const files = fs.readdirSync(__dirname).filter(file => /^test_.*\.cjs$/.test(file) && !optionalFiles.has(file))
    .sort().map(file => path.join(__dirname, file));
  for await (const event of run({files, concurrency: 1})) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const data = event.data;
    const name = data.name.startsWith(root) ? path.relative(root, data.name) : data.name;
    if (data.skip || data.todo) { skipped(name, String(data.skip || data.todo)); continue; }
    if (event.type === 'test:pass') { totals.passed++; console.log('[通过] ' + name); }
    else {
      totals.failed++;
      const error = data.details?.error?.cause || data.details?.error;
      const message = String(error?.message || error || '检查未通过');
      console.log('[失败] ' + name + '\n       ' + message.split('\n')[0]);
      if (options.has('--details')) console.log(error?.stack || error);
    }
  }

  const vendorReady = fs.existsSync(path.join(root, 'site/vendor/vexflow.js'));
  if (vendorReady) await externalTest('离线缓存模拟', process.execPath, ['tests/test_sw.cjs']);
  else skipped('离线缓存模拟', '缺少 site/vendor/vexflow.js；发布流程会下载，本命令不会自动下载');

  if (!options.has('--full')) {
    for (const name of ['手机和平板界面', '五线谱浏览器检查', 'PWA 浏览器离线与保存']) {
      skipped(name, '使用 --full 显式运行，需事先准备浏览器测试环境');
    }
  } else {
    let nodeBrowserReady = false;
    try {
      const {chromium} = require('playwright');
      nodeBrowserReady = fs.existsSync(process.env.CHROMIUM_PATH || chromium.executablePath());
    } catch { /* Report missing prerequisites below instead of installing. */ }
    if (!vendorReady || !nodeBrowserReady) {
      skipped('五线谱浏览器检查', '需要 Node 版 Playwright、Chromium 和本地 VexFlow 文件');
    } else await externalTest('五线谱浏览器检查', process.execPath, ['tests/test_staff_interval.cjs']);

    const python = process.env.PYTHON || 'python';
    const probe = await command(python, ['-B', '-c',
      'import os\nfrom pathlib import Path\nfrom playwright.sync_api import sync_playwright\n' +
      'with sync_playwright() as p:\n' +
      '    executable = os.environ.get("CHROMIUM_PATH") or ("/usr/bin/chromium" if Path("/usr/bin/chromium").exists() else p.chromium.executable_path)\n' +
      '    assert Path(executable).is_file(), "Chromium unavailable"'], true);
    if (probe.code !== 0) {
      skipped('手机和平板界面', '需要 Python、Python 版 Playwright 和 Chromium');
      skipped('PWA 浏览器离线与保存', '需要 Python、Python 版 Playwright 和 Chromium');
    } else {
      await externalTest('手机和平板界面', python, ['-B', 'tests/test_ui_embedded.py']);
      let serverReady = false;
      try {
        const url = new URL(process.env.PWA_TEST_URL || 'http://localhost:8000/');
        if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:') {
          throw Error('PWA tests require a local HTTP server');
        }
        const response = await fetch(url, {signal: AbortSignal.timeout(2000), redirect: 'error'});
        const html = await response.text();
        serverReady = response.ok && html.includes('id="home-harmonic"') && /<script\s+src="app\.js(?:\?[^"]*)?"/.test(html);
      } catch { /* Never start a server or contact a production site automatically. */ }
      if (!vendorReady || !serverReady) skipped('PWA 浏览器离线与保存', '需要本地 VexFlow 文件及已启动的本地 Tonaloom 网页服务');
      else await externalTest('PWA 浏览器离线与保存', python, ['-B', 'tests/test_pwa_integration.py']);
    }
  }
  console.log(`\n结果：通过 ${totals.passed}，失败 ${totals.failed}，跳过 ${totals.skipped}。`);
  if (totals.failed) console.log('功能检查未通过；审查中尚未修复的问题也按失败计入。');
  if (totals.skipped) console.log('跳过的检查没有得到通过结论。');
  process.exitCode = totals.failed || (options.has('--full') && totals.skipped) ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
