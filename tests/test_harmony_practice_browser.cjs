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
function wav(frequency,channels = 1) {
  const rate = 22050, count = Math.round(rate*1.2), bytes = Buffer.alloc(44+count*channels*2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length-8,4); bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(channels,22);
  bytes.writeUInt32LE(rate,24); bytes.writeUInt32LE(rate*channels*2,28); bytes.writeUInt16LE(channels*2,32); bytes.writeUInt16LE(16,34);
  bytes.write('data',36); bytes.writeUInt32LE(count*channels*2,40);
  for (let i=0;i<count;i++) for (let ch=0;ch<channels;ch++) bytes.writeInt16LE(Math.round(2000*Math.sin(2*Math.PI*frequency*i/rate)*Math.min(1,i/200,(count-i)/200)),44+(i*channels+ch)*2);
  return bytes;
}
function wavDuration(bytes) {
  let rate=0, length=0;
  for (let at=12;at+8<=bytes.length;) {
    const type=bytes.toString('ascii',at,at+4), size=bytes.readUInt32LE(at+4);
    if (type==='fmt ') rate=bytes.readUInt32LE(at+16);
    if (type==='data') length=size;
    at+=8+size+(size%2);
  }
  assert(rate>0 && length>0); return length/rate;
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
    if (await page.locator('#'+id).isHidden()) continue;
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
      let fixtures = false, mixedFixtures = false, guitarFixtures = false, actualCatalog = false, audioRequests = 0;
      const actualSources = new Set();
      await context.route('http://127.0.0.1:8773/**',async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/assets/harmony-songs.js' && !actualCatalog) {
          const testTracks = fixtures ? tracks.map((item,i) => mixedFixtures && i===0 ? {id:item.id,title:item.title,mix:['1','2']} : item)
            : tracks.map(item => ({...item,src:null}));
          const catalog = guitarFixtures ? [{id:'test',title:'在他乡',stems:{melody:tracks[1].src,harmony:tracks[2].src,guitar:tracks[3].src},
            tracks:[{id:'ensemble',title:'在他乡',mix:['melody','harmony','guitar']}]}] : [{id:'test',title:'在他乡',tracks:testTracks}];
          return route.fulfill({contentType:'application/javascript',body:`window.TonaloomHarmonySongs = ${JSON.stringify(catalog)};`});
        }
        if (url.pathname.startsWith('/assets/harmony-practice/')) {
          audioRequests++;
          if (actualCatalog) actualSources.add(url.pathname);
          assert(fixtures || actualCatalog,'空清单不应请求不存在的音频');
          const number = Number(path.basename(url.pathname,'.wav'));
          const bytes = actualCatalog ? fs.readFileSync(path.join(site,url.pathname)) : wav(260+number*80,mixedFixtures && width===900 ? 2 : 1);
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
        // Model browsers that grant playback permission per media element.
        const play=HTMLMediaElement.prototype.play, activated=new WeakSet(); let gesture=false;
        document.addEventListener('click',()=>{gesture=true;setTimeout(()=>{gesture=false;},0);},true);
        HTMLMediaElement.prototype.play=function() {
          if (!gesture && !activated.has(this)) return Promise.reject(new DOMException('gesture required','NotAllowedError'));
          activated.add(this); return play.call(this);
        };
        const createGain=AudioContext.prototype.createGain, createSource=AudioContext.prototype.createMediaElementSource;
        AudioContext.prototype.createMediaElementSource=function(media) {
          const source=createSource.call(this,media);
          if (media.id==='harmony-audio') window.mixCapture={context:this};
          return source;
        };
        AudioContext.prototype.createGain=function() {
          const gain=createGain.call(this), connect=gain.connect.bind(gain), context=this;
          gain.connect=function(target,...rest) {
            const result=connect(target,...rest), probe=window.mixCapture;
            if (probe?.context===context && target===context.destination) {
              if (!probe.analyser) {
                probe.analyser=context.createAnalyser(); probe.analyser.fftSize=8192; probe.analyser.smoothingTimeConstant=0;
                const sink=createGain.call(context); sink.gain.value=0; probe.analyser.connect(sink); sink.connect(context.destination);
              }
              connect(probe.analyser);
            }
            return result;
          };
          return gain;
        };
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
      mixedFixtures=true; await page.reload(); await page.waitForFunction(() => window.IntervalAppReady);
      await page.click('#home-harmony-practice'); await settle(page); await choose(page,0); await choose(page,0);
      await page.waitForFunction(() => { const a=document.getElementById('harmony-audio'); return a.src.startsWith('blob:') && !a.paused && a.duration>1 && a.currentTime>.03; });
      assert.equal(await page.locator('#harmony-practice audio').count(),1,'混合及单轨共用已获播放许可的媒体元素');
      await page.click('#harmony-mode');
      assert(await page.locator('#harmony-audio').evaluate(a=>a.loop));
      const mixSource=await page.locator('#harmony-audio').evaluate(a=>a.currentSrc);
      async function spectrum(frequencies = [340,420]) {
        // Allow one FFT window and the 8ms gain ramp to settle before measuring.
        await page.waitForTimeout(250);
        // Avoid measuring the fixture's edge fades or the native loop boundary.
        await page.waitForFunction(()=>{const a=document.getElementById('harmony-audio');return a.currentTime>.4 && a.currentTime<.65;});
        return page.evaluate(frequencies => {
          const {analyser,context}=mixCapture, bins=new Float32Array(analyser.frequencyBinCount);
          analyser.getFloatFrequencyData(bins);
          return frequencies.map(hz=>{
            const center=Math.round(hz/context.sampleRate*analyser.fftSize);
            return Math.max(...bins.slice(center-1,center+2));
          });
        },frequencies);
      }
      const baseline=await spectrum(); assert(baseline.every(value=>Number.isFinite(value) && value>-60));
      for (const [value,expected] of [[-100,[0,1]],[-50,[.5,1]],[50,[1,.5]],[100,[1,0]],[0,[1,1]]]) {
        await page.locator('#harmony-balance-input').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},value);
        const levels=await spectrum();
        for (let i=0;i<2;i++) {
          const delta=levels[i]-baseline[i];
          if (expected[i]===0) assert(delta<-30,`${value}: muted stem ${i} leaked ${delta}dB`);
          else assert(Math.abs(delta-20*Math.log10(expected[i]))<1.6,`${value}: stem ${i} unexpected level ${delta}dB`);
        }
        assert.equal(await page.locator('#harmony-audio').evaluate(a=>a.currentSrc),mixSource,'拖动平衡不能更换音频或重新从头播放');
      }
      assert.equal(await page.locator('#harmony-melody-level').innerText(),'100%');
      assert.equal(await page.locator('#harmony-harmony-level').innerText(),'100%');
      async function silentOutput() {
        await page.waitForTimeout(250);
        const peak=await page.evaluate(()=>{
          const samples=new Float32Array(mixCapture.analyser.fftSize);
          mixCapture.analyser.getFloatTimeDomainData(samples);
          return samples.reduce((max,value)=>Math.max(max,Math.abs(value)),0);
        });
        assert(peak<.000001,`静音期间仍有输出 ${peak}`);
      }
      await page.click('#harmony-mute');
      assert.equal(await page.locator('#harmony-mute').getAttribute('aria-pressed'),'true');
      assert(await page.locator('#harmony-audio').evaluate(a=>a.muted && !a.paused));
      await silentOutput();
      await page.locator('#harmony-balance-input').evaluate(input=>{input.value='50';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await silentOutput();
      assert.equal(await page.locator('#harmony-melody-level').innerText(),'0%');
      assert.equal(await page.locator('#harmony-harmony-level').innerText(),'0%');
      await page.screenshot({path:path.join(screenshots,`${width}-muted.png`)});
      await page.click('#harmony-mute');
      const restored=await spectrum();
      assert(Math.abs(restored[0]-baseline[0])<1.6);
      assert(Math.abs(restored[1]-baseline[1]+6.0206)<1.6);
      await page.locator('#harmony-balance-input').evaluate(input=>{input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));});
      const seekBox=await page.locator('#harmony-seek').boundingBox();
      await page.mouse.move(seekBox.x+seekBox.width*.5,seekBox.y+seekBox.height/2); await page.mouse.down();
      for (const fraction of [.2,.8,.5]) await page.mouse.move(seekBox.x+seekBox.width*fraction,seekBox.y+seekBox.height/2,{steps:3});
      assert(await page.locator('#harmony-audio').evaluate(a=>a.paused && a.muted));
      assert.equal(await page.locator('#harmony-mute').getAttribute('aria-pressed'),'false','临时拖动静音不改变M状态');
      await silentOutput();
      await page.mouse.up();
      await page.waitForFunction(()=>{const a=document.getElementById('harmony-audio');return !a.paused && !a.muted;});
      await page.locator('#harmony-seek').focus(); await page.keyboard.down('ArrowRight');
      assert(await page.locator('#harmony-audio').evaluate(a=>a.paused && a.muted)); await silentOutput();
      await page.keyboard.up('ArrowRight');
      await page.waitForFunction(()=>{const a=document.getElementById('harmony-audio');return !a.paused && !a.muted;});
      assert.equal(await page.locator('#harmony-audio').evaluate(a=>a.currentSrc),mixSource);
      const muteBox=await page.locator('#harmony-mute').boundingBox(), balanceBox=await page.locator('#harmony-balance-input').boundingBox();
      assert(muteBox.x+muteBox.width<=balanceBox.x && balanceBox.x+balanceBox.width<=width,'M应位于平衡条前且手机无溢出');
      await page.screenshot({path:path.join(screenshots,`${width}-balance.png`)});
      await page.click('#harmony-play'); assert(await page.locator('#harmony-audio').evaluate(a=>a.paused));
      await page.locator('#harmony-seek').evaluate(input=>{input.value='50';input.dispatchEvent(new Event('input',{bubbles:true}));});
      assert(Math.abs(await page.locator('#harmony-audio').evaluate(a=>a.currentTime)-.6)<.03);
      await page.click('#harmony-play');
      await page.waitForFunction(()=>!document.getElementById('harmony-audio').paused);
      await page.click('#harmony-mode');
      await page.waitForFunction(()=>document.getElementById('harmony-track-title').textContent==='旋律' && !document.getElementById('harmony-audio').paused);
      assert(await page.locator('#harmony-message').isHidden(),'混合播放自动切到单轨不重新要求播放许可');
      await back(page); assert(await page.locator('#harmony-audio').evaluate(a=>a.paused && !a.hasAttribute('src')));
      await back(page); await back(page);

      // A single song opens its synchronized three-stem player directly.
      guitarFixtures = true; await page.reload(); await page.waitForFunction(() => window.IntervalAppReady);
      await page.click('#home-harmony-practice'); await settle(page); await choose(page,0); await playing(page);
      await page.waitForFunction(()=>{const a=document.getElementById('harmony-audio');return a.duration>1 && !a.paused;});
      assert(await page.locator('#harmony-directory').isHidden());
      for (const id of ['harmony-previous','harmony-next','harmony-track-number']) assert(await page.locator('#'+id).isHidden());
      assert.equal(await page.locator('#harmony-mode-label').innerText(),'单次播放');
      assert(await page.locator('#harmony-guitar').isVisible());
      assert.equal(await page.locator('#harmony-practice audio').count(),1);
      await page.click('#harmony-mode');
      const threeSource=await page.locator('#harmony-audio').evaluate(a=>a.currentSrc);
      const threeBaseline=await spectrum([340,420,500]);
      assert(threeBaseline.every(value=>Number.isFinite(value) && value>-60),'三轨都应实际输出声音');
      async function checkThree(expected) {
        const actual=await spectrum([340,420,500]);
        expected.forEach((level,i)=>{
          const delta=actual[i]-threeBaseline[i];
          if (!level) assert(delta<-30,`三轨静音泄漏：${i}, ${delta}dB`);
          else assert(Math.abs(delta-20*Math.log10(level))<1.6,`三轨增益不符：${i}, ${delta}dB`);
        });
        assert.equal(await page.locator('#harmony-audio').evaluate(a=>a.currentSrc),threeSource,'音量控制不能重新加载音频');
      }
      for (const value of [0,25,50,100]) {
        await page.locator('#harmony-guitar-input').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},value);
        await checkThree([1,1,value/100]);
      }
      await page.click('#harmony-mute'); await checkThree([0,0,1]);
      assert(await page.locator('#harmony-audio').evaluate(a=>!a.muted && !a.paused),'双轨M不能静音吉他');
      await page.click('#harmony-guitar-mute'); await silentOutput();
      await page.locator('#harmony-guitar-input').evaluate(input=>{input.value='37';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await silentOutput();
      await page.click('#harmony-mute'); await checkThree([1,1,0]);
      await page.click('#harmony-guitar-mute'); await checkThree([1,1,.37]);
      assert.equal(await page.locator('#harmony-guitar-level').innerText(),'37%');
      await page.locator('#harmony-balance-input').evaluate(input=>{input.value='50';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await checkThree([1,.5,.37]);
      const threeSeek=await page.locator('#harmony-seek').boundingBox();
      await page.mouse.move(threeSeek.x+threeSeek.width*.5,threeSeek.y+threeSeek.height/2); await page.mouse.down();
      await page.mouse.move(threeSeek.x+threeSeek.width*.3,threeSeek.y+threeSeek.height/2);
      assert(await page.locator('#harmony-audio').evaluate(a=>a.paused && a.muted)); await silentOutput();
      await page.locator('#harmony-guitar-input').evaluate(input=>{input.value='80';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await silentOutput(); await page.mouse.up();
      await page.waitForFunction(()=>{const a=document.getElementById('harmony-audio');return !a.paused && !a.muted;});
      await checkThree([1,.5,.8]);
      const guitarMuteBox=await page.locator('#harmony-guitar-mute').boundingBox(), guitarSliderBox=await page.locator('#harmony-guitar-input').boundingBox();
      assert(guitarMuteBox.x+guitarMuteBox.width<=guitarSliderBox.x && guitarSliderBox.x+guitarSliderBox.width<=width);
      await fits(page); await page.screenshot({path:path.join(screenshots,`${width}-guitar.png`)});
      const threeWraps=await page.evaluate(()=>harmonyWraps);
      await page.waitForFunction(before=>harmonyWraps>before,threeWraps,{timeout:5000});
      await page.click('#harmony-mode');
      await page.waitForFunction(()=>document.getElementById('harmony-audio').ended);
      assert.equal(await page.locator('#harmony-track-title').innerText(),'在他乡');
      if (width === 390) {
        await page.evaluate(()=>history.back()); await page.waitForSelector('#harmony-directory',{state:'visible'}); await settle(page);
      } else await back(page);
      assert.equal(await page.locator('#harmony-directory button').count(),1);
      assert(await page.locator('#harmony-audio').evaluate(a=>a.paused && !a.hasAttribute('src')));
      await back(page); assert(await page.locator('#home-screen').isVisible());

      await page.click('#home-harmonic'); await settle(page); assert.equal(await page.locator('#answer-grid button').count(),13);
      await back(page); await page.click('#home-stats'); await page.waitForSelector('#stats-dialog',{state:'visible'});
      assert.equal(await page.locator('.stats-mode-switch button').count(),5,'不增加无答题功能的统计项');
      {
        // Read the real catalog and play the user's files, in addition to fixtures.
        actualCatalog = true; await page.reload(); await page.waitForFunction(() => window.IntervalAppReady);
        await page.click('#home-harmony-practice'); await settle(page); await choose(page,0);
        assert(await page.locator('#harmony-directory').isHidden());
        assert(await page.locator('#harmony-guitar').isVisible());
        const actualTracks = await page.evaluate(() => TonaloomHarmonySongs[0].tracks);
        const sources=await page.evaluate(()=>Object.values(TonaloomHarmonySongs[0].stems));
        const expectedDuration=Math.max(...sources.map(src=>wavDuration(fs.readFileSync(path.join(site,new URL(src,'http://127.0.0.1:8773/').pathname)))));
        for (let i=0;i<actualTracks.length;i++) if (actualTracks[i].src || actualTracks[i].mix) {
          const selector='#harmony-audio';
          await page.waitForFunction(selector=>{const a=document.querySelector(selector);return !a.paused && a.duration>1 && a.currentTime>.03;},selector);
          const result = await page.locator(selector).evaluate(a => ({duration:a.duration,error:a.error?.code,source:a.currentSrc}));
          assert(result.duration > 0 && Number.isFinite(result.duration)); assert(!result.error);
          assert(Math.abs(result.duration-expectedDuration)<.001,'播放时长应与新的原始音频一致');
          if (actualTracks[i].mix) assert(result.source.startsWith('blob:'));
          else assert.equal(new URL(result.source).pathname,'/'+actualTracks[i].src);
          await fits(page); await page.screenshot({path:path.join(screenshots,`${width}-actual-player.png`)});
          await page.click('#harmony-play');
          await page.locator('#harmony-seek').evaluate(input => { input.value='50'; input.dispatchEvent(new Event('input',{bubbles:true})); });
          await page.waitForFunction(selector => { const a=document.querySelector(selector); return Math.abs(a.currentTime-a.duration/2)<.1; },selector);
          console.log(`PASS supplied audio ${actualTracks[i].title}: ${result.duration.toFixed(3)}s, playback and seeking`);
          await back(page);
        }
        assert.deepEqual([...actualSources].sort(),['guitar','harmony','melody'].map(name=>`/assets/harmony-practice/zai-ta-xiang/${name}.wav`));
      }
      assert.deepEqual(errors,[]); console.log(`PASS harmony ${width}px: directories, placeholders, real native playback/seek/sequence/loop, return cleanup and existing module`);
      await context.close();
    }
    console.log('Screenshots:',screenshots);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
