from pathlib import Path
import json,time,hmac,hashlib,base64,secrets
from playwright.sync_api import sync_playwright
# Reuse only the transparent proxy, not the performance measurement loop.
exec(Path('/workspace/scripts/mega_iii_iv_map_benchmark.py').read_text().split('results=[];network=[];errors=[]')[0])
OUT=Path('/output/mega-iii-iv');OUT.mkdir(parents=True,exist_ok=True)
report={'lane':'CANONICAL_RENDERED_UI','screens':[],'errors':[],'checks':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1672,'height':941},device_scale_factor=1,locale='en-GB',timezone_id='UTC',reduced_motion='reduce')
 secret=(ROOT/'.tmp/release/operator-console-access-token').read_text().strip();now=int(time.time());enc=lambda d:base64.urlsafe_b64encode(d).decode().rstrip('=');payload=enc(json.dumps({'v':1,'aud':'vigia-operator-console','nonce':secrets.token_hex(24),'iat':now,'exp':now+60},separators=(',',':')).encode());token=payload+'.'+enc(hmac.new(secret.encode(),('operator-console-one-time-admission-v1\0'+payload).encode(),hashlib.sha256).digest())
 assert context.request.get(ORIGIN+'/?admission='+token,max_redirects=0).status==303
 page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
 def wait_dom(expression,timeout=30000):
  deadline=time.monotonic()+timeout/1000
  while time.monotonic()<deadline:
   if page.evaluate(expression):return
   page.wait_for_timeout(100)
  page.screenshot(path=str(OUT/'failure.png'));print(page.locator('[data-situation-body]').inner_text()[:1200] if page.locator('[data-situation-body]').count() else page.locator('main').inner_text()[:1200],flush=True)
  raise AssertionError('DOM condition timed out: '+expression)
 def shot(name):
  page.screenshot(path=str(OUT/(name+'.png')),full_page=False)
  metrics=page.evaluate('()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,dialog:document.querySelector(".vigia-dialog")?.getBoundingClientRect().width,map:document.querySelector("main .tile-map")?.dataset.mapInstanceId})')
  report['screens'].append({'name':name,**metrics});(OUT/'ui-focus.json').write_text(json.dumps(report,indent=2));print(name,metrics['overflow'],flush=True)
 for width,height in [(1672,941),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});page.goto(ORIGIN+'/#/incident-detail?id=incident%3APT-2026-01F7E2E21A');page.get_by_role('button',name='Ask Vigia',exact=True).click();page.get_by_label('Question',exact=True).fill('Which hospital is closest?');page.locator('[data-action="situation-ask"]').click();wait_dom('()=>document.querySelector("[data-situation-output]")?.textContent.includes("Hospital")');page.locator('[data-action="situation-facility"]').first.click();wait_dom('()=>document.querySelector("[data-situation-output]")?.textContent.includes("Calculated access")');shot('facility-route-'+str(width));page.locator('[data-action="situation-route-map"]').click();page.wait_for_selector('.situation-map-mode');shot('facility-map-'+str(width));page.locator('.situation-map-mode button').click()
 report['browser']=browser.version;(OUT/'ui-focus.json').write_text(json.dumps(report,indent=2));browser.close()
server.shutdown()
