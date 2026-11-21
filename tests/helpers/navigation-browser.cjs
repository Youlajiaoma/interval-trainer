'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const site=path.resolve(__dirname,'../../site'),origin='http://127.0.0.1:8771';
module.exports=async function navigationChecks(browser){
  const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'tonaloom-navigation-'));
  for(const [width,installed] of [[320,false],[390,true],[900,true]]){
    const context=await browser.newContext({viewport:{width,height:800},hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(({installed,minimal})=>{
      if(installed && !minimal)Object.defineProperty(navigator,'standalone',{value:true});
      if(minimal){const match=window.matchMedia.bind(window);window.matchMedia=query=>query.includes('display-mode') ? {matches:true} : match(query);}
    },{installed,minimal:width===900});
    await context.route(origin+'/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/previous.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><p id="previous">Previous page</p>'});
      try{await route.fulfill({path:path.join(site,url.pathname==='/' ? 'index.html' : url.pathname)});}catch{await route.fulfill({status:404,body:''});}
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const position=async index=>page.waitForFunction(index=>history.state?.tonaloomNavigation?.index===index,index);
    const noExit=async()=>assert(!await page.locator('#toast').evaluate(el=>el.classList.contains('visible') && el.textContent==='再按一次返回退出'),'子页面返回不应提示退出');
    const back=async()=>{await page.goBack();};
    await page.goto(origin+'/previous.html');await page.goto(origin+'/');await page.waitForFunction(()=>window.IntervalAppReady);await position(0);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollbarWidth),'none');
    if(width===320){
      // The compact home screen can legitimately fit inside an 800px-tall
      // viewport. Use a short phone viewport so this assertion continues to
      // verify the real invariant: hiding the scrollbar must not disable
      // scrolling when the content is taller than the screen.
      await page.setViewportSize({width,height:520});
      assert(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'短屏幕主页应产生可滚动内容');
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      assert(await page.evaluate(()=>scrollY>0),'隐藏滚动条后主页仍可滚动');
      await page.evaluate(()=>scrollTo(0,0));
      await page.setViewportSize({width,height:800});
    }
    const entries=await page.evaluate(()=>TonaloomModules.list.map(m=>({id:m.id,home:m.homeId})));
    const settings={harmonic:['settings-dialog','open-stats'],melodic:['settings-dialog','open-stats'],sight:['sight-settings-dialog','sight-open-stats'],staff:['staff-interval-settings','staff-open-stats'],singing:['singing-settings','singing-open-stats']};
    for(const entry of entries){
      await page.click('#'+entry.home);await position(1);
      await page.click('#open-settings');await position(2);
      await back();await position(1);assert(!await page.locator('#'+settings[entry.id][0]).evaluate(d=>d.open));await noExit();
      await page.click('#open-settings');await position(2);await page.click('#'+settings[entry.id][1]);await position(2);
      await back();await position(1);assert(await page.evaluate(id=>TonaloomModules.get(id).isActive(),entry.id));await noExit();
      await back();await position(0);assert(await page.locator('#home-screen').isVisible());await noExit();
    }
    // The song directory and player own separate entries; neither return exits.
    await page.click('#home-harmony-practice');await position(1);
    await page.locator('#harmony-directory button').first().click();await position(2);
    await back();await position(1);assert(await page.locator('#harmony-directory').isVisible());
    assert(await page.locator('#harmony-audio').evaluate(a=>a.paused && !a.hasAttribute('src')));await noExit();
    await back();await position(0);await noExit();
    await page.goForward();await position(1);assert(await page.locator('#harmony-directory').isVisible());
    await page.goForward();await position(2);assert(await page.locator('#harmony-player').isVisible());
    await page.click('#back-home');await position(1);await back();await position(0);await noExit();
    for(const entry of ['home-daily-tasks','home-stats']){
      await page.click('#'+entry);await position(1);await back();await position(0);await noExit();
      await page.click('#'+entry);await position(1);await page.keyboard.press('Escape');await position(0);await noExit();
    }
    await page.click('#home-stats');await position(1);
    await page.click('#stats-harmonic');
    for(const mode of entries){
      assert.equal(await page.locator('.stats-mode-switch .active').innerText(),await page.evaluate(id=>TonaloomModules.get(id).name,mode.id));
      const visible=await page.locator('.stats-mode-switch').evaluate(nav=>[...nav.children].filter(child=>{const a=child.getBoundingClientRect(),b=nav.getBoundingClientRect();return a.left>=b.left-1 && a.right<=b.right+1;}).length);
      assert.equal(visible,1,'顶部一次只显示一个训练项目');
      if(mode.id!=='singing')await page.click('#stats-next');
    }
    assert(await page.locator('#stats-next').isDisabled());
    await page.click('#stats-harmonic');
    const client=await context.newCDPSession(page);
    async function swipe(x1,y1,x2,y2){
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1}]});
      for(let step=1;step<=6;step++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*step/6,y:y1+(y2-y1)*step/6}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    const chart=await page.locator('#stats-trend').boundingBox(),y=chart.y+20;
    await swipe(width*.78,y,width*.22,y+2);await page.waitForFunction(()=>TonaloomModules.statisticsMode==='melodic');
    await swipe(width*.22,y,width*.78,y+2);await page.waitForFunction(()=>TonaloomModules.statisticsMode==='harmonic');
    const nav=await page.locator('#stats-mode-switch').boundingBox();
    await swipe(nav.x+nav.width*.8,nav.y+nav.height/2,nav.x+nav.width*.2,nav.y+nav.height/2);
    await page.waitForFunction(()=>TonaloomModules.statisticsMode==='melodic');
    await page.locator('#stats-melodic').focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>TonaloomModules.statisticsMode==='sight');
    await page.selectOption('#stats-period','7');assert.equal(await page.locator('#stats-performance-title').innerText(),'各音符表现');
    const heatSquares=page.locator('#stats-calendar .stats-heat');assert.equal(await heatSquares.count(),49);
    if(width<=620){
      const heatmapBox=await page.locator('#stats-calendar .stats-heatmap').boundingBox();
      const calendarBox=await page.locator('#stats-calendar').boundingBox();
      assert(Math.abs(heatmapBox.width-calendarBox.width)<2,'手机热力图应铺满统计卡片可用宽度');
    }
    assert.equal(await heatSquares.last().getAttribute('title'),null,'热力图不应再依赖悬停提示');
    await heatSquares.last().click();
    assert.equal(await heatSquares.last().getAttribute('aria-pressed'),'true');
    assert(await page.locator('#stats-calendar-detail').isVisible());
    assert.match(await page.locator('#stats-calendar-detail').innerText(),/没有练习记录|答题 \d+ 题/);
    const lastHeatBox=await heatSquares.last().boundingBox(),lastBubbleBox=await page.locator('#stats-calendar-detail').boundingBox();
    assert(lastBubbleBox.x+lastBubbleBox.width<=lastHeatBox.x+1 || lastBubbleBox.x>=lastHeatBox.x+lastHeatBox.width-1,
      '日期气泡应贴在方格左侧或右侧：'+JSON.stringify({lastHeatBox,lastBubbleBox}));
    await page.locator('#stats-performance-title').click();
    assert(await page.locator('#stats-calendar-detail').isHidden());
    assert.equal(await heatSquares.last().getAttribute('aria-pressed'),'false');
    await heatSquares.first().click();
    assert.equal(await heatSquares.last().getAttribute('aria-pressed'),'false');
    assert.equal(await heatSquares.first().getAttribute('aria-pressed'),'true');
    const firstHeatBox=await heatSquares.first().boundingBox(),firstBubbleBox=await page.locator('#stats-calendar-detail').boundingBox();
    assert(firstBubbleBox.x+firstBubbleBox.width<=firstHeatBox.x+1 || firstBubbleBox.x>=firstHeatBox.x+firstHeatBox.width-1,
      '日期气泡应贴在方格左侧或右侧');
    assert(await page.evaluate(()=>document.querySelector('.stats-content').scrollWidth<=document.querySelector('.stats-content').clientWidth+1));
    await page.screenshot({path:path.join(screenshots,`${width}-statistics.png`)});
    await page.click('#close-stats');await position(0);
    // Reloading from a child must reuse HOME rather than accumulate exit guards.
    await page.click('#home-harmonic');await position(1);await page.click('#open-settings');await position(2);
    await page.reload();await page.waitForFunction(()=>window.IntervalAppReady);await position(0);assert(await page.locator('#home-screen').isVisible());
    if(installed){
      await page.locator('#home-title').click();await back();await position(-1);
      assert(await page.locator('#toast').evaluate(el=>el.classList.contains('visible') && el.textContent==='再按一次返回退出'));
      await position(0); // The expired 2.2 s window reuses the existing entry.
      await back();await position(-1);
      await page.click('#home-singing');await position(1);await back();await position(0);await noExit();
      await back();await position(-1);await back();await page.waitForSelector('#previous');
    }else{await back();await page.waitForSelector('#previous');}
    assert.deepEqual(errors,[]);
    console.log(`PASS navigation/statistics ${width}px: settings, stats, goals, songs/player, mixed/native Back, forward, reload, HOME exit and swipe`);
    await context.close();
  }
  console.log('Navigation/statistics screenshots:',screenshots);
};
