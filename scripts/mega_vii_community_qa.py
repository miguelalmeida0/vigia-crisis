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
  r=page.evaluate('()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,mode:document.querySelector("main .tile-map")?.dataset.situationMode,text:document.querySelector("[data-operational-slot]")?.innerText})');report['screens'].append({'name':name,**r});(OUT/'community-qualified-qa.json').write_text(json.dumps(report,indent=2));print(name,r['mode'],r['overflow'],flush=True)

 try:
  page.goto(ORIGIN+'/#/response-access?id=incident%3APT-2026-01F7E2E21A',wait_until='domcontentloaded');wait('()=>!!document.querySelector("[data-op-body]")')
  section('replay')
  candidates=page.locator('[data-op-time] option').evaluate_all('options=>options.map(o=>({value:o.value,label:o.textContent}))')
  # Select an actual retained capture with a qualified community relationship.
  # This is evidence selection, not fresh-session discoverability or fixture injection.
  endpoint=ORIGIN+'/backend/api/v10/operator/incidents/incident%3APT-2026-01F7E2E21A/situation'
  times=context.request.get(endpoint+'/times',headers={'sec-fetch-site':'same-origin','origin':ORIGIN}).json()['times']
  ordered=sorted(times,key=lambda t:t['knownAt'])
  chosen=None
  for item in ordered[-30:][::-1]:
   r=context.request.get(endpoint+'/picture',params={'at':item['knownAt']},headers={'sec-fetch-site':'same-origin','origin':ORIGIN},timeout=30000)
   assert r.ok
   picture=r.json();community=next((c for c in picture['communities'] if c['name']=='Louredo'),None)
   if community and any(g['id']=='emergency_hospital' and g['primary'] for g in community['groups']):
    chosen=next((i for i,t in enumerate(ordered) if t['id']==item['id']),None);report['selectedKnownAt']=item['knownAt'];break
  assert chosen is not None,'No qualified Louredo healthcare relationship in the last 30 selectable captures'
  page.locator('[data-op-time] + .vg-select button').click();page.locator('.vg-select-option[data-value="'+str(chosen)+'"]').click();idle()
  section('communities');page.get_by_role('button',name='Louredo',exact=True).click();idle();click('network')
  assert 'Hospital do Espírito Santo de Évora' in page.locator('[data-op-body]').inner_text()
  shot('final-louredo-qualified')
  page.locator('[data-action="op-coverage"][data-category="emergency_hospital"]').first.click();idle();shot('final-community-healthcare')
  click('community-loss');assert page.locator('[data-situation-mode="SCENARIO"]').count();shot('final-community-access-loss')
  section('replay');click('now');section('timeline');shot('final-causal-timeline')
  if page.locator('[data-action="op-change"]').count():click('change');shot('final-causal-after');click('before');shot('final-causal-before')
 except Exception as ex:report['failure']=str(ex);raise
 finally:(OUT/'community-qualified-qa.json').write_text(json.dumps(report,indent=2));browser.close()
