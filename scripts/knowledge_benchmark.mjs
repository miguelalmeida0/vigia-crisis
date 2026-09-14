import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import pg from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
import {WorldKnowledgeStore} from '../apps/api/src/modules/intelligence/world-knowledge-store.mjs';
import {WorldKnowledgeService} from '../apps/api/src/modules/intelligence/world-knowledge-service.mjs';
import {FacilityDetail} from '../apps/operator-console/src/approved/ui/facility-detail.js';

const pool=new pg.Pool({connectionString:await resolveLocalDatabaseUrl(),max:2});
try{
 const service=new WorldKnowledgeService({store:new WorldKnowledgeStore({pool}),model:{extract(){throw Error('No inference on reads');},health:async()=>({state:'offline'})}}),start=performance.now();await service.initialize();const initializationMs=performance.now()-start;
 const measures={};async function measure(name,n,run){const ms=[];for(let i=0;i<n;i++){const at=performance.now();await run();ms.push(performance.now()-at);}ms.sort((a,b)=>a-b);measures[name]={samples:n,p50Ms:Number(ms[Math.floor(n*.5)].toFixed(2)),p95Ms:Number(ms[Math.min(n-1,Math.floor(n*.95))].toFixed(2)),maxMs:Number(ms.at(-1).toFixed(2))};}
 const facility={id:'osm:node:6233153426',kind:'POLICE',coordinate:[-7.909,38.576],distanceKm:1};
 await measure('decorateAndRenderStoredFacility',100,()=>FacilityDetail(service.decorate(facility)));
 await measure('postgisNearestFacilities',20,()=>service.query({question:'findFacilities',coordinate:[-7.908,38.571],limit:20}));
 await measure('canonicalEntityWithProvenance',20,()=>service.entity(facility.id));
 const state=await service.store.read(),output={at:new Date().toISOString(),environment:'Local PostgreSQL/PostGIS; real stored directory and pilot; no inference',initializationMs:Number(initializationMs.toFixed(2)),entities:state.entities.filter(e=>!e.redirectTo).length,facts:state.facts.length,documents:state.documents.length,modelCalls:0,measures,limitation:'Warm local pilot-size measurements; not a national-scale throughput or tail-latency guarantee.'};
 await writeFile('docs/handoffs/mega-intelligence/performance.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
}finally{await pool.end();}
