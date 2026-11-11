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
    const capture = {calls:0, stopped:0, mode:'normal', pending:null, tracks:[], glitchFrames:0,
      references:[], earlyRequests:0, clipped:0, interruptions:0, resumes:0, interrupted:false};
    window.singingCapture = capture;
    const nativeCreate = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function() {
      const source = nativeCreate.call(this), row = {context:this, source, start:null, end:null, ended:null};
      const start = source.start.bind(source), stop = source.stop.bind(source);
      source.start = at => { row.start = at; capture.references.push(row); start(at); };
      source.stop = at => { row.end = at ?? this.currentTime; stop(at); };
      source.addEventListener('ended', () => { row.ended = this.currentTime; });
      return source;
    };
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
      const reference = capture.references.at(-1);
      if (!reference || reference.context.currentTime < reference.end) capture.earlyRequests++;
      if (capture.mode === 'denied') throw new DOMException('Denied', 'NotAllowedError');
      if (capture.mode === 'missing') throw new DOMException('Missing', 'NotFoundError');
      if (capture.mode === 'pending') await new Promise(resolve => { capture.pending = resolve; });
      // Model a phone whose capture hardware opens a little after the request.
      // Opening it mid-reference cuts playback; it also interrupts Web Audio.
      await new Promise(resolve => setTimeout(resolve, 80));
      for (const row of capture.references) {
        if (row.ended === null && row.context.currentTime >= row.start && row.context.currentTime < row.end) {
          capture.clipped++; row.source.stop();
        }
      }
      const playback = reference?.context;
      if (playback) {
        if (!capture.playback) {
          capture.playback = playback;
          const state = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'state').get;
          const resume = playback.resume.bind(playback);
          Object.defineProperty(playback, 'state', {get:() => capture.interrupted ? 'interrupted' : state.call(playback)});
          playback.resume = async () => { capture.resumes++; capture.interrupted = false; await resume(); };
        }
        await playback.suspend(); capture.interrupted = true; capture.interruptions++;
      }
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
      await page.waitForFunction(() => singingCapture.references.length === 1);
      await pause(page, 900);
      assert.equal(await page.evaluate(() => singingCapture.calls), 0, '钢琴播放期间不申请麦克风设备');
      assert.equal(await live(page), 0);
      assert.equal(await resultCount(page), 0, '钢琴播放及尾音期间不判题');
      assert.equal(await page.locator('#singing-listener').getAttribute('data-state'), 'idle', '播放期间麦克风提示未亮');
      assert.equal(await page.locator('.singing-trace').getAttribute('d'), '', '播放期间不分析或绘制麦克风信号');
      await listening(page);
      assert.equal(await page.evaluate(() => singingCapture.calls), 1);
      const reference = await page.evaluate(() => {
        const row = singingCapture.references[0]; return {start:row.start, end:row.end, ended:row.ended};
      });
      assert(Math.abs(reference.end - reference.start - 1.5) < .001);
      assert(reference.ended >= reference.end - .01, '钢琴实际播放完整后才开始捕获');
      await page.evaluate(() => singingCapture.sing(277.182631));
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
      await pause(page, 900);
      assert.equal(await page.evaluate(() => singingCapture.calls), 1, '重播期间不启动新麦克风');
      assert.equal(await live(page), 0);
      assert.equal(await page.locator('#singing-listener').getAttribute('data-state'), 'idle');
      assert.equal(await page.locator('.singing-trace').getAttribute('d'), '', '重听期间不收集人声曲线');
      assert.equal(await resultCount(page), 0);
      await listening(page);
      assert.equal(await page.evaluate(() => singingCapture.calls), 2);
      await page.evaluate(() => singingCapture.sing(277.182631));
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
      const beforeReplay = await page.evaluate(() => {
        singingCapture.oldPending = singingCapture.pending;
        singingCapture.mode = 'normal'; return singingCapture.references.length;
      });
      await page.click('#singing-play'); await pause(page, 200);
      assert.equal(await page.evaluate(() => singingCapture.references.length), beforeReplay, '旧授权未完成前不启动重播，避免设备迟到打断钢琴');
      await page.evaluate(() => singingCapture.oldPending());
      await listening(page);
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
      assert.equal(await page.evaluate(() => singingCapture.earlyRequests), 0);
      assert.equal(await page.evaluate(() => singingCapture.clipped), 0, '重播及延迟授权未截断参考音');
      assert(await page.evaluate(() => singingCapture.interruptions > 0 && singingCapture.resumes >= singingCapture.interruptions));
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
      assert.equal(await page.evaluate(() => singingCapture.earlyRequests), 0, '所有麦克风申请均在参考音结束后');
      assert.equal(await page.evaluate(() => singingCapture.clipped), 0, '模拟手机的设备切换没有截断任何钢琴音');
      assert(await page.evaluate(() => singingCapture.interruptions > 0 && singingCapture.resumes >= singingCapture.interruptions), '覆盖并恢复设备切换导致的 interrupted 状态');
      assert.deepEqual(errors, []);
      console.log(`PASS 模唱 ${width}px：钢琴完整1.5秒、先播后收音、设备中断恢复、授权与重播、音准及保存`);
      await context.close();
    }
    console.log('模唱截图：' + screenshots);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
