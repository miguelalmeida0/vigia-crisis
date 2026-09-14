import {readFile,writeFile} from 'node:fs/promises';
const token=(await readFile('.tmp/release/operator-token','utf8')).trim();
const get=async path=>{const r=await fetch('http://127.0.0.1:4177'+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(90000)});return{status:r.status,data:await r.json()};};
const [readiness,quality]=await Promise.all([get('/ready'),get('/api/v10/operator/situation-quality')]);
const [events,registry]=await Promise.all([get('/api/v10/events'),get('/api/v10/sensors/registry')]);
const manifest=JSON.parse(await readFile('data/validation/release/current-release-manifest.json','utf8'));
const sources=Object.fromEntries(['firms','mtgPixels','sentinel3Pixels'].map(k=>[k,events.data.sources?.[k]??null]));
const state={capturedAt:new Date().toISOString(),releaseId:manifest.releaseId,codeStateHash:manifest.codeStateHash,readiness,model:quality.data.model,sourceFamilies:quality.data.sourceFamilies,sources,sensorAssets:registry.data};
await writeFile('docs/handoffs/mega-vii/final-state.json',JSON.stringify(state,null,2));console.log(JSON.stringify({releaseId:state.releaseId,ready:readiness.status,blocking:readiness.data.checks.filter(c=>!c.ok&&c.blocking).map(c=>c.id),model:state.model.state,sources:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,{state:v?.state,accepted:v?.accepted}]))}));
