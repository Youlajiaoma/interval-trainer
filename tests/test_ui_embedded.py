from playwright.sync_api import sync_playwright
from pathlib import Path
import re
import tempfile
import os
root=Path(__file__).resolve().parents[1]/'site'
src=(root/'index.html').read_text(encoding='utf-8')
# Inline the current files even when the production page versions its resource URLs.
src=re.sub(r'((?:src|href)="[^"?]+)\?v=[^"]*"', r'\1"', src)
src=src.replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'styles.css').read_text(encoding='utf-8')+'</style>')
src=src.replace('<link rel="stylesheet" href="sight.css">','<style>'+(root/'sight.css').read_text(encoding='utf-8')+'</style>')
src=src.replace('<link rel="stylesheet" href="singing.css">','<style>'+(root/'singing.css').read_text(encoding='utf-8')+'</style>')
src=src.replace('<link rel="stylesheet" href="harmony-practice.css">','<style>'+(root/'harmony-practice.css').read_text(encoding='utf-8')+'</style>')
src=src.replace('<link rel="stylesheet" href="theme.css">','<style>'+(root/'theme.css').read_text(encoding='utf-8')+'</style>')
src=src.replace('<link rel="manifest" href="manifest.webmanifest">','')
src=re.sub(r'<link rel="(?:icon|apple-touch-icon)"[^>]*>', '',src)
# This in-page test uses a memory adapter. IndexedDB persistence is separately
# covered by test_indexeddb.cjs and test_pwa_integration.py.
adapter='''<script>
const tdata = new Map();
window.IntervalPwaStorage={MELODY_KEY:'interval-trainer-review-melodic-v1',initialize:async()=>({available:true,migrated:false,
 getItem:k=>tdata.get(k)??null,
 setItem:(k,v)=>tdata.set(k,String(v)),removeItem:k=>tdata.delete(k),
 replaceBoth:async(s,r)=>{tdata.set('interval-trainer-settings',s);tdata.set('interval-trainer-review-v1',r)},
 flush:async()=>{}})};
</script>'''
for script in ('motion.js','logic.js','modules.js','assets/piano-samples.js','assets/melodic-recordings.js','review.js','statistics.js','audio.js','daily-tasks.js','pitch.js','singing.js','assets/harmony-songs.js','harmony-mix.js','harmony-practice.js'):
    src=src.replace(f'<script src="{script}"></script>',f'<script>\n{(root/script).read_text(encoding="utf-8")}\n</script>')
src=src.replace('<script src="storage.js"></script>', adapter)
src=src.replace('<script src="app.js"></script>',f'<script>\n{(root/"app.js").read_text(encoding="utf-8")}\n</script>')
src=src.replace('<script src="pwa-register.js"></script>','')
# This embedded-page test covers harmonic practice; notation has its own browser test.
for script in ('vendor/vexflow-loader.js','sight.js','staff-interval.js'):
    src=src.replace(f'<script src="{script}"></script>','')
screenshots=Path(tempfile.mkdtemp(prefix='tonaloom-ui-'))
with sync_playwright() as pw:
  chromium=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
  browser=pw.chromium.launch(headless=True,executable_path=chromium,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
  for kind,viewport in [('phone',{'width':390,'height':844}),('tablet',{'width':900,'height':1000})]:
    page=browser.new_page(viewport=viewport)
    errors=[]
    page.on('pageerror',lambda x:errors.append(str(x)))
    page.set_content(src,wait_until='domcontentloaded',timeout=40000)
    page.wait_for_function('window.IntervalAppReady === true',timeout=15000)
    assert page.evaluate('getComputedStyle(document.body).userSelect')=='none'
    assert page.evaluate('getComputedStyle(document.querySelector("#home-title")).userSelect')=='none'
    page.locator('#home-harmonic').click()
    assert page.locator('#answer-grid button').count()==13
    assert page.locator('#practice .audio-toolbar').count()==1
    assert page.locator('#practice .practice-meta').count()==1
    page.screenshot(path=str(screenshots/f'{kind}-main.png'))
    page.locator('.answer-button').nth(0).click()
    assert page.locator('#answered-number').inner_text()=='1'
    assert int(page.evaluate('JSON.parse(tdata.get("interval-trainer-review-v1")).totalAnswers'))==1
    page.locator('#open-settings').click()
    page.wait_for_function("!document.querySelector('#settings-dialog').classList.contains('motion-dialog-opening')")
    drawer=page.locator('#settings-dialog');drawer_box=drawer.bounding_box()
    assert not drawer.locator('.settings-header').is_visible()
    usable_width=page.evaluate('document.documentElement.clientWidth')
    assert drawer_box['width']<usable_width and abs(drawer_box['x']+drawer_box['width']-usable_width)<2, \
        f'{kind} 设置侧栏应贴合页面可见右缘：可用宽度 {usable_width}px，侧栏 {drawer_box}'
    page.locator('#open-stats').click()
    assert page.locator('#stats-dialog').is_visible()
    assert page.locator('#stats-dialog .stats-header').count()==0
    assert page.locator('#stats-current-module-title').inner_text()=='和声音程'
    assert page.locator('#stats-summary .stats-kpi').count()==4
    assert page.locator('#stats-dialog').get_attribute('data-stats-module')=='harmonic'
    kpi_boxes=page.locator('#stats-summary .stats-kpi').evaluate_all('(items) => items.map(item => item.getBoundingClientRect().toJSON())')
    assert max(box['height'] for box in kpi_boxes)<=90
    heat_box=page.locator('#stats-calendar .stats-heat').first.bounding_box()
    assert heat_box['width']>=heat_box['height']*1.9
    row=page.locator('#stats-intervals .stats-interval-row').first
    row_box=row.bounding_box();name_box=row.locator('.stats-interval-name').bounding_box()
    track_box=row.locator('.stats-interval-track').bounding_box();value_box=row.locator('.stats-interval-value').bounding_box()
    assert abs(name_box['x']-row_box['x'])<2
    assert abs(value_box['x']+value_box['width']-row_box['x']-row_box['width'])<2
    left_gap=track_box['x']-name_box['x']-name_box['width'];right_gap=value_box['x']-track_box['x']-track_box['width']
    assert abs(left_gap-right_gap)<2 and track_box['width']>=40
    assert page.locator('.stats-interval-name').first.evaluate("el=>getComputedStyle(el).whiteSpace")=='nowrap'
    details=page.locator('.stats-data-details');summary=details.locator('summary')
    assert abs(details.bounding_box()['height']-summary.bounding_box()['height'])<=2
    assert page.locator('#stats-history, #stats-review-plan').count()==0
    assert 'IndexedDB' in page.locator('#stats-storage-warning').text_content()
    page.screenshot(path=str(screenshots/f'{kind}-stats.png'))
    page.locator('#stats-period').select_option('7')
    assert page.locator('#stats-trend svg').count()==1
    page.keyboard.press('Escape')
    page.locator('#stats-dialog').wait_for(state='hidden')
    page.locator('#next-question').click()
    page.locator('.answer-button').nth(1).click()
    assert page.locator('#answered-number').inner_text()=='2'
    assert not errors,errors
    print('PASS UI',kind,'2 answers, stats, storage calls, tabs, no script errors')
    page.close()
  browser.close()
