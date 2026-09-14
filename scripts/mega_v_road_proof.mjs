import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
import {RoadStateService} from '../apps/api/src/modules/intelligence/road-state-service.mjs';
import {roadObservationApplies,pointRouteDistanceM} from '../packages/domain/src/intelligence/road-observations.mjs';
import {buildSituation,compareSituations} from '../packages/domain/src/intelligence/situation-model.mjs';
import {SituationAsk} from '../apps/api/src/modules/intelligence/situation-ask.mjs';
import {SituationService} from '../apps/api/src/modules/intelligence/situation-service.mjs';
const pool=new Pool({connectionString:await resolveLocalDatabaseUrl()}),report={at:new Date().toISOString(),lane:'REAL_SOURCE_WITH_SEPARATE_CONTROLLED_ROUTE_PROOF',operationalWrites:0,attempts:[]};
try{
 const service=new RoadStateService({pool});await service.initialize();const context=service.context();report.coverage=context.roadCoverage;report.returned=context.roadReports.length;
 const pilots=JSON.parse(await readFile('docs/handoffs/mega-v/live-proof.json','utf8'));report.liveIntersections=[];
 for(const incident of pilots.incidents){const s=JSON.parse(await readFile('docs/handoffs/mega-v/situation-'+incident.id.split(':')[1]+'.json','utf8'));for(const route of s.routes)for(const r of context.roadReports)if(roadObservationApplies(r,route))report.liveIntersections.push({incident:s.incident,facility:s.facilities.find(f=>f.id===route.facilityId)?.canonicalName,routeId:route.id,observation:r});}
 const observations=context.roadReports.filter(r=>r.direction==='Ambos'&&r.providerActive&&Date.parse(r.validUntil)>Date.now()).sort((a,b)=>b.observedAt.localeCompare(a.observedAt));
 for(const r of observations.slice(0,4)){
  const p=r.geometry.coordinates,end=[p[0]+.007,p[1]+.005],url='https://router.project-osrm.org/route/v1/driving/'+p.join(',')+';'+end.join(',')+'?overview=full&geometries=geojson&steps=true';
  try{const response=await fetch(url,{signal:AbortSignal.timeout(15000)}),data=await response.json();if(!response.ok||data.code!=='Ok'||!data.routes?.[0])throw Error('routing_unavailable');const raw=data.routes[0],at=new Date().toISOString(),roads=raw.legs.flatMap(l=>l.steps).map(s=>({name:s.name,ref:s.ref??null})),route={id:'controlled-route',facilityId:'controlled-support',geometry:raw.geometry,roads,travelTimeMinutes:raw.duration/60,distanceKm:raw.distance/1000,direction:'FACILITY_TO_INCIDENT',calculatedAt:at,validUntil:new Date(Date.now()+300000).toISOString(),source:{provider:'OSRM public routing service',url}};
   const applies=roadObservationApplies(r,route),distanceM=pointRouteDistanceM(p,route.geometry);report.attempts.push({observation:r,route,applies,distanceM});if(!applies)continue;
   const input={incident:{id:'CONTROLLED_IP_MATCH',name:'Controlled route endpoints, not an operational incident',coordinate:end},facilities:[{id:'controlled-support',canonicalName:'Controlled support endpoint, not a real facility',canonicalType:'hospital',coordinate:p}],routes:[route],roadCoverage:context.roadCoverage};
   const before=buildSituation(input,{at,universe:'CONTROLLED_TEST'}),after=buildSituation({...input,roadReports:[r]},{at,universe:'CONTROLLED_TEST'}),diff=compareSituations(before,after);after.changes=diff.material;after.impactChains=diff.material.map(c=>({id:c.id,steps:[c],dependencies:c.dependencies}));
   const memory={latest:async()=>after,recentChanges:async()=>after.changes},situation=new SituationService({store:memory,clock:()=>new Date(at)}),ask=new SituationAsk(situation),actor={id:'controlled-proof',role:'administrator',incidentScopes:['CONTROLLED_IP_MATCH']};
   report.controlled={explicitBoundary:'Official current occurrence and real OSRM route; deliberately chosen endpoints and synthetic relation exist only in this report, never in operational storage.',before:before.routes[0],after:after.routes[0],diff,brief:await situation.briefing('CONTROLLED_IP_MATCH'),ask:await ask.answer(actor,{incidentId:'CONTROLLED_IP_MATCH',entityId:'controlled-support',question:'Are any restrictions affecting that route?'})};break;
  }catch(e){report.attempts.push({observationId:r.id,error:e.message});}
 }
 report.acceptance=report.controlled?.after?.state==='AFFECTED_BY_RESTRICTION'?'SOURCE_BACKED_CONTROLLED_CHAIN_PASSED':'NO_MATCH_RETURNED';
}finally{await pool.end();await writeFile('docs/handoffs/mega-v/road-proof.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({acceptance:report.acceptance,liveIntersections:report.liveIntersections?.length,returned:report.returned,attempts:report.attempts.length}));
