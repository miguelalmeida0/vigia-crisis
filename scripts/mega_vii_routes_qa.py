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
 def save(): (OUT/'routes-qa.json').write_text(json.dumps(report,indent=2))
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
  for width,height in [(1672,941),(390,844)]:
   page.set_viewport_size({'width':width,'height':height})
   for route in ['command-overview','incidents','incident-detail','fire-activity','response-access','national-awareness']:
    page.goto(ORIGIN+'/#/'+route+'?id=incident%3APT-2026-01F7E2E21A',wait_until='domcontentloaded')
    page.wait_for_selector('main .tile-map',state='attached',timeout=45000)
    end=time.monotonic()+25
    while time.monotonic()<end:
     if page.evaluate('()=>!!document.querySelector("main .tile-map")?.dataset.mapFirstUsefulFrame'):break
     page.wait_for_timeout(100)
    page.wait_for_timeout(1000)
    shot(route+'-'+str(width))
    if route=='incident-detail' and width==1672:
     page.locator('[data-action="operational-picture"]').first.click();idle();page.wait_for_selector('[data-situation-mode="OPERATIONAL"]',timeout=15000);shot('detail-operational-picture')
  assert not any(s['overflow'] for s in report['screens'])
 except Exception as error:report['failure']=str(error);raise
 finally:save();browser.close()
