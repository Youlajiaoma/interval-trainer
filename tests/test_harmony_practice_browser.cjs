'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const site=path.resolve(__dirname,'../site'),origin='http://127.0.0.1:8773';
const ids=['melody','harmony','guitar'],frequencies=[340,420,500];
const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'tonaloom-harmony-'));
function wav(frequency,channels){
  const rate=22050,count=rate*1.2,bytes=Buffer.alloc(44+count*channels*2);
  bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(channels,22);
  bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*channels*2,28);bytes.writeUInt16LE(channels*2,32);bytes.writeUInt16LE(16,34);
  bytes.write('data',36);bytes.writeUInt32LE(count*channels*2,40);
  for(let i=0;i<count;i++)for(let ch=0;ch<channels;ch++)bytes.writeInt16LE(Math.round(2000*Math.sin(2*Math.PI*frequency*i/rate)*Math.min(1,i/200,(count-i)/200)),44+(i*channels+ch)*2);
  return bytes;
}
function duration(bytes){
  let rate=0,size=0;
  for(let p=12;p+8<=bytes.length;){const type=bytes.toString('ascii',p,p+4),length=bytes.readUInt32LE(p+4);
    if(type==='fmt ')rate=bytes.readUInt32LE(p+16);if(type==='data')size=length;p+=8+length+(length%2);}
  assert(rate && size);return size/rate;
}
async function settle(page){await page.locator('.app-shell').evaluate(el=>Promise.allSettled(el.getAnimations().map(a=>a.finished)));}
async function back(page){await page.evaluate(()=>history.back());}
async function playing(page){await page.waitForFunction(()=>{const a=document.getElementById('harmony-audio');return a.duration>1 && !a.paused && a.currentTime>.03;});}
async function fits(page){
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const id of ['harmony-play','harmony-seek',...ids.flatMap(id=>[`harmony-${id}-input`,`harmony-${id}-mute`])]){
    const box=await page.locator('#'+id).boundingBox();
    assert(box && box.x>=0 && box.x+box.width<=page.viewportSize().width && box.y>=0 && box.y+box.height<=page.viewportSize().height,id+'应完整显示');
  }
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
  try{for(const width of [320,390,900]){
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
    let actual=false;
    await context.route(origin+'/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/previous.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Previous page</title><p id="previous">Previous page</p>'});
      if(url.pathname==='/assets/harmony-songs.js' && !actual){
        const stems=Object.fromEntries(ids.map(id=>[id,`assets/harmony-practice/fixture/${id}.wav`]));
        return route.fulfill({contentType:'text/javascript',body:`window.TonaloomHarmonySongs=${JSON.stringify([{id:'test',title:'在他乡',stems,tracks:[{id:'all',title:'在他乡',mix:ids}]}])};`});
      }
      if(url.pathname.startsWith('/assets/harmony-practice/')){
        const bytes=actual ? fs.readFileSync(path.join(site,url.pathname)) : wav(frequencies[ids.indexOf(path.basename(url.pathname,'.wav'))],width===900 ? 2 : 1);
        return route.fulfill({contentType:'audio/wav',body:bytes});
      }
      try{await route.fulfill({path:path.join(site,url.pathname==='/' ? 'index.html' : url.pathname)});}
      catch{await route.fulfill({status:404,body:''});}
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(({standalone,minimal})=>{
      if(standalone)Object.defineProperty(navigator,'standalone',{value:true});
      if(minimal){const media=window.matchMedia.bind(window);window.matchMedia=query=>query.includes('display-mode') ? {matches:query.includes('minimal-ui')} : media(query);}
      const play=HTMLMediaElement.prototype.play,activated=new WeakSet();let gesture=false;
      document.addEventListener('click',()=>{gesture=true;setTimeout(()=>gesture=false,0);},true);
      HTMLMediaElement.prototype.play=function(){
        if(!gesture && !activated.has(this))return Promise.reject(new DOMException('gesture required','NotAllowedError'));
        activated.add(this);return play.call(this);
      };
      const makeGain=AudioContext.prototype.createGain,makeSource=AudioContext.prototype.createMediaElementSource;
      AudioContext.prototype.createMediaElementSource=function(media){const node=makeSource.call(this,media);if(media.id==='harmony-audio')window.capture={context:this};return node;};
      AudioContext.prototype.createGain=function(){
        const gain=makeGain.call(this),connect=gain.connect.bind(gain),context=this;
        gain.connect=function(target,...rest){const result=connect(target,...rest),probe=window.capture;
          if(probe?.context===context && target===context.destination){
            if(!probe.analyser){probe.analyser=context.createAnalyser();probe.analyser.fftSize=8192;probe.analyser.smoothingTimeConstant=0;
              const sink=makeGain.call(context);sink.gain.value=0;probe.analyser.connect(sink);sink.connect(context.destination);}
            connect(probe.analyser);
          }return result;};return gain;
      };
      window.wraps=0;document.addEventListener('DOMContentLoaded',()=>{let previous=0;const audio=document.getElementById('harmony-audio');
        if(audio)audio.addEventListener('timeupdate',()=>{if(previous-audio.currentTime>.4)wraps++;previous=audio.currentTime;});});
    },{standalone:width===390,minimal:width===900});
    await page.goto(origin+'/previous.html');await page.goto(origin+'/');await page.waitForFunction(()=>window.IntervalAppReady);await page.locator('#splash-screen').waitFor({state:'detached'});
    await page.click('#home-harmony-practice');await settle(page);
    assert.equal(await page.locator('#harmony-directory button').count(),1);
    // Regression: returning from the song directory must not leave the app,
    // including ordinary browser tabs without a standalone display-mode flag.
    await back(page);await page.waitForSelector('#home-screen',{state:'visible'});await settle(page);
    assert.equal(new URL(page.url()).pathname,'/');
    await page.click('#home-harmony-practice');await settle(page);await page.locator('#harmony-directory button').first().click();await settle(page);await playing(page);
    assert.equal(await page.locator('#harmony-mode, #harmony-balance-input').count(),0);
    assert.equal(await page.locator('#harmony-practice audio').count(),1);
    assert(await page.locator('#harmony-audio').evaluate(a=>a.loop));
    const source=await page.locator('#harmony-audio').evaluate(a=>a.currentSrc);
    async function volume(id,value){await page.locator(`#harmony-${id}-input`).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},value);}
    async function spectrum(){
      await page.waitForTimeout(250);await page.waitForFunction(()=>{const a=document.getElementById('harmony-audio');return a.currentTime>.4 && a.currentTime<.65;});
      return page.evaluate(frequencies=>{const {context,analyser}=capture,bins=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(bins);
        return frequencies.map(hz=>{const at=Math.round(hz/context.sampleRate*analyser.fftSize);return Math.max(...bins.slice(at-1,at+2));});},frequencies);
    }
    const baseline=await spectrum();assert(baseline.every(v=>Number.isFinite(v) && v>-60));
    async function checkLevels(expected){
      const values=await spectrum();expected.forEach((v,i)=>{const delta=values[i]-baseline[i];
        if(!v)assert(delta<-30,`${ids[i]}静音仍有输出: ${delta}dB`);
        else assert(Math.abs(delta-20*Math.log10(v))<1.6,`${ids[i]}音量不符: ${delta}dB`);
      });assert.equal(await page.locator('#harmony-audio').evaluate(a=>a.currentSrc),source);
    }
    for(const values of [[0,50,100],[50,100,0],[100,0,50],[25,37,80],[100,100,100]]){
      for(const [i,id] of ids.entries())await volume(id,values[i]);await checkLevels(values.map(v=>v/100));
    }
    for(const [i,id] of ids.entries()){
      await page.click(`#harmony-${id}-mute`);const expected=[1,1,1];expected[i]=0;await checkLevels(expected);
      await volume(id,37);await checkLevels(expected);assert.equal(await page.locator(`#harmony-${id}-level`).innerText(),'0%');
      await page.click(`#harmony-${id}-mute`);expected[i]=.37;await checkLevels(expected);await volume(id,100);
    }
    async function silent(){await page.waitForTimeout(250);const peak=await page.evaluate(()=>{const values=new Float32Array(capture.analyser.fftSize);capture.analyser.getFloatTimeDomainData(values);return values.reduce((max,v)=>Math.max(max,Math.abs(v)),0);});assert(peak<.000001,'拖动时全部三轨必须静音');}
    await volume('melody',25);await page.click('#harmony-harmony-mute');
    const seek=await page.locator('#harmony-seek').boundingBox();
    await page.mouse.move(seek.x+seek.width*.5,seek.y+seek.height/2);await page.mouse.down();
    await page.mouse.move(seek.x+seek.width*.3,seek.y+seek.height/2);assert(await page.locator('#harmony-audio').evaluate(a=>a.paused && a.muted));await silent();
    await volume('guitar',80);await silent();await page.mouse.up();await playing(page);await checkLevels([.25,0,.8]);
    await page.locator('#harmony-seek').focus();await page.keyboard.down('ArrowRight');await silent();
    await page.keyboard.up('ArrowRight');await playing(page);await checkLevels([.25,0,.8]);
    const before=await page.evaluate(()=>wraps);await page.waitForFunction(before=>wraps>before,before,{timeout:5000});
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    assert(await page.locator('#harmony-audio').evaluate(a=>!a.paused));
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    await fits(page);await page.screenshot({path:path.join(screenshots,`${width}-independent.png`)});
    await back(page);await page.waitForSelector('#harmony-directory',{state:'visible'});await settle(page);
    assert(await page.locator('#harmony-audio').evaluate(a=>a.paused && !a.hasAttribute('src')));
    await back(page);await page.waitForSelector('#home-screen',{state:'visible'});await settle(page);
    if(width===320){await back(page);await page.waitForSelector('#previous');}

    actual=true;await page.goto(origin+'/');await page.waitForFunction(()=>window.IntervalAppReady);await page.locator('#splash-screen').waitFor({state:'detached'});
    await page.click('#home-harmony-practice');await settle(page);await page.locator('#harmony-directory button').first().click();await settle(page);await playing(page);
    const urls=await page.evaluate(()=>Object.values(TonaloomHarmonySongs[0].stems));
    const expected=Math.max(...urls.map(url=>duration(fs.readFileSync(path.join(site,new URL(url,origin).pathname)))));
    assert(Math.abs(await page.locator('#harmony-audio').evaluate(a=>a.duration)-expected)<.001);
    await fits(page);await page.screenshot({path:path.join(screenshots,`${width}-actual-player.png`)});
    await page.click('#harmony-play');await page.locator('#harmony-seek').evaluate(input=>{input.value='50';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForFunction(()=>{const a=document.getElementById('harmony-audio');return Math.abs(a.currentTime-a.duration/2)<.1;});
    await page.click('#harmony-play');await playing(page);assert(await page.locator('#harmony-audio').evaluate(a=>a.loop));
    await back(page);await page.waitForSelector('#harmony-directory',{state:'visible'});await settle(page);
    await back(page);await page.waitForSelector('#home-screen',{state:'visible'});await settle(page);
    await page.click('#home-harmonic');await settle(page);assert.equal(await page.locator('#answer-grid button').count(),13);
    await back(page);await page.waitForSelector('#home-screen',{state:'visible'});assert.deepEqual(errors,[]);
    console.log(`PASS harmony ${width}px: independent gains/mutes, native loop, quiet seeking, real files and directory/player/HOME Back`);
    await context.close();
  }console.log('Screenshots:',screenshots);}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
