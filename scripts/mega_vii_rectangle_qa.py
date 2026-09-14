from pathlib import Path
import json,time,hmac,hashlib,base64,secrets
from playwright.sync_api import sync_playwright
exec(Path('/workspace/scripts/mega_iii_iv_map_benchmark.py').read_text().split('results=[];network=[];errors=[]')[0])
OUT=Path('/output/mega-vii');OUT.mkdir(parents=True,exist_ok=True)
report={'lane':'REAL_RETAINED_HISTORICAL_AND_SCENARIO_BROWSER','screens':[],'errors':[],'checks':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1672,'height':941},locale='en-GB',timezone_id='UTC',reduced_motion='reduce')
 secret=(ROOT/'.tmp/release/operator-console-access-token').read_text().strip();now=int(time.time());enc=lambda d:base64.urlsafe_b64encode(d).decode().rstrip('=');payload=enc(json.dumps({'v':1,'aud':'vigia-operator-console','nonce':secrets.token_hex(24),'iat':now,'exp':now+60},separators=(',',':')).encode());token=payload+'.'+enc(hmac.new(secret.encode(),('operator-console-one-time-admission-v1\0'+payload).encode(),hashlib.sha256).digest())
 assert context.request.get(ORIGIN+'/?admission='+token,max_redirects=0).status==303
 page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
 def wait(predicate):
  end=time.monotonic()+40
  while time.monotonic()<end:
   if page.evaluate(predicate):return
   page.wait_for_timeout(100)
  raise AssertionError('Unmet UI condition: '+predicate)
 def idle():wait('()=>document.querySelector("[data-operational-slot]")?.getAttribute("aria-busy")==="false"')
 def click(cmd):page.locator('[data-action="op-'+cmd+'"]').first.click();idle();page.wait_for_timeout(200)
 def section(name):page.locator('[data-action="op-section"][data-section="'+name+'"]').click();idle()
 def shot(name):
  page.locator('[data-operational-slot]').evaluate('e=>e.scrollIntoView({block:"start"})');page.wait_for_timeout(300);page.screenshot(path=str(OUT/(name+'.png')))
  r=page.evaluate('()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,mode:document.querySelector("main .tile-map")?.dataset.situationMode,text:document.querySelector("[data-operational-slot]")?.innerText})');report['screens'].append({'name':name,**r});(OUT/'focused-qa.json').write_text(json.dumps(report,indent=2));print(name,r['mode'],r['overflow'],flush=True)
 try:
  page.goto(ORIGIN+'/#/response-access?id=incident%3APT-2026-01F7E2E21A',wait_until='domcontentloaded');wait('()=>!!document.querySelector("[data-op-body]")');page.wait_for_timeout(1000);shot('final-current-support')
  section('replay');click('step');wait('()=>document.querySelector("main .tile-map")?.dataset.situationMode==="HISTORICAL"');shot('final-historical-picture')
  if not page.get_by_role('button',name='Hospital do Espírito Santo de Évora',exact=True).count():
   for n in range(18):
    click('step')
    if page.get_by_role('button',name='Hospital do Espírito Santo de Évora',exact=True).count():break
  print('global-map-rectangle',page.evaluate('()=>document.elementsFromPoint(600,130).map(e=>({tag:e.tagName,cls:e.className,rect:JSON.stringify(e.getBoundingClientRect()),bg:getComputedStyle(e).backgroundColor,before:getComputedStyle(e,"::before").content,after:getComputedStyle(e,"::after").content}))'),flush=True)
  print('map-rectangles',page.evaluate('()=>[...document.querySelectorAll("main .tile-map *")].filter(e=>{const r=e.getBoundingClientRect();return r.width>250&&r.height>30&&r.height<100}).map(e=>({tag:e.tagName,cls:e.className,bg:getComputedStyle(e).backgroundColor,text:e.textContent.slice(0,80)}))'),flush=True)
  qualified_index=page.locator('[data-op-time]').input_value()
  shot('final-qualified-historical-picture')

  print('point',page.evaluate('()=>document.elementsFromPoint(600,130).map(e=>({tag:e.tagName,cls:e.className,rect:JSON.stringify(e.getBoundingClientRect()),bg:getComputedStyle(e).backgroundColor,before:getComputedStyle(e,"::before").content,after:getComputedStyle(e,"::after").content}))'),flush=True)
  page.screenshot(path=str(OUT/'rectangle-diagnostic.png'))
  page.add_style_tag(content='.op-layout>.field-primary{transform:translateZ(0)}');page.wait_for_timeout(500);page.screenshot(path=str(OUT/'rectangle-transform-diagnostic.png'))
  page.add_style_tag(content='.situation-map-mode{transform:translateZ(0)}');page.wait_for_timeout(500);page.screenshot(path=str(OUT/'rectangle-chip-diagnostic.png'))
 finally:browser.close()
