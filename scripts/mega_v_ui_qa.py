from pathlib import Path
import json,time,hmac,hashlib,base64,secrets
from playwright.sync_api import sync_playwright
# Reuse only the transparent proxy, not the performance measurement loop.
exec(Path('/workspace/scripts/mega_iii_iv_map_benchmark.py').read_text().split('results=[];network=[];errors=[]')[0])
OUT=Path('/output/mega-v');OUT.mkdir(parents=True,exist_ok=True)
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
  report['screens'].append({'name':name,**metrics});(OUT/'ui-qa.json').write_text(json.dumps(report,indent=2));print(name,metrics['overflow'],flush=True)
 for width,height in [(1672,941),(390,844)]:
  page.set_viewport_size({'width':width,'height':height})
  for route in ['command-overview','incidents','incident-detail','fire-activity','response-access','national-awareness']:
   page.goto(ORIGIN+'/#/'+route+'?id=incident%3APT-2026-01F7E2E21A',wait_until='domcontentloaded')
   page.wait_for_selector('main .tile-map',state='attached',timeout=30000)
   wait_dom('()=>["READY","STALE","DEGRADED"].includes(document.querySelector("main")?.dataset.routeProjectionState)',timeout=40000)
   page.wait_for_timeout(900);shot(route+'-'+str(width))
  page.goto(ORIGIN+'/#/incident-detail?id=incident%3APT-2026-01F7E2E21A');page.get_by_role('button',name='Brief me',exact=True).click()
  wait_dom('()=>document.querySelector("[data-situation-output]")?.textContent.includes("Retained situation")',timeout=30000);shot('brief-'+str(width))
  page.locator('[data-mode="history"]').click();page.get_by_role('button',name='View historical brief',exact=True).click();page.wait_for_selector('[data-action="situation-history-map"]');shot('history-'+str(width))
  page.get_by_role('button',name='Compare moments',exact=True).click();page.wait_for_selector('[data-situation-output] h3');shot('compare-'+str(width))
  page.get_by_role('button',name='View historical brief',exact=True).click();page.get_by_role('button',name='Show historical map',exact=True).click();page.wait_for_selector('.situation-map-mode');shot('historical-map-'+str(width));page.locator('.situation-map-mode button').click()
  page.get_by_role('button',name='Ask Vigia',exact=True).click();page.locator('[data-mode="scenario"]').click();page.get_by_role('button',name='Run scenario',exact=True).click();wait_dom('()=>document.querySelector("[data-situation-output]")?.textContent.includes("Operational records are unchanged")');shot('scenario-'+str(width))
  page.locator('[data-mode="document"]').click();page.wait_for_selector('[name="source-file"]');shot('document-entry-'+str(width))
  page.locator('.vigia-dialog .icon-button[data-dialog-close]').click();page.get_by_role('button',name='Ask Vigia',exact=True).click();page.get_by_label('Question',exact=True).fill('Which hospital should I look at first?');page.locator('[data-action="situation-ask"]').click();wait_dom('()=>document.querySelector("[data-situation-output]")?.textContent.includes("Hospital")');shot('hospital-answer-'+str(width))
  inspect=page.locator('[data-action="situation-facility"]').first
  if inspect.count():
   inspect.click();wait_dom('()=>document.querySelector("[data-situation-output]")?.textContent.includes("Calculated access")');shot('facility-route-'+str(width))
  page.keyboard.press('Escape');report['checks'].append({'viewport':width,'escapeClosed':page.locator('.vigia-dialog').count()==0})
 for width,height in [(1600,1000),(1440,900),(1280,800),(1024,768),(768,1024),(430,932),(320,568)]:
  page.set_viewport_size({'width':width,'height':height});page.get_by_role('button',name='Brief me',exact=True).click();wait_dom('()=>document.querySelector("[data-situation-output]")?.textContent.includes("Retained situation")');shot('brief-'+str(width));page.keyboard.press('Escape')
 report['graphics']=page.evaluate('()=>{const c=document.querySelector("main canvas"),g=c?.getContext("webgl2")??c?.getContext("webgl");if(!g)return null;const e=g.getExtension("WEBGL_debug_renderer_info");return {vendor:e?g.getParameter(e.UNMASKED_VENDOR_WEBGL):null,renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null}}');report['browser']=browser.version;(OUT/'ui-qa.json').write_text(json.dumps(report,indent=2));browser.close()
server.shutdown()
