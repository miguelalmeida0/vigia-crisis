import subprocess, time, json, os
from pathlib import Path

out = Path('docs/handoffs/mega-ii/model-smoke.json')
results = []
for model, port in [('qwen3:0.6b',11434),('llama3.2:3b',11434),('qwen3.5:4b',11435)]:
    start = time.monotonic()
    try:
        p = subprocess.run(['ollama','run',model,'Return only VIGIA_OK'],env={**os.environ,'OLLAMA_HOST':f'127.0.0.1:{port}'},capture_output=True,text=True,timeout=30)
        row = {'model':model,'port':port,'exitCode':p.returncode,'answer':p.stdout.strip(),'error':p.stderr[-2500:],'success':p.returncode==0 and p.stdout.strip()=='VIGIA_OK'}
    except subprocess.TimeoutExpired:
        row = {'model':model,'port':port,'success':False,'error':'30 second direct CLI timeout','exitCode':None}
    row['latencyMs'] = round((time.monotonic()-start)*1000)
    results.append(row)
    out.write_text(json.dumps(results,indent=2))
    print(json.dumps({k:v for k,v in row.items() if k not in ['error','answer']}),flush=True)
    subprocess.run(['ollama','stop',model],env={**os.environ,'OLLAMA_HOST':f'127.0.0.1:{port}'},capture_output=True,timeout=10)
