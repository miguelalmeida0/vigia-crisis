import json,time,urllib.request,urllib.error
from pathlib import Path
out=Path('docs/handoffs/mega-ii/model-cpu-retry.json')
rows=[]
stages=[('sentinel','Return only VIGIA_OK',None),('json','Return only JSON: {"status":"VIGIA_OK"}','json'),('portuguese','Extraia apenas o telefone presente: Hospital de Teste. Telefone: 239123456. Devolva JSON {"phone":"..."}.','json'),('tool','Use only this tool name: getQualifiedFacilities. User: Which hospital has a verified emergency department? Return JSON {"tool":"getQualifiedFacilities","type":"hospital","capability":"emergency_department"}.','json')]
for stage,prompt,fmt in stages:
    start=time.monotonic();payload={'model':'qwen3:0.6b','stream':False,'think':False,'keep_alive':0,'messages':[{'role':'user','content':prompt}],'options':{'num_gpu':0,'num_ctx':2048,'num_predict':80,'temperature':0}}
    if fmt:payload['format']=fmt
    try:
        req=urllib.request.Request('http://127.0.0.1:11434/api/chat',data=json.dumps(payload).encode(),headers={'content-type':'application/json'})
        with urllib.request.urlopen(req,timeout=35) as r:data=json.load(r)
        answer=data.get('message',{}).get('content','').strip();success=answer=='VIGIA_OK' if stage=='sentinel' else json.loads(answer)==({'status':'VIGIA_OK'} if stage=='json' else {'phone':'239123456'} if stage=='portuguese' else {'tool':'getQualifiedFacilities','type':'hospital','capability':'emergency_department'})
        row={'stage':stage,'success':success,'answer':answer,'evalCount':data.get('eval_count'),'durationNs':data.get('total_duration')}
    except Exception as e:
        detail=e.read().decode()[:2000] if isinstance(e,urllib.error.HTTPError) else str(e)
        row={'stage':stage,'success':False,'error':detail}
    row.update(model='qwen3:0.6b',cpuOnlyRequested=True,latencyMs=round((time.monotonic()-start)*1000));rows.append(row);out.write_text(json.dumps(rows,indent=2));print(json.dumps(row),flush=True)
    if not row['success']:break
