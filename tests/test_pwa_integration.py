"""Optional real-browser PWA test. Requires a local server and Playwright Chromium.
Run from the project root: python -m http.server 8000 --directory site
Then: python tests/test_pwa_integration.py
Not executed in the authorship environment: local HTTP is blocked by administrator policy.
"""
from playwright.sync_api import sync_playwright
import os
url=os.environ.get('PWA_TEST_URL','http://localhost:8000/')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url,wait_until='domcontentloaded')
    page.wait_for_function('window.IntervalAppReady === true')
    assert page.locator('.answer-button').count()==13
    assert page.evaluate('window.IntervalPwaStorageAdapter.available')
    page.locator('.answer-button').first.click()
    assert page.locator('#answered-number').inner_text()=='1'
    page.evaluate('async()=>await window.IntervalPwaStorageAdapter.flush()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.IntervalAppReady === true')
    assert page.evaluate('JSON.parse(window.IntervalPwaStorageAdapter.getItem("interval-trainer-review-v1")).totalAnswers')==1
    page.locator('#open-settings').click()
    page.locator('#open-stats').click()
    assert page.locator('#stats-summary .stats-kpi').count()==4
    with page.expect_download() as d:
        page.locator('#export-backup').click()
    assert d.value.suggested_filename.endswith('.json')
    page.wait_for_function('navigator.serviceWorker.controller !== null',timeout=30000)
    # The SW must cache piano assets before this test passes offline.
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.IntervalAppReady === true')
    assert page.locator('.answer-button').count()==13
    assert page.evaluate('JSON.parse(window.IntervalPwaStorageAdapter.getItem("interval-trainer-review-v1")).totalAnswers')==1
    assert not errors,errors
    print('PASS: installed SW, offline reload, IDB history persists, stats work')
    browser.close()
