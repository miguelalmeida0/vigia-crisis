"""Run isolated local startup gates. No VIGIA request or operational fact writes."""
import json, os, subprocess, time, urllib.request, urllib.error
from pathlib import Path

OUT=Path('docs/handoffs/mega-vii'); TMP=Path('.tmp/mega-vii')
TMP.mkdir(parents=True,exist_ok=True)
report={'lane':'ACTUAL_LOCAL_RUNTIME_OUTSIDE_VIGIA','startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'diagnostics':{},'attempts':[],'selectedModel':None,'corpusState':'NOT_RUN_STARTUP_GATE_REQUIRED','mandatoryMonthlyCostEUR':0}
def save(): (OUT/'model-runtime.json').write_text(json.dumps(report,indent=2))
def command(args):
 try:
  p=subprocess.run(args,capture_output=True,text=True,timeout=8);return {'exitCode':p.returncode,'stdout':p.stdout[-6000:],'stderr':p.stderr[-1500:]}
 except Exception as e:return {'error':str(e)}
def request(port,path,payload=None,timeout=25):
 req=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=json.dumps(payload).encode() if payload is not None else None,headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=timeout) as response:return json.load(response)
 except urllib.error.HTTPError as e:raise RuntimeError(e.read().decode()[:2000])
for key,args in {'version':['ollama','--version'],'architecture':['uname','-m'],'memory':['memory_pressure'],'hardwareMemory':['sysctl','hw.memsize'],'processOwnership':['lsof','-nP','-iTCP:11434','-iTCP:11435','-sTCP:LISTEN'],'processList':['ps','-axo','pid,ppid,user,comm']}.items():report['diagnostics'][key]=command(args)
for port in [11434,11435]:
 for endpoint in ['version','ps','tags']:
  try:
   value=request(port,'/api/'+endpoint,timeout=3)
   if endpoint=='tags':value={'models':[{k:m.get(k) for k in ['name','size','digest']} for m in value.get('models',[])]}
   report['diagnostics'][str(port)+'/'+endpoint]=value
  except Exception as e:report['diagnostics'][str(port)+'/'+endpoint]={'error':str(e)}
report['diagnostics']['environment']={k:os.environ.get(k) for k in ['OLLAMA_HOST','OLLAMA_MODELS','OLLAMA_LLM_LIBRARY','OLLAMA_CONTEXT_LENGTH','OLLAMA_NUM_PARALLEL']}
save()
report['diagnostics']['mlxNative']=command(['python3','-c','import importlib.util; print("mlx_lm_installed",importlib.util.find_spec("mlx_lm") is not None); import mlx.core as mx; mx.eval(mx.ones((4,))); print("MLX_ALLOCATION_OK")']);save()
base=Path('/Users/malmeida/.ollama/models')
def sentinel(port,model,kind):
 row={'model':model,'runtime':kind,'requiredConsecutive':50,'attempts':[]}
 report['attempts'].append(row)
 for i in range(50):
  start=time.monotonic()
  try:
   if kind=='clean-ollama':
    data=request(port,'/api/chat',{'model':model,'stream':False,'think':False,'keep_alive':'2m','options':{'num_gpu':-1,'num_ctx':512,'num_predict':20,'temperature':0},'messages':[{'role':'user','content':'Reply with exactly VIGIA_OK. No other text.'}]})
    answer=data.get('message',{}).get('content','').strip()
   else:
    data=request(port,'/v1/chat/completions',{'model':model,'stream':False,'temperature':0,'max_tokens':20,'chat_template_kwargs':{'enable_thinking':False},'messages':[{'role':'user','content':'Reply with exactly VIGIA_OK. No other text.'}]})
    answer=data['choices'][0]['message']['content'].strip()
   item={'success':answer=='VIGIA_OK','answer':answer,'latencyMs':round((time.monotonic()-start)*1000)}
  except Exception as e:item={'success':False,'error':str(e),'latencyMs':round((time.monotonic()-start)*1000)}
  row['attempts'].append(item);save()
  if not item['success']:break
 row['passed']=len(row['attempts'])==50 and all(x['success'] for x in row['attempts']);save();print(kind,model,'PASS' if row['passed'] else 'FAIL',flush=True)
 return row['passed']
def wait_health(port,path):
 for i in range(60):
  try:request(port,path,timeout=1);return True
  except Exception:time.sleep(.25)
 return False
runner='/opt/homebrew/Cellar/ollama/0.30.7_1/libexec/lib/ollama/llama-server'
for model in ['llama3.2:3b']:
 name,tag=model.split(':');manifest=json.loads((base/'manifests/registry.ollama.ai/library'/name/tag).read_text());layer=next(x for x in manifest['layers'] if x['mediaType']=='application/vnd.ollama.image.model');weights=base/'blobs'/layer['digest'].replace(':','-')
 with (TMP/(name+'-native-cpu.log')).open('w') as log:
  args=[runner,'--model',str(weights),'--host','127.0.0.1','--port','11437','--ctx-size','2048','--parallel','1','--threads','4','--device','none','--n-gpu-layers','0','--no-op-offload','--fit','off','--no-warmup']
  server=subprocess.Popen(args,stdout=log,stderr=log)
  try:
   if wait_health(11437,'/health'):
    passed=sentinel(11437,model,'native-cpu')
    if passed and model=='llama3.2:3b':
     report['corpusState']='READY_FOR_ACTUAL_CORPUS';save()
     subprocess.run(['node','scripts/mega_vii_model_corpus.mjs'],env={**os.environ,'VIGIA_EVAL_LOCAL_PORT':'11437','VIGIA_EVAL_LOCAL_MODEL':model},check=False,timeout=700)
     corpus=json.loads((OUT/'model-corpus.json').read_text());report['corpusState']=corpus.get('selectionState','CORPUS_INCOMPLETE');report['selectedModel']=model if corpus.get('qualified') else None;save()
   else:report['attempts'].append({'model':model,'runtime':'native-cpu','passed':False,'error':'RUNNER_STARTUP_FAILED','attempts':[]});save()
  finally:
   server.terminate()
   try:server.wait(timeout=8)
   except subprocess.TimeoutExpired:server.kill();server.wait()
report['completedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());save()
