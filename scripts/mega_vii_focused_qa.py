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
  page.locator('[data-operational-slot]').evaluate('e=>e.scrollIntoView({block:"start"})') if page.locator('[data-operational-slot]').count() else None;page.wait_for_timeout(300);page.screenshot(path=str(OUT/(name+'.png')))
  r=page.evaluate('()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,mode:document.querySelector("main .tile-map")?.dataset.situationMode,text:document.querySelector("[data-operational-slot]")?.innerText})');report['screens'].append({'name':name,**r});(OUT/'focused-qa.json').write_text(json.dumps(report,indent=2));print(name,r['mode'],r['overflow'],flush=True)
 try:
  page.goto(ORIGIN+'/#/response-access?id=incident%3APT-2026-01F7E2E21A',wait_until='domcontentloaded');wait('()=>!!document.querySelector("[data-op-body]")');page.wait_for_timeout(1000);shot('final-current-support');click('picture');wait('()=>document.querySelector("main .tile-map")?.dataset.situationMode==="OPERATIONAL"');shot('final-operational-picture')
  section('replay');click('step');wait('()=>document.querySelector("main .tile-map")?.dataset.situationMode==="HISTORICAL"');shot('final-historical-picture')
  if not page.get_by_role('button',name='Hospital do Espírito Santo de Évora',exact=True).count():
   for n in range(18):
    click('step')
    if page.get_by_role('button',name='Hospital do Espírito Santo de Évora',exact=True).count():break
  print('global-map-rectangle',page.evaluate('()=>document.elementsFromPoint(600,130).map(e=>({tag:e.tagName,cls:e.className,rect:JSON.stringify(e.getBoundingClientRect()),bg:getComputedStyle(e).backgroundColor,before:getComputedStyle(e,"::before").content,after:getComputedStyle(e,"::after").content}))'),flush=True)
  print('map-rectangles',page.evaluate('()=>[...document.querySelectorAll("main .tile-map *")].filter(e=>{const r=e.getBoundingClientRect();return r.width>250&&r.height>30&&r.height<100}).map(e=>({tag:e.tagName,cls:e.className,bg:getComputedStyle(e).backgroundColor,text:e.textContent.slice(0,80)}))'),flush=True)
  qualified_index=page.locator('[data-op-time]').input_value()
  shot('final-qualified-historical-picture')
  assert page.get_by_role('button',name='Hospital do Espírito Santo de Évora',exact=True).count()
  page.locator('[data-action="op-road"][data-road="EM527"]').first.click();idle();shot('final-em527-lens')
  page.locator('[data-action="op-coverage"][data-category="emergency_hospital"]').first.click();idle();shot('final-healthcare-before')
  click('fail');wait('()=>document.querySelector("main .tile-map")?.dataset.situationMode==="SCENARIO"');shot('final-healthcare-failure')
  assert 'No retained' in page.locator('[data-operational-slot]').inner_text() or '0' in page.locator('[data-operational-slot]').inner_text()
  click('add');shot('final-add-failure');page.locator('[data-action="op-fail"][data-kind="FACILITY_UNAVAILABLE"]').first.click();idle();shot('final-multiple-failure');click('clear')
  section('communities');page.get_by_role('button',name='Louredo',exact=True).click();idle();click('network');shot('final-louredo-network')
  page.locator('[data-action="op-coverage"][data-category="fire_response"]').click();idle();assert 'Support for this community' in page.locator('[data-operational-slot]').inner_text();shot('final-fire-coverage')
  page.locator('[data-action="op-coverage"][data-category="designated_reception"]').click();idle();shot('final-reception-coverage')
  section('communities');click('limited');shot('final-limited-redundancy')
  section('replay');click('now');section('timeline');shot('final-causal-timeline')
  if page.locator('[data-action="op-change"]').count():
   click('change');shot('final-causal-after');click('before');shot('final-causal-before')
  section('replay');click('step');click('play');page.wait_for_timeout(2600)
  if page.locator('[data-action="op-pause"]').count():click('pause')
  shot('final-replay-paused');click('compare-now');shot('final-compare-now')
  page.locator('[data-op-time] + .vg-select button').click();page.locator('.vg-select-option[data-value="'+qualified_index+'"]').click();idle()
  section('stress');assert page.locator('[data-action="op-stress-result"]').count();shot('final-stress-test');click('stress-result');shot('final-stress-consequence');click('clear')
  section('gaps');shot('final-gaps')
  page.locator('#op-question').fill('What depends on EM527?');page.locator('.op-ask button').click();idle();shot('final-ask-road')
  page.locator('#op-question').fill('What if it closes?');page.locator('.op-ask button').click();idle();shot('final-ask-followup');assert page.locator('[data-situation-mode="SCENARIO"]').count()
  for width,height in [(1672,941),(1440,900),(1280,800),(1024,768),(768,1024),(430,932),(390,844),(320,568)]:
   page.set_viewport_size({'width':width,'height':height});shot('final-scenario-'+str(width));assert not report['screens'][-1]['overflow']
  page.set_viewport_size({'width':390,'height':844});page.locator('main .tile-map').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'final-mobile-map.png'))
  page.get_by_role('button',name='Return to current map',exact=True).click();idle();assert not page.locator('[data-situation-mode]').count();assert not page.locator('.op-assumption').count();report['checks'].append({'returnToCurrentClearsScenario':True})
  page.keyboard.press('Tab');report['checks'].append({'keyboardFocusedControl':page.evaluate('()=>document.activeElement?.tagName')})
 except Exception as ex:report['failure']=str(ex);shot('focused-failure');raise
 finally:(OUT/'focused-qa.json').write_text(json.dumps(report,indent=2));browser.close()
