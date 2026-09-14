import {readFile,writeFile} from 'node:fs/promises';
const token=(await readFile('.tmp/release/operator-token','utf8')).trim(),root='docs/handoffs/mega-vii',base='/api/v10/operator/incidents/incident%3APT-2026-01F7E2E21A/situation';
const report={capturedAt:new Date().toISOString(),lane:'REAL_RETAINED_AND_ISOLATED_SCENARIO',requests:[]};
async function get(part,params={}){const start=performance.now(),r=await fetch('http://127.0.0.1:4177'+base+(part?'/'+part:'')+'?'+new URLSearchParams(params),{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)}),text=await r.text(),data=JSON.parse(text);report.requests.push({part,status:r.status,ms:Math.round(performance.now()-start),bytes:text.length});await save();return data;}
const save=()=>writeFile(root+'/live-proof.json',JSON.stringify(report,null,2));
report.picture=await get('picture');
const road=report.picture.support?.corridors.find(c=>c.road==='EM527')?.road,facility=report.picture.support?.groups.find(g=>g.id==='emergency_hospital')?.primary?.facilityId;
if(road){report.road=await get('picture',{road});const failures=[{kind:'ROAD_UNAVAILABLE',entityId:road}];report.failure=await get('picture',{failures:JSON.stringify(failures),category:'emergency_hospital'});if(facility){failures.push({kind:'FACILITY_UNAVAILABLE',entityId:facility});report.multiple=await get('picture',{failures:JSON.stringify(failures)});}report.ask=await get('ask',{question:'What depends on '+road+'?'});}
const community=report.picture.communities?.find(c=>c.name==='Louredo');if(community)report.community=await get('picture',{communityId:community.id});
report.stress=await get('stress');report.times=await get('times');report.causal=await get('tool/getCausalTimeline');
if(report.times.times?.length>1){const from=report.times.times.at(-1).knownAt,to=report.times.times[0].knownAt;report.historical=await get('picture',{at:from});report.comparison=await get('compare',{from,to});}
report.singleHospital=await get('ask',{question:'Show communities with only one retained hospital option.'});
await save();console.log(JSON.stringify({requests:report.requests,scenarios:report.failure?.operationalWrites,communities:report.picture.communities?.length}));
