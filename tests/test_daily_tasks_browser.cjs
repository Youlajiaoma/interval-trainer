'use strict';
// Isolated browser contexts never share the user's normal practice records.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const site = path.resolve(__dirname,'../site');
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(),'tonaloom-daily-'));
const ids = ['harmonic','melodic','sight','staff'];
const controls = {
  harmonic:{home:'home-harmonic',settings:'settings-dialog',done:'settings-done',section:'daily-harmonic-settings'},
  melodic:{home:'home-melodic',settings:'settings-dialog',done:'settings-done',section:'daily-melodic-settings'},
  sight:{home:'home-sight',settings:'sight-settings-dialog',done:'sight-settings-done',section:'daily-sight-settings'},
  staff:{home:'home-staff-interval',settings:'staff-interval-settings',done:'staff-interval-settings-done',section:'daily-staff-settings'}
};
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
      await page.locator('#splash-screen').waitFor({state:'detached'});
      assert.equal(await page.locator('.home-tools button').count(),1,'主页只保留练习统计入口');
      assert.equal(await page.locator('#home-daily-tasks').count(),0,'主页不再显示每日任务入口');

      for (const id of ids) {
        const c=controls[id], prefix='daily-'+id;
        await page.click('#'+c.home); await page.click('#open-settings');
        assert(await page.locator('#'+c.section).isVisible(),`${id} 设置应显示自己的每日任务`);
        assert.equal(await page.locator('#'+prefix+'-target').textContent(),'0');
        assert(await page.locator('#'+prefix+'-minus').isDisabled());
        await page.click('#'+prefix+'-plus'); assert.equal(await page.locator('#'+prefix+'-target').textContent(),'10');
        assert(!await page.evaluate(id => TonaloomDailyTasks.progress(id).enabled,id),'未保存前目标不能生效');
        await page.click('#'+prefix+'-save');
        await page.waitForFunction(id => TonaloomDailyTasks.progress(id).target === 10,id);
        if (id==='harmonic') {
          await page.click('#'+prefix+'-minus'); assert.equal(await page.locator('#'+prefix+'-target').textContent(),'0');
          assert(await page.locator('#'+prefix+'-minus').isDisabled());
          await page.click('#'+prefix+'-save');
          await page.waitForFunction(id => !TonaloomDailyTasks.progress(id).enabled,id);
          await page.click('#'+prefix+'-plus'); await page.click('#'+prefix+'-save');
          await page.waitForFunction(id => TonaloomDailyTasks.progress(id).target === 10,id);
        }
        assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
        if (id==='harmonic') await page.screenshot({path:path.join(screenshots,`${width}-settings.png`)});
        await page.click('#'+c.done); await page.click('#back-home');
      }

      // Seed nine real saved answers, then finish every configured module.
      await page.evaluate(async () => {
        for (const module of TonaloomModules.list.filter(item => item.id !== 'singing')) for (let part=0;part<module.reviews.length;part++) {
          const definition=module.reviews[part], manager=IntervalReview.createReviewManager(IntervalPwaStorageAdapter,definition.key,
            {maxIndex:definition.maxIndex,directional:Boolean(definition.directional)});
          for (let index=0;index<(module.id==='sight'?(part===0?5:4):9);index++)
            manager.record({actual:4,chosen:4,low:60,high:64,direction:definition.directional?1:null});
        }
        await IntervalPwaStorageAdapter.flush();
      });
      for (const id of ids) {
        const c=controls[id]; await page.click('#'+c.home);
        assert(await page.locator('#daily-practice-check').isVisible());
        assert(!await page.locator('#daily-practice-check').evaluate(element=>element.classList.contains('is-complete')));
        const reveal=id==='sight'?'#sight-reveal':id==='staff'?'#staff-interval-reveal':'#reveal-answer';
        const left=await page.locator(reveal).boundingBox();
        assert(left.x+left.width/2<width*.4,'显示答案应在页面左侧');
        await page.click(reveal);
        await page.waitForFunction(id=>TonaloomDailyTasks.progress(id).count===10,id);
        assert(await page.locator('#daily-practice-check').evaluate(element=>element.classList.contains('is-complete')));
        if(id==='harmonic'||id==='melodic'){
          const right=await page.locator('#next-question').boundingBox();
          assert(right.x>left.x+left.width+30,'下一题必须与显示答案分开');
          await page.mouse.click(left.x+left.width/2,left.y+left.height/2);
          assert.equal(await page.evaluate(id=>TonaloomDailyTasks.progress(id).count,id),10);
          await page.click('#next-question');
          await page.mouse.click(right.x+right.width/2,right.y+right.height/2);
          assert.equal(await page.evaluate(id=>TonaloomDailyTasks.progress(id).count,id),10,'连续点下一题不得意外查看答案');
        }
        await page.locator(reveal).waitFor({state:'visible'}); await page.click(reveal);
        await page.waitForFunction(id=>TonaloomDailyTasks.progress(id).count===11,id);
        if(id==='harmonic')await page.screenshot({path:path.join(screenshots,`${width}-practice.png`)});
        await page.click('#back-home'); assert.equal(await page.locator('#'+c.home+'-marker').textContent(),'✓');
      }
      await page.screenshot({path:path.join(screenshots,`${width}-home.png`)});
      assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
      await page.reload(); await page.waitForFunction(()=>window.IntervalAppReady);
      await page.locator('#splash-screen').waitFor({state:'detached'});
      assert(await page.evaluate(ids=>ids.every(id=>TonaloomDailyTasks.progress(id).complete),ids));
      assert(!await page.evaluate(()=>TonaloomDailyTasks.progress('singing').enabled),'未设置的模唱每日任务保持关闭');
      if(width===390){
        const second=await context.newPage(); await second.goto('http://127.0.0.1:8767/');
        await second.waitForFunction(()=>window.IntervalAppReady);
        await second.locator('#splash-screen').waitFor({state:'detached'});
        await page.click('#home-harmonic'); await page.click('#open-settings');
        await page.click('#daily-harmonic-plus'); await page.click('#daily-harmonic-save');
        await second.waitForFunction(()=>TonaloomDailyTasks.progress('harmonic').target===20);
        assert.equal(await second.locator('#home-harmonic-marker').textContent(),'→'); await second.close();
      }
      await page.evaluate(()=>{
        const Original=Date;
        window.Date=class extends Original{constructor(...args){super(...(args.length?args:[Original.now()+86400000]));}static now(){return Original.now()+86400000;}};
        window.dispatchEvent(new Event('focus'));
      });
      await page.waitForFunction(()=>TonaloomModules.list.every(module=>!TonaloomDailyTasks.progress(module.id).complete));
      assert.deepEqual(errors,[]);
      console.log(`PASS 每日任务：${width}px，模块独立、0关闭、按10题保存、达标后继续、跨天和双窗口同步`);
      await context.close();
    }
    console.log('每日任务截图：'+screenshots);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
