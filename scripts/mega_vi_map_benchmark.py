from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from http.cookies import SimpleCookie
import threading,urllib.request,urllib.error,json,hmac,hashlib,base64,secrets,time,os,math
from playwright.sync_api import sync_playwright
ROOT=Path('/workspace');OUT=Path('/output/mega-vi');OUT.mkdir(parents=True,exist_ok=True)
LANE=os.environ.get('LANE','before');ORIGIN='http://127.0.0.1:4190'
# A transparent local forwarding hop permits actual browser HTTP caching. Playwright
# request interception disables that cache and is deliberately not used here.
class Proxy(BaseHTTPRequestHandler):
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
 def forward(self):
  headers={k:v for k,v in self.headers.items() if k.lower() not in ['host','connection','accept-encoding']};headers['Host']='127.0.0.1:4190'
  body=self.rfile.read(int(self.headers.get('content-length',0))) or None
  req=urllib.request.Request('http://host.docker.internal:4190'+self.path,data=body,headers=headers,method=self.command)
  class NoRedirect(urllib.request.HTTPRedirectHandler):
   def redirect_request(self,*args):return None
  try:
   try:r=urllib.request.build_opener(NoRedirect).open(req,timeout=45)
   except urllib.error.HTTPError as e:r=e
   data=r.read();self.send_response(r.code)
   for k,v in r.headers.items():
    if k.lower() not in ['transfer-encoding','connection','content-length','content-encoding']:self.send_header(k,v)
   self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
  except Exception:
   try:self.send_error(502)
   except Exception:pass
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',4190),Proxy);threading.Thread(target=server.serve_forever,daemon=True).start()
HOOK="""async()=>{
 window.__bench=window.__bench||{events:[],seen:new WeakSet(),gl:null,longTasks:[]};const b=window.__bench;
 new PerformanceObserver(list=>b.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
 const now=()=>performance.now(),mark=(name,extra={})=>b.events.push({name,at:now(),...extra});
 b.mark=mark;b.timer=setInterval(async()=>{const el=document.querySelector('main .tile-map');if(!el)return;
 if(!el.__seenBench){el.__seenBench=true;mark('containerMounted',{instance:el.dataset.mapInstanceId});}
 if(!b.vendorHook){b.vendorHook=true;const mod=await import('/assets/vendor/maplibre-gl/maplibre-gl.mjs'),original=mod.Map.prototype.fire;mod.Map.prototype.fire=function(...args){if(this.getContainer?.()?.matches('.tile-map__gl'))b.gl=this;return original.apply(this,args);};}
 const instance={gl:b.gl};if(!instance.gl)return;
 if(b.seen.has(instance.gl))return;b.seen.add(instance.gl);const gl=instance.gl;mark('instanceObserved',{id:el.dataset.mapInstanceId});
 const ready={imagery:false};gl.on('sourcedata',e=>{if(e.sourceId==='vigia-imagery'&&e.sourceDataType==='content'&&e.tile?.state==='loaded'){if(!ready.imagery)mark('firstBasemapTile');ready.imagery=true;}
 if(e.sourceId==='vigia-labels'&&e.isSourceLoaded)mark('labelsReady');if(e.sourceId==='vigia-operational'&&e.isSourceLoaded)mark('overlaysReady');});
 gl.on('render',()=>{if(ready.imagery&&!ready.frame){ready.frame=true;mark('firstUsefulFrame');}if(document.querySelector('main')?.contains(gl.getContainer())){b.lastRender=now();b.lastRenderId=el.dataset.mapInstanceId;}});gl.on('load',()=>mark('interactive'));
 },10);return true;
}"""
results=[];network=[];errors=[];failed=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 for cold in range(int(os.environ.get('COLD_SAMPLES','3'))):
  context=browser.new_context(viewport={'width':1728,'height':966},device_scale_factor=1,locale='en-GB',timezone_id='UTC',reduced_motion='reduce')
  secret=(ROOT/'.tmp/release/operator-console-access-token').read_text().strip();now=int(time.time());enc=lambda d:base64.urlsafe_b64encode(d).decode().rstrip('=');payload=enc(json.dumps({'v':1,'aud':'vigia-operator-console','nonce':secrets.token_hex(24),'iat':now,'exp':now+60},separators=(',',':')).encode());token=payload+'.'+enc(hmac.new(secret.encode(),('operator-console-one-time-admission-v1\0'+payload).encode(),hashlib.sha256).digest())
  response=context.request.get(ORIGIN+'/?admission='+token,max_redirects=0);assert response.status==303,response.status
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));cdp=context.new_cdp_session(page);cdp.send('Network.enable');requests={}
  cdp.on('Network.responseReceived',lambda e:requests.get(e['requestId'],{}).update(status=e['response']['status'],serverTiming=e['response']['headers'].get('server-timing'),protocol=e['response'].get('protocol')))
  cdp.on('Network.requestWillBeSent',lambda e:requests.update({e['requestId']:{'url':e['request']['url'],'start':time.monotonic(),'bytes':0}}))
  def loaded(e):
   r=requests.get(e['requestId']);
   if r:r.update(bytes=e.get('encodedDataLength',0),finished=time.monotonic());network.append(dict(r))
  cdp.on('Network.loadingFinished',loaded)
  cdp.on('Network.loadingFailed',lambda e:failed.append({'id':e['requestId'],'url':requests.get(e['requestId'],{}).get('url'),'reason':e.get('errorText'),'cancelled':e.get('canceled',False)}))
  page.add_init_script("window.addEventListener('DOMContentLoaded',()=>{("+HOOK+")()});")
  sequence=[('cold','incident-detail'),('detail-to-fire','fire-activity'),('fire-to-response','response-access'),('response-to-detail','incident-detail'),('cached-revisit','fire-activity'),('incident-switch','incident-detail'),('overview','command-overview'),('national','national-awareness')]
  for label,route in sequence:
   incident='incident%3APT-2026-01F7E2E21A' if label!='incident-switch' else 'incident%3APT-2026-08D08E2A0D'
   target='#/'+route+('' if route in ['command-overview','national-awareness'] else '?id='+incident)
   t=time.monotonic();n=len(network)
   if label=='cold':page.goto(ORIGIN+'/'+target,wait_until='domcontentloaded');start=0
   else:
    start=page.evaluate('()=>performance.now()');page.evaluate('(hash)=>{window.__bench.events=[];window.__bench.navigation=performance.now();location.hash=hash}',target)
   deadline=time.monotonic()+35;useful=None;container=None;instance=None;interactive=None
   while time.monotonic()<deadline:
    snap=page.evaluate("""()=>{const el=document.querySelector('main .tile-map'),b=window.__bench;return{now:performance.now(),hash:location.hash,el:el?{...el.dataset}:null,events:b?.events??[],render:b?.lastRenderId===el?.dataset.mapInstanceId?b.lastRender:null,loaded:b?.gl?.getContainer()?.closest('.tile-map')===el&&b?.gl?.isSourceLoaded('vigia-imagery'),style:b?.gl?.isStyleLoaded(),layers:b?.gl?.getStyle()?.layers?.length,features:b?.gl?.getSource('vigia-operational')?._data?.features?.length,runtime:window.__VIGIA_MAP_RUNTIME__,projection:document.querySelector('main')?.dataset.routeProjectionState}}""")
    if snap['el']:
     if container is None:container=snap['now']-start
     instance=snap['el'].get('mapInstanceId')
     frames=[e for e in snap['events'] if e['name']=='firstUsefulFrame' and e['at']>=start]
     # A retained loaded renderer must render after navigation; no old readiness timestamp counts.
     if useful is None and label=='cold' and snap['el'].get('mapFirstUsefulFrame'):useful=float(snap['el']['mapFirstUsefulFrame'])
     if useful is None and (frames or (snap['loaded'] and (snap.get('render') or 0)>start)):useful=(frames[0]['at'] if frames else snap['render'])-start
     if useful is not None and snap['style'] and snap['projection'] in ['READY','STALE','DEGRADED']:interactive=snap['now']-start;break
    page.wait_for_timeout(25)
   page.wait_for_timeout(250);req=network[n:];result={'sample':cold,'case':label,'firstUsefulFrameMs':useful,'containerMountedMs':container,'interactiveMs':interactive,'instanceId':instance,'requests':len(req),'bytes':sum(r['bytes'] for r in req),'tiles':sum('/basemap/' in r['url'] for r in req),'apiCalls':sum('/api/' in r['url'] and '/basemap/' not in r['url'] for r in req),'postgisCalls':None,'postgisCountNote':'No per-browser SQL tracing in baseline; separate EXPLAIN/latency evidence','layerCount':snap.get('layers'),'featureCount':snap.get('features'),'events':snap.get('events'),'runtime':snap.get('runtime'),'mapState':snap.get('el'),'network':req}
   result['mainThread']=page.evaluate('(start)=>window.__bench.longTasks.filter(e=>e.start>=start)',start)
   result['waterfall']=page.evaluate('(start)=>performance.getEntriesByType("resource").filter(e=>e.startTime>=start).map(e=>({url:e.name,start:e.startTime,duration:e.duration,ttfb:e.responseStart-e.requestStart,download:e.responseEnd-e.responseStart,bytes:e.transferSize,type:e.initiatorType}))',start)
   results.append(result);(OUT/(LANE+'-map.json')).write_text(json.dumps({'browser':browser.version,'cache':'enabled; transparent forwarding hop','viewport':[1728,966],'results':results,'errors':errors,'failedRequests':failed},indent=2));print(label,round(useful or -1),instance,len(req),flush=True)
  context.close()
 browser.close()
server.shutdown()
