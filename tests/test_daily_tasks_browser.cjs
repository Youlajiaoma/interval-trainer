'use strict';
// Same optional browser tools as the existing notation check. All data is in
// fresh browser contexts and never shares the user's normal browser profile.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const site = path.resolve(__dirname,'../site');
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(),'tonaloom-daily-'));
const ids = ['harmonic','melodic','sight','staff'];
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
  try {
    for (const width of [320,390,900]) {
      const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
      await context.route('http://127.0.0.1:8767/**',async route => {
        const file = path.join(site,new URL(route.request().url()).pathname.replace(/\/$/,'/index.html'));
        try { await route.fulfill({path:file}); } catch { await route.fulfill({status:404,body:''}); }
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror',error => errors.push(error.message));
      await page.goto('http://127.0.0.1:8767/');
      await page.waitForFunction(() => window.IntervalAppReady && window.StaffIntervalTrainer);
      const entries = await page.evaluate(() => Object.fromEntries(TonaloomModules.list.map(module => [module.id,module.homeId])));
      const tools = await page.locator('.home-tools button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
      assert(tools[0].x < tools[1].x && Math.abs(tools[0].y-tools[1].y) < 2,'每日任务应位于统计入口旁边');
      await page.click('#home-daily-tasks');
      assert.equal(await page.locator('#daily-tasks-dialog input:not([type=checkbox]), #daily-tasks-dialog textarea').count(),0);
      for (const id of ids) assert(await page.locator('#daily-'+id+'-quantity').isHidden());
      await page.check('#daily-harmonic-enabled');
      await page.click('#daily-harmonic-plus'); assert.equal(await page.locator('#daily-harmonic-target').textContent(),'30');
      await page.click('#daily-tasks-close'); await page.click('#home-daily-tasks');
      assert(!await page.locator('#daily-harmonic-enabled').isChecked());
      for (const id of ids) {
        await page.check('#daily-'+id+'-enabled'); await page.click('#daily-'+id+'-minus');
        assert.equal(await page.locator('#daily-'+id+'-target').textContent(),'10');
        assert(await page.locator('#daily-'+id+'-minus').isDisabled());
      }
      assert(!await page.evaluate(() => document.querySelector('#daily-tasks-dialog').scrollWidth > innerWidth));
      await page.screenshot({path:path.join(screenshots,`${width}-settings.png`)});
      await page.click('#daily-tasks-save'); await page.waitForSelector('#daily-tasks-dialog',{state:'hidden'});
      // Seed nine actual recorded answers per module, splitting note reading
      // across both clefs, then complete each goal through its real UI.
      await page.evaluate(async () => {
        for (const module of TonaloomModules.list) for (let part = 0; part < module.reviews.length; part++) {
          const definition = module.reviews[part], manager = IntervalReview.createReviewManager(IntervalPwaStorageAdapter,definition.key,
            {maxIndex:definition.maxIndex,directional:Boolean(definition.directional)});
          for (let index = 0; index < (module.id === 'sight' ? part === 0 ? 5 : 4 : 9); index++) {
            manager.record({actual:4,chosen:4,low:60,high:64,direction:definition.directional ? 1 : null});
          }
        }
        await IntervalPwaStorageAdapter.flush();
      });
      for (const id of ids) {
        await page.click('#'+entries[id]);
        assert(await page.locator('#daily-practice-check').isVisible());
        assert(!await page.locator('#daily-practice-check').evaluate(element => element.classList.contains('is-complete')));
        const reveal = id === 'sight' ? '#sight-reveal' : id === 'staff' ? '#staff-interval-reveal' : '#reveal-answer';
        const left = await page.locator(reveal).boundingBox();
        assert(left.x+left.width/2 < width*.4,'显示答案应在页面左侧');
        await page.click(reveal);
        await page.waitForFunction(id => TonaloomDailyTasks.progress(id).count === 10,id);
        assert(await page.locator('#daily-practice-check').evaluate(element => element.classList.contains('is-complete')));
        if (id === 'harmonic' || id === 'melodic') {
          const right = await page.locator('#next-question').boundingBox();
          assert(right.x > left.x+left.width+30,'下一题必须与显示答案分开');
          await page.mouse.click(left.x+left.width/2,left.y+left.height/2);
          assert.equal(await page.evaluate(id => TonaloomDailyTasks.progress(id).count,id),10);
          await page.click('#next-question');
          await page.mouse.click(right.x+right.width/2,right.y+right.height/2);
          assert.equal(await page.evaluate(id => TonaloomDailyTasks.progress(id).count,id),10,'连续点下一题不得意外查看答案');
        }
        // Both sight modules advance automatically; wait for their next note.
        await page.locator(reveal).waitFor({state:'visible'});
        await page.click(reveal);
        await page.waitForFunction(id => TonaloomDailyTasks.progress(id).count === 11,id);
        if (id === 'harmonic') await page.screenshot({path:path.join(screenshots,`${width}-practice.png`)});
        await page.click('#back-home');
        assert.equal(await page.locator('#'+entries[id]+'-marker').textContent(),'✓');
      }
      await page.screenshot({path:path.join(screenshots,`${width}-home.png`)});
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
      await page.reload(); await page.waitForFunction(() => window.IntervalAppReady);
      assert(await page.evaluate(ids => ids.every(id => TonaloomDailyTasks.progress(id).complete), ids));
      assert(!await page.evaluate(() => TonaloomDailyTasks.progress('singing').enabled), '未开启的新增模唱任务保持关闭');
      if (width === 390) {
        const second = await context.newPage(); await second.goto('http://127.0.0.1:8767/');
        await second.waitForFunction(() => window.IntervalAppReady);
        await page.click('#home-daily-tasks'); await page.click('#daily-harmonic-plus'); await page.click('#daily-tasks-save');
        await second.waitForFunction(() => TonaloomDailyTasks.progress('harmonic').target === 20);
        assert.equal(await second.locator('#home-harmonic-marker').textContent(),'→');
        await second.close();
      }
      // Returning after a day change refreshes the indicator without rewriting
      // yesterday's stored answers or daily-goal preferences.
      await page.evaluate(() => {
        const Original = Date;
        window.Date = class extends Original {
          constructor(...args) { super(...(args.length ? args : [Original.now()+86400000])); }
          static now() { return Original.now()+86400000; }
        };
        window.dispatchEvent(new Event('focus'));
      });
      await page.waitForFunction(() => TonaloomModules.list.every(module => !TonaloomDailyTasks.progress(module.id).complete));
      assert.deepEqual(errors,[]);
      console.log(`PASS 每日任务与左右操作：${width}px，设置、达标后继续、跨天、刷新和双窗口同步`);
      await context.close();
    }
    console.log('每日任务截图：'+screenshots);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
