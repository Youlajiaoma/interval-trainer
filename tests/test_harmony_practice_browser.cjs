'use strict';
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const site = path.resolve(__dirname,'../site');
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(),'tonaloom-harmony-'));
const titles = ['旋律+和声','旋律','和声','伴奏'];
const tracks = titles.map((title,i) => ({id:String(i),title,src:`assets/harmony-practice/test/${i}.wav`}));
function wav(frequency) {
  const rate = 22050, count = Math.round(rate*1.2), bytes = Buffer.alloc(44+count*2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length-8,4); bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(rate,24); bytes.writeUInt32LE(rate*2,28); bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34);
  bytes.write('data',36); bytes.writeUInt32LE(count*2,40);
  for (let i=0;i<count;i++) bytes.writeInt16LE(Math.round(2000*Math.sin(2*Math.PI*frequency*i/rate)*Math.min(1,i/200,(count-i)/200)),44+i*2);
  return bytes;
}
async function settle(page) {
  await page.locator('.app-shell').evaluate(element => Promise.allSettled(element.getAnimations().map(animation => animation.finished)));
}
async function choose(page,index) { await page.locator('#harmony-directory button').nth(index).click(); await settle(page); }
async function back(page) { await page.click('#back-home'); await settle(page); }
async function playing(page) { await page.waitForFunction(() => { const a = document.getElementById('harmony-audio'); return !a.paused && a.currentTime > .03; }); }
async function fits(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'页面不可横向溢出');
  for (const id of ['harmony-play','harmony-previous','harmony-next','harmony-mode','harmony-seek']) {
    const box = await page.locator('#'+id).boundingBox();
    assert(box && box.x >= 0 && box.x+box.width <= page.viewportSize().width,`${id}应完整显示`);
    assert(box.y >= 0 && box.y+box.height <= page.viewportSize().height,`${id}不应超出屏幕`);
  }
}
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
  try {
    for (const width of [320,390,900]) {
      const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
      let fixtures = false, actualCatalog = false, audioRequests = 0;
      await context.route('http://127.0.0.1:8773/**',async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/assets/harmony-songs.js' && !actualCatalog) {
          const testTracks = fixtures ? tracks : tracks.map(item => ({...item,src:null}));
          return route.fulfill({contentType:'application/javascript',body:`window.TonaloomHarmonySongs = ${JSON.stringify([{id:'test',title:'在他乡',tracks:testTracks}])};`});
        }
        if (url.pathname.startsWith('/assets/harmony-practice/')) {
          audioRequests++;
          assert(fixtures || actualCatalog,'空清单不应请求不存在的音频');
          const number = Number(path.basename(url.pathname,'.wav'));
          const bytes = actualCatalog ? fs.readFileSync(path.join(site,url.pathname)) : wav(260+number*80);
          const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
          if (range) {
            const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]),bytes.length-1) : bytes.length-1;
            return route.fulfill({status:206,contentType:'audio/wav',headers:{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${bytes.length}`},body:bytes.subarray(start,end+1)});
          }
          return route.fulfill({contentType:'audio/wav',headers:{'Accept-Ranges':'bytes'},body:bytes});
        }
        const file = path.join(site,url.pathname === '/' ? 'index.html' : url.pathname);
        try { await route.fulfill({path:file}); } catch { await route.fulfill({status:404,body:''}); }
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror',error => errors.push(error.message));
      await page.addInitScript(() => {
        Object.defineProperty(navigator,'standalone',{value:true});
        window.harmonyPlayed = []; window.harmonyWraps = 0; window.harmonyEnded = 0;
        document.addEventListener('DOMContentLoaded',() => {
          const a = document.getElementById('harmony-audio'); let last = 0;
          a.addEventListener('playing',() => harmonyPlayed.push(a.currentSrc));
          a.addEventListener('timeupdate',() => { if (a.loop && last-a.currentTime > .4) harmonyWraps++; last = a.currentTime; });
          a.addEventListener('ended',() => harmonyEnded++);
        });
      });
      await page.goto('http://127.0.0.1:8773/'); await page.waitForFunction(() => window.IntervalAppReady);
      await page.click('#home-harmony-practice'); await settle(page);
      assert.equal(await page.locator('#harmony-directory button').count(),1);
      await page.screenshot({path:path.join(screenshots,`${width}-songs.png`)});
      await choose(page,0); assert.deepEqual(await page.locator('.harmony-entry-name').allTextContents(),titles);
      await page.screenshot({path:path.join(screenshots,`${width}-tracks.png`)});
      await choose(page,0); assert(await page.locator('#harmony-play').isDisabled());
      assert.equal(await page.locator('#harmony-message').innerText(),'音频待添加');
      assert.equal(audioRequests,0); await fits(page);
      await page.screenshot({path:path.join(screenshots,`${width}-empty.png`)});
      await back(page); assert.equal(await page.locator('#harmony-directory button').count(),4);
      await back(page); assert.equal(await page.locator('#harmony-directory button').count(),1);
      await back(page); assert(await page.locator('#home-screen').isVisible());

      fixtures = true; await page.reload(); await page.waitForFunction(() => window.IntervalAppReady);
      await page.click('#home-harmony-practice'); await settle(page); await choose(page,0); await choose(page,1); await playing(page);
      assert.equal(await page.locator('#harmony-track-title').innerText(),'旋律');
      assert.equal(await page.locator('#harmony-duration').innerText(),'0:01');
      await page.click('#harmony-play'); assert(await page.locator('#harmony-audio').evaluate(a => a.paused));
      await page.locator('#harmony-seek').evaluate(input => { input.value='40'; input.dispatchEvent(new Event('input',{bubbles:true})); });
      assert(Math.abs(await page.locator('#harmony-audio').evaluate(a => a.currentTime)-.48)<.03);
      await page.click('#harmony-play'); await playing(page);
      await back(page); assert(await page.locator('#harmony-audio').evaluate(a => a.paused && !a.hasAttribute('src')));

      await choose(page,0); await playing(page);
      await page.waitForFunction(() => document.getElementById('harmony-track-title').textContent === '伴奏' && document.getElementById('harmony-audio').ended,{},{timeout:10000});
      assert.equal(await page.locator('#harmony-play').getAttribute('aria-label'),'播放');
      const sequence = await page.evaluate(() => harmonyPlayed.slice(-4).map(url => new URL(url).pathname));
      assert.deepEqual(sequence,tracks.map(item => '/'+item.src));
      await back(page); await choose(page,2); await playing(page);
      await page.click('#harmony-mode');
      assert(await page.locator('#harmony-audio').evaluate(a => a.loop));
      const endedBefore = await page.evaluate(() => harmonyEnded), wrapsBefore = await page.evaluate(() => harmonyWraps);
      await page.waitForFunction(before => harmonyWraps > before,wrapsBefore,{timeout:5000});
      assert.equal(await page.locator('#harmony-track-title').innerText(),'和声');
      assert.equal(await page.evaluate(() => harmonyEnded),endedBefore,'原生循环不会触发 ended 再重启');
      assert(!(await page.locator('#harmony-audio').evaluate(a => a.paused)));
      await fits(page); await page.screenshot({path:path.join(screenshots,`${width}-player.png`)});
      // This checks our visibility handler, not an actual phone's screen lock.
      await page.evaluate(() => {
        Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange'));
      });
      assert(!(await page.locator('#harmony-audio').evaluate(a => a.paused)));
      await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
      await page.click('#harmony-next'); await playing(page);
      assert.equal(await page.locator('#harmony-track-title').innerText(),'伴奏'); assert(await page.locator('#harmony-next').isDisabled());
      await page.click('#harmony-previous'); await playing(page); assert.equal(await page.locator('#harmony-track-title').innerText(),'和声');
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
      assert(await page.locator('#harmony-audio').evaluate(a => a.paused && !a.hasAttribute('src')));
      await page.click('#harmony-play'); await playing(page);
      if (width === 390) {
        await page.evaluate(() => history.back());
        await page.waitForSelector('#harmony-directory',{state:'visible'}); await settle(page);
        assert(!(await page.locator('#toast').evaluate(element => element.classList.contains('visible'))),'目录返回不显示退出应用提示');
      } else await back(page);
      await page.waitForFunction(() => { const a = document.getElementById('harmony-audio'); return a.paused && !a.hasAttribute('src') && a.readyState === 0; });
      await back(page); await back(page);
      await page.click('#home-harmonic'); await settle(page); assert.equal(await page.locator('#answer-grid button').count(),13);
      await back(page); await page.click('#home-stats'); await page.waitForSelector('#stats-dialog',{state:'visible'});
      assert.equal(await page.locator('.stats-mode-switch button').count(),5,'不增加无答题功能的统计项');
      if (width === 390) {
        // Read the real catalog and play the user's files, in addition to fixtures.
        actualCatalog = true; await page.reload(); await page.waitForFunction(() => window.IntervalAppReady);
        await page.click('#home-harmony-practice'); await settle(page); await choose(page,0);
        const actualTracks = await page.evaluate(() => TonaloomHarmonySongs[0].tracks);
        for (let i=0;i<actualTracks.length;i++) if (actualTracks[i].src) {
          await choose(page,i); await playing(page);
          const result = await page.locator('#harmony-audio').evaluate(a => ({duration:a.duration,error:a.error?.code,source:a.currentSrc}));
          assert(result.duration > 0 && Number.isFinite(result.duration)); assert(!result.error);
          assert.equal(new URL(result.source).pathname,'/'+actualTracks[i].src);
          await page.click('#harmony-play');
          await page.locator('#harmony-seek').evaluate(input => { input.value='50'; input.dispatchEvent(new Event('input',{bubbles:true})); });
          await page.waitForFunction(() => { const a=document.getElementById('harmony-audio'); return Math.abs(a.currentTime-a.duration/2)<.1; });
          console.log(`PASS supplied audio ${actualTracks[i].title}: ${result.duration.toFixed(3)}s, playback and seeking`);
          await back(page);
        }
      }
      assert.deepEqual(errors,[]); console.log(`PASS harmony ${width}px: directories, placeholders, real native playback/seek/sequence/loop, return cleanup and existing module`);
      await context.close();
    }
    console.log('Screenshots:',screenshots);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
