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
  r=page.evaluate('()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,mode:document.querySelector("main .tile-map")?.dataset.situationMode,text:document.querySelector("[data-operational-slot]")?.innerText})');report['screens'].append({'name':name,**r});(OUT/'discovery-qa.json').write_text(json.dumps(report,indent=2));print(name,r['mode'],r['overflow'],flush=True)

 try:
  started=time.monotonic()
  page.goto(ORIGIN+'/#/response-access?id=incident%3APT-2026-01F7E2E21A',wait_until='domcontentloaded')
  wait('()=>!!document.querySelector("[data-op-body]")')
  body=page.locator('[data-operational-slot]').inner_text()
  checks={'qualifiedHospital':'Hospital do Espírito Santo de Évora' in body,'qualifiedFireResponse':'Bombeiros Voluntários de Évora' in body,'sharedRoad':'EM527' in body}
  if all(checks.values()):
   click('picture');page.locator('[data-action="op-road"][data-road="EM527"]').first.click();idle();click('fail')
   checks['scenarioConsequence']=page.locator('[data-situation-mode="SCENARIO"]').count()>0 and 'Support and access changes' in page.locator('[data-operational-slot]').inner_text()
   shot('fresh-road-consequence')
   click('clear');section('communities')
   page.get_by_role('button',name='Louredo',exact=True).click();idle()
   checks['communitySupport']='Support for this community' in page.locator('[data-operational-slot]').inner_text()
  report['discovery']={'secondsFromNavigation':round(time.monotonic()-started,2),'checks':checks,'allFive':len(checks)==5 and all(checks.values()),'independentHumanTest':False,'method':'Fresh session; visible primary controls only; scripted discoverability, not human comprehension'}
  report['discovery']['within30Seconds']=report['discovery']['allFive'] and report['discovery']['secondsFromNavigation']<=30
  shot('fresh-session-discovery')
 except Exception as ex:report['failure']=str(ex);raise
 finally:(OUT/'discovery-qa.json').write_text(json.dumps(report,indent=2));print(json.dumps(report.get('discovery')),flush=True);browser.close()
