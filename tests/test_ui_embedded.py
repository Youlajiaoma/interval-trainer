from playwright.sync_api import sync_playwright
from pathlib import Path
import re
import tempfile
root=Path(__file__).resolve().parents[1]/'site'
src=(root/'index.html').read_text()
src=src.replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'styles.css').read_text()+'</style>')
src=src.replace('<link rel="stylesheet" href="sight.css">','<style>'+(root/'sight.css').read_text()+'</style>')
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
for script in ('logic.js','assets/piano-samples.js','assets/melodic-recordings.js','review.js','statistics.js'):
    src=src.replace(f'<script src="{script}"></script>',f'<script>\n{(root/script).read_text()}\n</script>')
src=src.replace('<script src="storage.js"></script>', adapter)
src=src.replace('<script src="app.js"></script>',f'<script>\n{(root/"app.js").read_text()}\n</script>')
src=src.replace('<script src="pwa-register.js"></script>','')
# This embedded-page test covers harmonic practice; notation has its own browser test.
for script in ('vendor/vexflow-loader.js','sight.js','staff-interval.js'):
    src=src.replace(f'<script src="{script}"></script>','')
screenshots=Path(tempfile.mkdtemp(prefix='tonaloom-ui-'))
with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
  for kind,viewport in [('phone',{'width':390,'height':844}),('tablet',{'width':900,'height':1000})]:
    page=browser.new_page(viewport=viewport)
    errors=[]
    page.on('pageerror',lambda x:errors.append(str(x)))
    page.set_content(src,wait_until='domcontentloaded',timeout=40000)
    page.wait_for_function('window.IntervalAppReady === true',timeout=15000)
    page.locator('#home-harmonic').click()
    assert page.locator('#answer-grid button').count()==13
    assert page.locator('#practice .audio-toolbar').count()==1
    assert page.locator('#practice .practice-meta').count()==1
    page.screenshot(path=str(screenshots/f'{kind}-main.png'))
    page.locator('.answer-button').nth(0).click()
    assert page.locator('#answered-number').inner_text()=='1'
    assert int(page.evaluate('JSON.parse(tdata.get("interval-trainer-review-v1")).totalAnswers'))==1
    page.locator('#open-settings').click();page.locator('#open-stats').click()
    assert page.locator('#stats-dialog').is_visible()
    assert page.locator('#stats-summary .stats-kpi').count()==4
    assert page.locator('#stats-history .stats-history-row').count()==1
    assert 'IndexedDB' in page.locator('#stats-storage-warning').text_content()
    page.screenshot(path=str(screenshots/f'{kind}-stats.png'))
    page.locator('#stats-period').select_option('7')
    assert page.locator('#stats-trend svg').count()==1
    page.locator('#close-stats').click()
    assert page.locator('#stats-dialog').is_hidden()
    page.locator('#next-question').click()
    page.locator('.answer-button').nth(1).click()
    assert page.locator('#answered-number').inner_text()=='2'
    assert not errors,errors
    print('PASS UI',kind,'2 answers, stats, storage calls, tabs, no script errors')
    page.close()
  browser.close()
