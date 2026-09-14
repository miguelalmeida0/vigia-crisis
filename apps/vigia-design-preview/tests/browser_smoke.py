"""Browser checks for the actual built single-file preview, not a screenshot mock.

Run after `npm run build` with Python + Playwright + Chromium installed:
  CHROMIUM_PATH=/usr/bin/chromium python tests/browser_smoke.py

This environment disallows localhost navigation in its managed Chromium.
We do not change that policy. The byte-identical generated preview.html is
loaded with set_content in an in-memory page; the HTTP server is tested
separately. Local-storage persistence is covered by the Node unit tests.
"""
from pathlib import Path
import os, json, time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('VIGIA_REVIEW_DIR', str(ROOT/'qa-output')))
OUT.mkdir(exist_ok=True,parents=True)
HTML=(ROOT/'preview.html').read_text()
ROUTES=['command-overview','incidents','incident-detail','intelligence','operations','reports-analytics','national-awareness']
results=[]; errors=[]; warnings=[]
def record(name,fn):
    try:
        fn(); results.append({'name':name,'status':'PASS'}); print('PASS',name,flush=True)
    except Exception as exc:
        results.append({'name':name,'status':'FAIL','reason':str(exc)[:1000]}); print('FAIL',name,str(exc)[:200],flush=True)
