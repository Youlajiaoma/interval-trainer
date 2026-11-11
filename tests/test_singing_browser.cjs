'use strict';
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const site = path.resolve(__dirname, '../site');
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), 'tonaloom-singing-'));
const settingsKey = 'tonaloom-singing-settings-v1', reviewKey = 'tonaloom-singing-review-v1';
async function resultCount(page) {
  return page.evaluate(key => JSON.parse(IntervalPwaStorageAdapter.getItem(key) || '{"totalAnswers":0}').totalAnswers, reviewKey);
}
async function listening(page) {
  await page.waitForFunction(() => document.getElementById('singing-listener').dataset.state === 'listening');
  assert.match(await page.locator('#singing-status').innerText(), /可以模唱/);
}
async function live(page) {
  return page.evaluate(() => singingCapture.tracks.filter(track => track.readyState === 'live').length);
}
async function pause(page, milliseconds) {
  // Deliberate audio duration/negative assertion, not a readiness substitute.
  await page.waitForTimeout(milliseconds);
}
async function closeSettings(page) {
  await page.click('#singing-settings-done'); await page.waitForSelector('#singing-settings', {state:'hidden'});
}
async function installMicrophone(page) {
  await page.addInitScript(() => {
    const capture = {calls:0, stopped:0, mode:'normal', pending:null, tracks:[], glitchFrames:0};
    window.singingCapture = capture;
    let pitch;
    Object.defineProperty(window, 'TonaloomPitch', {get:() => pitch, set(api) {
      pitch = {...api, createDetector(...args) {
        const detector = api.createDetector(...args);
        return frame => {
          const result = detector(frame);
          if (result && capture.glitchFrames > 0) { capture.glitchFrames--; return {...result, hz:result.hz / 4}; }
          return result;
        };
      }};
    }});
    async function acquire() {
      capture.calls++;
      if (capture.mode === 'denied') throw new DOMException('Denied', 'NotAllowedError');
      if (capture.mode === 'missing') throw new DOMException('Missing', 'NotFoundError');
      const device = new AudioContext(); await device.resume();
      const oscillator = device.createOscillator(), gain = device.createGain(), destination = device.createMediaStreamDestination();
      oscillator.type = 'sine'; oscillator.frequency.value = 261.625565;
      gain.gain.value = 0; oscillator.connect(gain); gain.connect(destination); oscillator.start();
      capture.oscillator = oscillator; capture.gain = gain; capture.context = device;
      capture.track = destination.stream.getAudioTracks()[0];
      capture.tracks.push(capture.track); capture.vibrato = null;
      for (const track of destination.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { if (track.readyState !== 'ended') { capture.stopped++; oscillator.stop(); void device.close(); } stop(); };
      }
      if (capture.mode === 'pending') return new Promise(resolve => { capture.pending = () => resolve(destination.stream); });
      return destination.stream;
    }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value:acquire});
    capture.sing = (frequency, amplitude = .3, vibrato = 0) => {
      capture.oscillator.frequency.value = frequency; capture.gain.gain.value = amplitude;
      if (capture.vibrato) { capture.vibrato.stop(); capture.vibrato = null; }
      if (vibrato) {
        const wave = capture.context.createOscillator(), depth = capture.context.createGain();
        wave.frequency.value = 5.2; depth.gain.value = vibrato; wave.connect(depth); depth.connect(capture.oscillator.detune); wave.start();
        capture.vibrato = wave;
      }
    };
    capture.silence = () => { capture.gain.gain.value = 0; };
  });
}
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined});
  try {
    for (const width of [320, 390, 900]) {
      const context = await browser.newContext({viewport:{width, height:900}, serviceWorkers:'block'});
      await context.route('http://127.0.0.1:8771/**', async route => {
        const file = path.join(site, new URL(route.request().url()).pathname.replace(/\/$/, '/index.html'));
        try { await route.fulfill({path:file}); } catch { await route.fulfill({status:404, body:''}); }
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', err => errors.push(err.message));
      await installMicrophone(page);
      await page.goto('http://127.0.0.1:8771/');
      await page.waitForFunction(() => window.IntervalAppReady && TonaloomModules.get('singing').enter);
      await page.click('#home-singing');
      assert.equal(await page.evaluate(() => singingCapture.calls), 0, '进入不自动索取麦克风');
      await page.click('#open-settings');
      await page.selectOption('#singing-low', '60'); await page.selectOption('#singing-high', '60');
      await closeSettings(page);
      assert.equal(await page.locator('#singing-mic').count(), 0, '取消单独开启麦克风按钮');
      await page.click('#singing-play');
      await page.waitForFunction(() => singingCapture.calls === 1 && singingCapture.gain);
      assert.equal(await page.evaluate(() => singingCapture.track.enabled), false, '钢琴播放期间麦克风输入关闭');
      await page.evaluate(() => singingCapture.sing(261.625565));
      await pause(page, 900);
      assert.equal(await resultCount(page), 0, '钢琴播放及尾音期间不判题');
      assert.equal(await page.locator('#singing-listener').getAttribute('data-state'), 'idle', '播放期间麦克风提示未亮');
      assert.equal(await page.locator('.singing-trace').getAttribute('d'), '', '播放期间不分析或绘制麦克风信号');
      await page.evaluate(() => singingCapture.sing(277.182631));
      await listening(page);
      assert.equal(await page.evaluate(() => singingCapture.track.enabled), true, '播放结束后恢复麦克风输入');
      await page.waitForFunction(() => document.getElementById('singing-frequency').textContent.includes('C♯4'));
      await pause(page, 1150); assert.equal(await resultCount(page), 0, '相邻半音不可误判');
      await page.evaluate(() => {
        singingCapture.beforeReplay = singingCapture.track;
        document.getElementById('singing-play').click();
        singingCapture.replayState = document.getElementById('singing-listener').dataset.state;
      });
      assert.equal(await page.evaluate(() => singingCapture.beforeReplay.readyState), 'ended', '模唱中重听立即停止旧麦克风');
      assert.equal(await page.evaluate(() => singingCapture.replayState), 'idle', '重听立即暂停检测');
      await page.waitForFunction(() => singingCapture.calls === 2 && singingCapture.track !== singingCapture.beforeReplay);
      assert.equal(await page.evaluate(() => singingCapture.track.enabled), false);
      await page.evaluate(() => singingCapture.sing(277.182631));
      await pause(page, 900);
      assert.equal(await page.locator('#singing-listener').getAttribute('data-state'), 'idle');
      assert.equal(await page.locator('.singing-trace').getAttribute('d'), '', '重听期间不收集人声曲线');
      assert.equal(await resultCount(page), 0);
      await listening(page);
      assert.equal(await page.evaluate(() => singingCapture.track.enabled), true);
      await page.waitForFunction(() => document.getElementById('singing-frequency').textContent.includes('C♯4'));
      await page.evaluate(() => { singingCapture.glitchFrames = 2; });
      await page.waitForFunction(() => singingCapture.glitchFrames === 0); await pause(page, 200);
      assert(await page.locator('.singing-trace').evaluate(path => path.getBBox().height < 10), '单次大幅向下误判不画成尖刺');
      assert((await page.locator('.singing-trace').getAttribute('d')).split('M').length >= 3, '误判帧断线，恢复后继续绘制');
      await page.screenshot({path:path.join(screenshots, `${width}-listening.png`)});
      await page.evaluate(() => singingCapture.sing(261.625565, .3, 42));
      await page.waitForFunction(key => JSON.parse(IntervalPwaStorageAdapter.getItem(key) || '{}').totalAnswers === 1, reviewKey);
      assert.match(await page.locator('#singing-status').innerText(), /正确/);
      assert.equal(await page.locator('#singing-listener').getAttribute('data-state'), 'correct');
      assert.equal(await live(page), 0, '唱准后自动关闭麦克风');
      const trace = await page.locator('.singing-trace').getAttribute('d'); assert(trace.includes('L'));
      await pause(page, 500);
      assert.equal(await page.locator('.singing-trace').getAttribute('d'), trace, '完成后保留曲线并停止更新');
      await page.screenshot({path:path.join(screenshots, `${width}-vibrato.png`)});
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), '页面无横向溢出');
      assert(await page.locator('#singing-chart').evaluate(svg => svg.getBoundingClientRect().width <= innerWidth));
      await page.click('#singing-next');
      await listening(page);
      await page.evaluate(() => singingCapture.sing(130.812783));
      await page.waitForFunction(key => JSON.parse(IntervalPwaStorageAdapter.getItem(key) || '{}').totalAnswers === 2, reviewKey);
      assert.equal(await live(page), 0);
      await page.click('#singing-next');
      await listening(page);
      await page.evaluate(() => singingCapture.sing(523.251131));
      await page.waitForFunction(key => JSON.parse(IntervalPwaStorageAdapter.getItem(key) || '{}').totalAnswers === 3, reviewKey);
      assert.equal(await live(page), 0, '高低八度都唱准并自动停止');
      await page.click('#singing-play'); await page.click('#singing-play');
      await listening(page); assert.equal(await live(page), 1, '连续重播只有当前麦克风会话');
      await page.evaluate(() => singingCapture.sing(261.625565));
      await page.waitForFunction(() => document.getElementById('singing-listener').dataset.state === 'correct');
      assert.equal(await resultCount(page), 3, '重播可再次模唱，但不重复计分');
      await page.click('#open-settings');
      await page.selectOption('#singing-high', '67'); await closeSettings(page);
      await page.click('#singing-play'); await listening(page); await page.click('#open-settings');
      assert.equal(await live(page), 0, '设置开启停止麦克风'); await closeSettings(page);
      await page.click('#singing-play'); await listening(page);
      await page.click('#back-home');
      assert.equal(await live(page), 0, '返回关闭麦克风');
      assert(await page.locator('#home-screen').isVisible());
      await page.click('#home-singing');
      await page.evaluate(() => { singingCapture.mode = 'denied'; }); await page.click('#singing-play');
      await page.waitForFunction(() => document.getElementById('singing-error').textContent.includes('权限'));
      await page.evaluate(() => { singingCapture.mode = 'missing'; }); await page.click('#singing-play');
      await page.waitForFunction(() => document.getElementById('singing-error').textContent.includes('没有找到麦克风'));
      await page.evaluate(() => { singingCapture.mode = 'pending'; singingCapture.pending = null; }); await page.click('#singing-play');
      await page.waitForFunction(() => singingCapture.pending !== null);
      await page.click('#back-home'); await page.evaluate(() => singingCapture.pending());
      await page.waitForFunction(() => singingCapture.tracks.every(track => track.readyState === 'ended'));
      assert.equal(await resultCount(page), 3);
      // Cancellation and retry while an older permission request is unresolved.
      await page.click('#home-singing');
      await page.evaluate(() => { singingCapture.pending = null; }); await page.click('#singing-play');
      await page.waitForFunction(() => singingCapture.pending !== null);
      await page.evaluate(() => { singingCapture.oldPending = singingCapture.pending; });
      await page.evaluate(() => { singingCapture.mode = 'normal'; }); await page.click('#singing-play'); await listening(page);
      await page.evaluate(() => singingCapture.oldPending());
      await page.waitForFunction(() => singingCapture.tracks.filter(track => track.readyState === 'live').length === 1);
      assert.equal(await page.locator('#singing-listener').getAttribute('data-state'), 'listening', '旧授权不干扰新检测');
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      assert.equal(await live(page), 0, '页面退出关闭麦克风');
      assert.equal(await page.locator('#singing-listener').getAttribute('data-state'), 'idle');
      await page.click('#open-settings'); await page.click('#singing-open-stats');
      assert.equal(await page.locator('#stats-performance-title').innerText(), '各音高表现');
      assert.match(await page.locator('#stats-intervals').innerText(), /C/);
      await page.click('#close-stats'); await page.waitForSelector('#stats-dialog', {state:'hidden'});
      await page.click('#back-home'); await page.click('#home-daily-tasks');
      await page.check('#daily-singing-enabled'); await page.click('#daily-singing-minus'); await page.click('#daily-tasks-save');
      await page.waitForSelector('#daily-tasks-dialog', {state:'hidden'});
      assert.equal(await page.evaluate(() => TonaloomDailyTasks.progress('singing').count), 3);
      const saved = await page.evaluate(key => JSON.parse(IntervalPwaStorageAdapter.getItem(key)), settingsKey);
      assert.equal(saved.low, 60); assert.equal(saved.high, 67);
      await page.reload(); await page.waitForFunction(() => window.IntervalAppReady);
      assert.equal(await resultCount(page), 3); assert.equal(await page.evaluate(() => singingCapture.calls), 0);
      await page.click('#home-singing'); await page.click('#singing-play'); await listening(page);
      await page.evaluate(() => singingCapture.track.dispatchEvent(new Event('ended')));
      assert.match(await page.locator('#singing-error').innerText(), /已断开/);
      assert.equal(await page.locator('#singing-listener').getAttribute('data-state'), 'idle');
      await page.click('#singing-play'); await listening(page);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); });
      assert.equal(await page.locator('#singing-listener').getAttribute('data-state'), 'idle', '后台通知停止检测');
      assert.equal(await live(page), 0);
      assert.deepEqual(errors, []);
      console.log(`PASS 模唱 ${width}px：自动开始、绿灯、正确后停止、跳变过滤、八度、重播、授权与保存`);
      await context.close();
    }
    console.log('模唱截图：' + screenshots);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
