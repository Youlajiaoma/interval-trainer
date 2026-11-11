'use strict';
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const site = path.resolve(__dirname,'../site');
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(),'tonaloom-motion-'));
async function settle(page,selector) {
  await page.locator(selector).evaluate(element => Promise.allSettled(element.getAnimations().map(animation => animation.finished)));
}
async function motion(page,selector) {
  return page.locator(selector).evaluate(element => element.getAnimations()
    .filter(animation => animation.effect.getKeyframes().some(frame => frame.transform))
    .map(animation => ({frames:animation.effect.getKeyframes(),duration:animation.effect.getTiming().duration,easing:animation.effect.getTiming().easing})));
}
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
  try {
    for (const [width,reduced] of [[320,false],[390,false],[900,false],[390,true]]) {
      const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:reduced ? 'reduce' : 'no-preference'});
      await context.route('http://127.0.0.1:8769/**',async route => {
        const file = path.join(site,new URL(route.request().url()).pathname.replace(/\/$/,'/index.html'));
        try { await route.fulfill({path:file}); } catch { await route.fulfill({status:404,body:''}); }
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror',error => errors.push(error.message));
      await page.addInitScript(() => {
        let audio;
        window.motionStops = 0;
        Object.defineProperty(window,'TonaloomAudio',{get:() => audio,set(api) {
          audio = {createChannel(level) {
            const channel = api.createChannel(level);
            return {...channel,get token() { return channel.token; },stop() { window.motionStops++; return channel.stop(); }};
          }};
        }});
      });
      await page.goto('http://127.0.0.1:8769/');
      await page.waitForFunction(() => window.IntervalAppReady && window.StaffIntervalTrainer);
      await page.click('#home-daily-tasks');
      const menuMotion = await motion(page,'#daily-tasks-dialog');
      assert.equal(menuMotion.length,reduced ? 0 : 1);
      if (!reduced) {
        assert.equal(menuMotion[0].frames[0].transform,'translateY(18px)');
        await page.locator('#daily-tasks-dialog').evaluate(element => {
          const animation = element.getAnimations().find(item => item.effect.getKeyframes().some(frame => frame.transform));
          animation.pause(); animation.currentTime = 65;
        });
        const opacity = await page.locator('#daily-tasks-dialog').evaluate(element => Number(getComputedStyle(element).opacity));
        assert(opacity > 0 && opacity < 1);
        await page.screenshot({path:path.join(screenshots,`${width}-opening.png`)});
        await page.locator('#daily-tasks-dialog').evaluate(element => element.getAnimations().forEach(animation => animation.play()));
      }
      await settle(page,'#daily-tasks-dialog');
      const closeState = await page.evaluate(() => {
        document.getElementById('daily-tasks-close').click();
        const dialog = document.getElementById('daily-tasks-dialog'); return {open:dialog.open,inert:dialog.inert};
      });
      assert.equal(closeState.open,!reduced); assert.equal(closeState.inert,!reduced);
      if (!reduced) assert.equal((await motion(page,'#daily-tasks-dialog'))[0].frames.at(-1).transform,'translateY(18px)');
      await page.waitForSelector('#daily-tasks-dialog',{state:'hidden'});
      assert.equal(await page.evaluate(() => document.activeElement.id),'home-daily-tasks');
      await page.click('#home-daily-tasks'); await settle(page,'#daily-tasks-dialog');
      await page.keyboard.press('Escape'); await page.waitForSelector('#daily-tasks-dialog',{state:'hidden'});
      if (width === 900) {
        await page.click('#home-daily-tasks'); await settle(page,'#daily-tasks-dialog');
        await page.mouse.click(20,200); await page.waitForSelector('#daily-tasks-dialog',{state:'hidden'});
      }
      const entries = await page.evaluate(() => TonaloomModules.list.map(module => ({id:module.id,home:module.homeId})));
      const settings = {harmonic:['settings-dialog','settings-done','open-stats'],melodic:['settings-dialog','settings-done','open-stats'],
        sight:['sight-settings-dialog','sight-settings-done','sight-open-stats'],staff:['staff-interval-settings','staff-interval-settings-done','staff-open-stats'],
        singing:['singing-settings','singing-settings-done','singing-open-stats']};
      for (const entry of entries) {
        await page.evaluate(id => document.getElementById(id).click(),entry.home);
        const forward = await motion(page,'.app-shell'); assert.equal(forward.length,reduced ? 0 : 1);
        if (!reduced) assert.equal(forward[0].frames[0].transform,'translateX(24px)');
        assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
        await settle(page,'.app-shell');
        const [dialogId,doneId,statsId] = settings[entry.id];
        await page.click('#open-settings'); await settle(page,'#'+dialogId);
        await page.click('#'+doneId); await page.waitForSelector('#'+dialogId,{state:'hidden'});
        await page.click('#open-settings'); await settle(page,'#'+dialogId);
        await page.click('#'+statsId);
        assert.deepEqual(await motion(page,'#stats-dialog'),menuMotion,'统计与每日任务使用相同的方向、时长和曲线');
        await settle(page,'#stats-dialog');
        assert(!await page.locator('#'+dialogId).evaluate(dialog => dialog.open));
        assert.equal(await page.evaluate(() => document.activeElement.closest('dialog')?.id),'stats-dialog');
        const nextMode = entry.id === 'harmonic' ? 'sight' : 'harmonic';
        await page.evaluate(id => document.getElementById('stats-'+id).click(),nextMode);
        assert.equal((await motion(page,'#stats-panels')).length,reduced ? 0 : 1);
        await settle(page,'#stats-panels');
        await page.selectOption('#stats-period','7'); await settle(page,'#stats-panels');
        await page.keyboard.press('Escape'); await page.waitForSelector('#stats-dialog',{state:'hidden'});
        const stops = await page.evaluate(() => window.motionStops);
        await page.evaluate(() => document.getElementById('back-home').click());
        const back = await motion(page,'.app-shell'); assert.equal(back.length,reduced ? 0 : 1);
        if (!reduced) assert.equal(back[0].frames[0].transform,'translateX(-24px)');
        assert(await page.evaluate(previous => window.motionStops > previous,stops),'返回立即停止音频');
        await settle(page,'.app-shell');
        assert(await page.locator('#home-screen').isVisible());
      }
      await page.evaluate(() => {
        for (let index = 0; index < 15; index++) {
          document.getElementById('home-harmonic').click(); document.getElementById('back-home').click();
        }
        const dialog = document.getElementById('daily-tasks-dialog');
        for (let index = 0; index < 15; index++) { TonaloomMotion.open(dialog); TonaloomMotion.close(dialog); TonaloomMotion.open(dialog); }
      });
      await settle(page,'#daily-tasks-dialog'); await settle(page,'.app-shell');
      assert(await page.locator('#daily-tasks-dialog').evaluate(dialog => dialog.open && !dialog.inert && !dialog.classList.contains('motion-dialog-closing')));
      await page.keyboard.press('Escape'); await page.waitForSelector('#daily-tasks-dialog',{state:'hidden'});
      await page.evaluate(async () => {
        await IntervalPwaStorageAdapter.flush();
        for (const item of TonaloomModules.reviewDefinitions) {
          const data = JSON.parse(IntervalPwaStorageAdapter.getItem(item.key)||'null');
          if (data?.totalAnswers) throw Error('导航不得新增答题记录');
        }
      });
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
      assert.equal(await page.locator('.app-shell').evaluate(element => getComputedStyle(element).transform),'none');
      if (!reduced) {
        await page.click('#home-daily-tasks'); await settle(page,'#daily-tasks-dialog');
        await page.evaluate(() => TonaloomMotion.close(document.getElementById('daily-tasks-dialog')));
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.waitForSelector('#daily-tasks-dialog',{state:'hidden'});
      }
      assert.deepEqual(errors,[]);
      console.log(`PASS 界面动画：${width}px ${reduced ? '减少动态效果' : '正常动画'}，往返、弹窗、遮罩、焦点和连续操作`);
      await context.close();
    }
    console.log('动画中间帧截图：'+screenshots);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