def require(value,message='Assertion failed'):
    if not value: raise AssertionError(message)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1,reduced_motion='reduce',accept_downloads=True)
    page.set_default_timeout(1800)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda msg: warnings.append(msg.text) if msg.type=='error' else None)
    page.set_content(HTML,wait_until='load');page.wait_for_timeout(100)
    def go(route):
        page.evaluate('(r)=>location.hash="#/"+r',route);page.wait_for_timeout(75)
    def close():
        if page.locator('dialog[open]').count():page.keyboard.press('Escape')
    record('seven route navigation links',lambda:require(page.locator('.vg-nav a').count()==7))
    record('persistent demo disclosure',lambda:require('No live emergency data' in page.locator('.demo-status').inner_text()))
    go('incidents')
    record('incident list initial page has seven rows',lambda:require(page.locator('.incident-row').count()==7))
    def search_test():
        page.get_by_label('Search incidents').fill('Valongo');page.wait_for_timeout(80)
        require(page.locator('.incident-row').count()==1)
        require('Valongo' in page.locator('.incident-row').inner_text())
    record('incident search filters actual records',search_test)
    def no_match():
        page.get_by_label('Search incidents').fill('no-match-anywhere-123');page.wait_for_timeout(50)
        require(page.get_by_text('No matching incidents',exact=True).is_visible())
        page.get_by_role('button',name='Reset filters',exact=True).first.click()
    record('empty search and reset',no_match)
    def pagination():
        page.get_by_role('button',name='Next page',exact=True).click();require('Landeira' in page.locator('.incident-row').first.inner_text())
        page.get_by_role('button',name='Previous page',exact=True).click();require('Lever' in page.locator('.incident-row').first.inner_text())
    record('pagination next and previous',pagination)
    def selection():
        page.locator('[data-action="select-incident"][data-id="valongo"]').click()
        require('Valongo' in page.locator('.preview-heading h2').inner_text())
        page.get_by_role('button',name='Open incident',exact=True).click();page.wait_for_timeout(80)
        require('valongo' in page.evaluate('location.hash'))
        page.locator('.vg-nav a').filter(has_text='Intelligence').click();page.wait_for_timeout(60)
        require('valongo' in page.evaluate('location.hash'))
        require(page.evaluate('VIGIA_PREVIEW.getSnapshot().selected')=='valongo')
    record('selected incident persists across routes',selection)
    go('intelligence?id=lever')
    def evidence_modal():
        page.locator('[data-action="question"][data-id="official"]').click()
        require(page.locator('dialog[open]').count()==1)
        require('does not establish official' in page.locator('dialog').inner_text().lower() or 'do not establish official' in page.locator('dialog').inner_text().lower())
        page.keyboard.press('Escape');require(page.locator('dialog[open]').count()==0)
        require(page.evaluate('document.activeElement.dataset.action')=='question')
    record('evidence modal and Escape focus restoration',evidence_modal)
    close()
    def request_task():
        go('intelligence?id=lever')
        page.locator('[data-action="question"][data-id="official"]').click()
        page.get_by_role('button',name='Request verification',exact=True).click();page.wait_for_timeout(75)
        require(page.evaluate('VIGIA_PREVIEW.getRoute()')=='operations')
        require(page.locator('.task-row').count()==4,'Existing active task must not duplicate')
    record('verification request opens existing task without duplication',request_task)
    def owner():
        page.get_by_label('Task owner').select_option('Duty analyst')
        page.get_by_role('button',name='Update owner',exact=True).click()
        require(page.evaluate('VIGIA_PREVIEW.getSnapshot().tasks.lever[0].owner')=='Duty analyst')
    record('task ownership updates state',owner)
    def note():
        page.locator('#task-note').fill('<img src=x onerror=alert(1)> review source')
        page.get_by_role('button',name='Save note',exact=True).click()
        require(len(page.evaluate('VIGIA_PREVIEW.getSnapshot().tasks.lever[0].notes'))==1)
        page.get_by_role('button',name='More actions',exact=True).click()
        require(page.locator('dialog img').count()==0,'Saved user note must be escaped')
        close()
    record('task notes persist locally and escape markup',note)
    def transition():
        page.get_by_role('button',name='Mark as in progress',exact=True).click()
        require(page.evaluate('VIGIA_PREVIEW.getSnapshot().tasks.lever[0].status')=='progress')
        page.get_by_role('button',name='Mark as complete',exact=True).click()
        require(page.locator('dialog[open]').count()==1)
        page.get_by_role('button',name='Complete demo task',exact=True).click()
        require(page.evaluate('VIGIA_PREVIEW.getSnapshot().tasks.lever[0].status')=='completed')
    record('task transitions and explicit completion confirmation',transition)
    def tabs():
        page.get_by_role('tab',name='Completed',exact=False).click()
        require(page.locator('.task-row').count()==1)
        page.get_by_role('tab',name='All tasks',exact=False).click()
    record('task status tabs filter actual records',tabs)
    def new_task():
        page.get_by_role('button',name='New task',exact=True).click()
        page.get_by_role('button',name='Create task',exact=True).click()
        require('at least five' in page.locator('#new-task-error').inner_text())
        page.locator('#new-task-title').fill('Check the test source')
        page.locator('#new-task-reason').fill('A local preview interaction test.')
        page.get_by_role('button',name='Create task',exact=True).click()
        require(page.locator('.task-row').count()==5)
    record('new task validates title and creates a scoped local record',new_task)
    def readonly():
        page.get_by_label('Preview data state').select_option('readonly')
        require(page.get_by_role('button',name='New task',exact=True).is_disabled())
        require(page.get_by_role('button',name='Update owner',exact=True).is_disabled())
        page.get_by_label('Preview data state').select_option('populated')
    record('read-only state disables task mutations',readonly)
    go('reports-analytics?view=performance')
    def report_views():
        for key in ['decisions','outcomes','performance','quality']:
            page.locator(f'[data-action="report-tab"][data-tab="{key}"]').click();page.wait_for_timeout(45)
            require(page.locator('[data-report-view]').get_attribute('data-report-view')==key)
    record('four report tabs display distinct views',report_views)
    def period():
        page.locator('[data-action="report-tab"][data-tab="decisions"]').click();page.wait_for_timeout(45)
        page.get_by_label('Report period').select_option('7d');require('48 reviews' in page.locator('.report-summary').inner_text())
    record('report period changes summaries and chart dataset',period)
    def compare():
        page.locator('[data-action="report-tab"][data-tab="performance"]').click();page.wait_for_timeout(45)
        page.get_by_role('button',name='Compare',exact=True).click()
        require(page.locator('.comparison-note').count()==4)
    record('comparison control changes displayed comparison notes',compare)
    def export():
        with page.expect_download(timeout=3000) as download:
            page.get_by_role('button',name='Export',exact=True).click()
        require('DEMO' in download.value.suggested_filename)
        path=download.value.path();require('FICTIONAL DATA' in Path(path).read_text())
    record('CSV export is a real downloadable labeled artifact',export)
    def keyboard_tabs():
        tab=page.locator('[data-action="report-tab"][data-tab="performance"]');tab.focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(45)
        require(page.locator('[data-report-view]').get_attribute('data-report-view')=='quality')
        require(page.evaluate('document.activeElement.dataset.tab')=='quality')
    record('keyboard arrows switch tabs and retain focus',keyboard_tabs)
    go('national-awareness')
    def regional():
        page.get_by_label('Region',exact=True).select_option('Centro')
        require(page.locator('.region-name h2').inner_text()=='Centro')
        page.get_by_role('button',name='View regional incidents',exact=True).click();page.wait_for_timeout(65)
        require('region=Centro' in page.evaluate('location.hash'))
        require(page.locator('.incident-row').count()==5)
    record('region selection deep-links to filtered incidents',regional)
    def maps():
        go('national-awareness')
        stage=page.locator('.map-stage').first
        page.get_by_role('button',name='Zoom in',exact=True).first.click()
        require('1.25' in stage.get_attribute('style'))
        page.get_by_role('button',name='Full-screen map',exact=True).click()
        require(page.locator('dialog[open].dialog-full').count()==1);close()
    record('map zoom and fullscreen work',maps)
    def limited():
        page.get_by_label('Preview data state').select_option('limited')
        go('operations?id=lever')
        require('—' in page.locator('.operations-metrics').inner_text())
        require(page.get_by_text('Tasks could not be loaded',exact=True).is_visible())
        go('reports-analytics?view=performance')
        require(page.locator('.metric-unavailable').count()==4)
    record('unavailable counts never masquerade as zero',limited)
    def stale():
        page.get_by_label('Preview data state').select_option('stale')
        require('Last-known information' in page.locator('.state-banner').inner_text())
        page.get_by_label('Preview data state').select_option('populated')
    record('stale mode preserves a visible information-age warning',stale)
    def unknown():
        go('incident-detail?id=unknown-incident')
        require(page.get_by_text('Incident not found',exact=True).is_visible())
    record('unknown incident does not silently substitute another incident',unknown)
    record('no uncaught page exceptions',lambda:require(not errors,str(errors)))
    record('no browser console errors',lambda:require(not warnings,str(warnings)))
    page.close()
    # Fresh pages: actual exported artifact, no provider/network substitution.
    for width,height in [(1440,1000),(1586,992),(1024,768),(390,844)]:
        cap=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,reduced_motion='reduce')
        cap.set_content(HTML,wait_until='load')
        for n,r in enumerate(ROUTES,1):
            cap.evaluate('(r)=>location.hash="#/"+r',r);cap.wait_for_timeout(70)
            record(f'{r}: no horizontal overflow at {width}px',lambda:require(cap.evaluate('document.documentElement.scrollWidth <= innerWidth+1')))
            if width in [1440,390]:cap.screenshot(path=str(OUT/f'{n:02d}-{r}-{width}.png'),full_page=True)
        if width==390:
            def mobile_menu():
                cap.get_by_role('button',name='Open navigation',exact=True).click()
                require(cap.locator('.vg-sidebar.menu-open').count()==1)
                cap.get_by_role('button',name='Close navigation',exact=True).click()
                require(cap.locator('.vg-sidebar.menu-open').count()==0)
                require(cap.locator('.vg-sidebar').evaluate('(e)=>e.inert'))
                cap.get_by_role('button',name='Open navigation',exact=True).click()
                cap.keyboard.press('Escape')
                require(cap.locator('.vg-sidebar.menu-open').count()==0)
                require(not cap.locator('.vg-main').evaluate('(e)=>e.inert'))
            record('mobile navigation opens and closes',mobile_menu)
        cap.close()
    # Explicit sparse-state images for review.
    sparse=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1,reduced_motion='reduce')
    sparse.set_content(HTML,wait_until='load');sparse.get_by_label('Preview data state').select_option('limited')
    for r in ['intelligence','operations','reports-analytics']:
        sparse.evaluate('(r)=>location.hash="#/"+r',r);sparse.wait_for_timeout(50)
        sparse.screenshot(path=str(OUT/f'limited-{r}-1440.png'),full_page=True)
    browser.close()
summary={'harness':'Actual generated preview.html rendered in an in-memory Chromium page. Managed localhost browser navigation is blocked; not bypassed. HTTP static serving is verified separately.','passed':sum(x['status']=='PASS' for x in results),'failed':sum(x['status']=='FAIL' for x in results),'results':results,'pageErrors':errors,'consoleErrors':warnings}
(OUT/'browser-results.json').write_text(json.dumps(summary,indent=2))
for r in results:
    print(r['status'],r['name'],r.get('reason',''))
print(f"TOTAL {summary['passed']} PASS / {summary['failed']} FAIL")
raise SystemExit(1 if summary['failed'] else 0)
