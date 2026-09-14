from pathlib import Path
import json,time,hmac,hashlib,base64,secrets
from playwright.sync_api import sync_playwright
exec(Path('/workspace/scripts/mega_iii_iv_map_benchmark.py').read_text().split('results=[];network=[];errors=[]')[0])
OUT=Path('/output/mega-vii');OUT.mkdir(parents=True,exist_ok=True)
report={'lane':'CANONICAL_RENDERED_UI','screens':[],'errors':[],'checks':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1672,'height':941},device_scale_factor=1,locale='en-GB',timezone_id='UTC',reduced_motion='reduce')
 secret=(ROOT/'.tmp/release/operator-console-access-token').read_text().strip();now=int(time.time());enc=lambda d:base64.urlsafe_b64encode(d).decode().rstrip('=');payload=enc(json.dumps({'v':1,'aud':'vigia-operator-console','nonce':secrets.token_hex(24),'iat':now,'exp':now+60},separators=(',',':')).encode());token=payload+'.'+enc(hmac.new(secret.encode(),('operator-console-one-time-admission-v1\0'+payload).encode(),hashlib.sha256).digest())
 assert context.request.get(ORIGIN+'/?admission='+token,max_redirects=0).status==303
 page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
 def save(): (OUT/'ui-qa.json').write_text(json.dumps(report,indent=2))
 def shot(name):
  page.screenshot(path=str(OUT/(name+'.png')),full_page=False)
  row=page.evaluate('()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,mode:document.querySelector("main .tile-map")?.dataset.situationMode,body:document.querySelector("[data-operational-slot]")?.innerText.slice(0,1800)})')
  report['screens'].append({'name':name,**row});save();print(name,row.get('mode'),row['overflow'],flush=True)
 def wait():
  page.wait_for_selector('[data-op-body]',timeout=60000)
 def idle():
  end=time.monotonic()+25
  while time.monotonic()<end:
   if page.evaluate('()=>document.querySelector("[data-operational-slot]")?.getAttribute("aria-busy")!=="true"'):return
   page.wait_for_timeout(100)
  raise AssertionError('Operational action did not settle')
 def click(cmd):
  page.locator('[data-action="op-'+cmd+'"]').first.click();idle();page.wait_for_timeout(250)
 try:
  page.goto(ORIGIN+'/#/response-access?id=incident%3APT-2026-01F7E2E21A',wait_until='domcontentloaded');wait();page.wait_for_timeout(1500);shot('support-entry')
  start=time.monotonic();click('picture');page.wait_for_selector('[data-situation-mode="OPERATIONAL"]',timeout=15000);shot('operational-picture')
  roads=page.locator('[data-action="op-road"][data-road="EM527"]')
  if roads.count():
   roads.first.click();idle();page.wait_for_timeout(300);shot('road-em527');click('fail');page.wait_for_selector('[data-situation-mode="SCENARIO"]',timeout=20000);shot('road-failure')
   report['checks'].append({'scriptedDiscoverySeconds':round(time.monotonic()-start,2),'humanTest':False});click('add');shot('add-failure')
   fs=page.locator('[data-action="op-fail"][data-kind="FACILITY_UNAVAILABLE"]')
   if fs.count():fs.first.click();idle();page.wait_for_timeout(300);shot('multiple-failure')
   click('clear')
  page.locator('[data-action="op-section"][data-section="communities"]').click();idle();page.wait_for_timeout(300);shot('communities')
  louredo=page.get_by_role('button',name='Louredo',exact=True)
  if louredo.count():louredo.click();idle();page.wait_for_timeout(300);shot('louredo')
  page.locator('[data-action="op-coverage"][data-category="emergency_hospital"]').first.click();idle();page.wait_for_timeout(300);shot('healthcare-coverage')
  page.locator('[data-action="op-section"][data-section="communities"]').click();page.wait_for_timeout(1000);click('limited');shot('limited-redundancy')
  page.locator('[data-action="op-section"][data-section="gaps"]').click();page.wait_for_timeout(500);shot('gaps')
  page.locator('[data-action="op-section"][data-section="timeline"]').click();page.wait_for_timeout(1500);shot('causal-timeline')
  if page.locator('[data-action="op-change"]').count():click('change');shot('causal-map');click('before');shot('causal-before')
  page.locator('[data-action="op-section"][data-section="replay"]').click();idle();page.wait_for_timeout(300);shot('replay-controls')
  if page.locator('[data-action="op-step"]').count():
   click('step');page.wait_for_selector('[data-situation-mode="HISTORICAL"]',timeout=20000);shot('replay-frame');click('play');page.wait_for_timeout(2500)
   if page.locator('[data-action="op-pause"]').count():click('pause')
   click('compare-now');idle();page.wait_for_timeout(300);shot('replay-compare');click('now')
  page.locator('[data-action="op-section"][data-section="stress"]').click();page.wait_for_timeout(2000);shot('stress-test')
  page.locator('#op-question').fill('What depends on EM527?');page.locator('.op-ask button').click();page.wait_for_timeout(1500);shot('ask-map')
  for w,h in [(1672,941),(1440,900),(1280,800),(1024,768),(768,1024),(430,932),(390,844),(320,568)]:
   page.set_viewport_size({'width':w,'height':h});page.locator('[data-operational-slot]').scroll_into_view_if_needed();shot('operational-'+str(w))
  page.set_viewport_size({'width':390,'height':844});page.locator('[data-action="op-section"][data-section="support"]').click();page.wait_for_timeout(1000);shot('mobile-support')
  for route in ['command-overview','incidents','incident-detail','fire-activity','national-awareness']:
   page.goto(ORIGIN+'/#/'+route+'?id=incident%3APT-2026-01F7E2E21A',wait_until='domcontentloaded');page.wait_for_selector('main .tile-map',state='attached',timeout=30000);page.wait_for_timeout(1500);shot(route+'-mobile')
 except Exception as error:
  report['failure']=str(error);shot('failure');raise
 finally:save();browser.close()
