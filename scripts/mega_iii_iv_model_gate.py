"""Bounded installed-model qualification. Stop a candidate at its first failed sentinel."""
import json, os, subprocess, time
from pathlib import Path

out=Path('docs/handoffs/mega-iii-iv/model-gate.json')
rows=[]
for model,port in [('qwen3:0.6b',11434),('llama3.2:3b',11434),('qwen3.5:4b',11435)]:
    row={'model':model,'runtime':'Ollama','port':port,'requiredConsecutiveSentinels':20,'attempts':[],'ramBytes':None,'corpusState':'NOT_RUN'}
    for attempt in range(20):
        start=time.monotonic()
        try:
            p=subprocess.run(['ollama','run',model,'Return exactly VIGIA_OK and nothing else.'],env={**os.environ,'OLLAMA_HOST':f'127.0.0.1:{port}'},capture_output=True,text=True,timeout=25)
            record={'attempt':attempt+1,'success':p.returncode==0 and p.stdout.strip()=='VIGIA_OK','exitCode':p.returncode,'error':p.stderr[-2000:],'latencyMs':round((time.monotonic()-start)*1000)}
        except subprocess.TimeoutExpired:
            record={'attempt':attempt+1,'success':False,'error':'25-second sentinel deadline','latencyMs':round((time.monotonic()-start)*1000)}
        row['attempts'].append(record)
        if not record['success']:break
    row['state']='STARTUP_PASSED_REQUIRES_CORPUS' if len(row['attempts'])==20 and all(x['success'] for x in row['attempts']) else 'REJECTED_STARTUP'
    row['unexecutedSentinels']=20-len(row['attempts']);row['successPercent']=100*sum(x['success'] for x in row['attempts'])/len(row['attempts'])
    rows.append(row)
    out.write_text(json.dumps({'selectedModel':None,'fallback':'DETERMINISTIC_NO_PAID_INFERENCE','models':rows},indent=2))
    print(model,row['state'],len(row['attempts']),'attempts',flush=True)
    try:subprocess.run(['ollama','stop',model],env={**os.environ,'OLLAMA_HOST':f'127.0.0.1:{port}'},capture_output=True,timeout=10)
    except subprocess.TimeoutExpired:pass
