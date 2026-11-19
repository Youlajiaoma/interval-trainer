"""Optional real-browser PWA test. Requires a local server and Playwright Chromium.
Run from the project root: python -m http.server 8000 --directory site
Then: python tests/test_pwa_integration.py
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import os
url=os.environ.get('PWA_TEST_URL','http://localhost:8000/')
with sync_playwright() as p:
    chromium=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    browser=p.chromium.launch(headless=True,executable_path=chromium)
    context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
    page=context.new_page()
    context.add_init_script('''
      window.harmonyDecodeCount=0;
      const Device=window.AudioContext||window.webkitAudioContext;
      if(Device){const decode=Device.prototype.decodeAudioData;
        Device.prototype.decodeAudioData=function(...args){harmonyDecodeCount++;return decode.apply(this,args);};}
    ''')
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url,wait_until='domcontentloaded')
    page.wait_for_function('window.IntervalAppReady === true')
    page.locator('#home-harmonic').click()
    assert page.locator('.answer-button').count()==13
    assert page.evaluate('window.IntervalPwaStorageAdapter.available')
    page.locator('.answer-button').first.click()
    assert page.locator('#answered-number').inner_text()=='1'
    page.evaluate('async()=>await window.IntervalPwaStorageAdapter.flush()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.IntervalAppReady === true')
    page.locator('#home-harmonic').click()
    assert page.evaluate('JSON.parse(window.IntervalPwaStorageAdapter.getItem("interval-trainer-review-v1")).totalAnswers')==1
    page.locator('#open-settings').click()
    page.locator('#open-stats').click()
    assert page.locator('#stats-summary .stats-kpi').count()==4
    page.locator('.stats-data-details summary').click()
    with page.expect_download() as d:
        page.locator('#export-backup').click()
    assert d.value.suggested_filename.endswith('.json')
    page.wait_for_function('navigator.serviceWorker.controller !== null',timeout=30000)
    # Installation saves all original stems before any song has been played.
    page.wait_for_function('''async()=>{
      const recordings=await caches.open('interval-trainer-harmony-recordings-v1');
      return (await Promise.all(Object.values(TonaloomHarmonySongs[0].stems).map(src=>recordings.match(new URL(src,document.baseURI).href)))).every(Boolean);
    }''',timeout=30000)
    page.wait_for_function("async()=>(await (await caches.open('interval-trainer-harmony-transports-v1')).keys()).length>0",timeout=30000)
    assert page.locator('#harmony-audio').evaluate('(a)=>a.paused')
    # The SW must cache piano assets before this test passes offline.
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.IntervalAppReady === true')
    page.locator('#home-harmony-practice').click()
    page.evaluate('''()=>{
      document.getElementById('harmony-directory').addEventListener('click',()=>window.songClickAt=performance.now(),{once:true});
      document.getElementById('harmony-audio').addEventListener('playing',function(){if(this.duration>1)window.songStartedAt=performance.now();});
    }''')
    page.locator('#harmony-directory button').first.click()
    page.wait_for_function("document.getElementById('harmony-audio').duration>1 && !document.getElementById('harmony-audio').paused && document.getElementById('harmony-audio').currentTime>.03")
    assert page.evaluate('harmonyDecodeCount')==0,'Reopening must reuse the prepared local file without decoding again'
    assert page.locator('#harmony-audio').evaluate('(a)=>a.loop')
    local_start=page.evaluate('Math.round(songStartedAt-songClickAt)')
    partial=page.evaluate('''async()=>{
      const response=await fetch(TonaloomHarmonySongs[0].stems.melody,{headers:{Range:'bytes=44-143'}});
      return {status:response.status,length:(await response.arrayBuffer()).byteLength};
    }''')
    assert partial=={'status':206,'length':100},partial
    page.locator('#back-home').click()
    page.locator('#harmony-directory').wait_for(state='visible')
    page.locator('#back-home').click()
    page.locator('#home-screen').wait_for(state='visible')
    print(f'PASS: first song playback offline after reload, no decoding, local start {local_start} ms, offline range seeking')
    page.locator('#home-harmonic').click()
    assert page.locator('.answer-button').count()==13
    assert page.evaluate('JSON.parse(window.IntervalPwaStorageAdapter.getItem("interval-trainer-review-v1")).totalAnswers')==1
    page.locator('#back-home').click()
    page.locator('#home-daily-tasks').click()
    page.locator('#daily-harmonic-enabled').check()
    page.locator('#daily-harmonic-minus').click()
    assert page.locator('#daily-harmonic-target').inner_text()=='10'
    page.locator('#daily-tasks-save').click()
    page.wait_for_selector('#daily-tasks-dialog',state='hidden')
    page.locator('#home-harmonic').click()
    for index in range(9):
        page.locator('#reveal-answer').click()
        if index < 8:
            page.locator('#next-question').click()
    page.wait_for_function('window.TonaloomDailyTasks.progress("harmonic").complete')
    page.locator('#back-home').click()
    assert page.locator('#home-harmonic-marker').inner_text()=='✓'
    page.evaluate('async()=>await window.IntervalPwaStorageAdapter.flush()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.IntervalAppReady === true')
    assert page.locator('#home-harmonic-marker').inner_text()=='✓'
    assert page.evaluate('JSON.parse(window.IntervalPwaStorageAdapter.getItem("interval-trainer-review-v1")).totalAnswers')==10
    page.locator('#home-singing').click()
    assert page.locator('#singing-chart').is_visible()
    page.locator('#open-settings').click()
    page.locator('#singing-low').select_option('61')
    page.locator('#singing-high').select_option('61')
    page.locator('#singing-settings-done').click()
    page.locator('#singing-settings').wait_for(state='hidden')
    page.locator('#singing-play').click()
    page.wait_for_function('document.getElementById("singing-play").textContent === "重播钢琴"')
    page.evaluate('async()=>await window.IntervalPwaStorageAdapter.flush()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.IntervalAppReady === true')
    page.locator('#home-singing').click()
    page.locator('#open-settings').click()
    assert page.locator('#singing-low').input_value()=='61'
    assert page.locator('#singing-high').input_value()=='61'
    assert page.evaluate('TonaloomModules.get("singing").reviewManager().snapshot().totalAnswers')==0
    assert not errors,errors
    page.close()
    page=context.new_page()
    page.goto(url,wait_until='domcontentloaded')
    page.wait_for_function('window.IntervalAppReady === true')
    page.locator('#home-harmony-practice').click()
    page.locator('#harmony-directory button').first.click()
    page.wait_for_function("document.getElementById('harmony-audio').duration>1 && !document.getElementById('harmony-audio').paused")
    assert page.evaluate('harmonyDecodeCount')==0
    assert page.evaluate('JSON.parse(window.IntervalPwaStorageAdapter.getItem("interval-trainer-review-v1")).totalAnswers')==10
    print('PASS: closed/reopened page offline, local song reuse, installed SW, IDB history, daily goals, singing resources and range persistence')
    browser.close()
