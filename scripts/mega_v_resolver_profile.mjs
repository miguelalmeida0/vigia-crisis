import {Pool} from 'pg';import {writeFile} from 'node:fs/promises';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
import {resolveEntity} from '../packages/domain/src/intelligence/world-knowledge.mjs';
const pool=new Pool({connectionString:await resolveLocalDatabaseUrl()});
try{
 const entities=(await pool.query('SELECT payload FROM world_knowledge_entity')).rows.map(r=>r.payload),raws=entities.filter(e=>!e.redirectTo&&e.fields?.canonicalName?.authority==='OSM'),candidates=entities.filter(e=>!e.redirectTo&&['OWNER','GOVERNMENT','MUNICIPAL'].includes(e.fields?.canonicalName?.authority));
 const run=raw=>resolveEntity({name:raw.canonicalName,coordinate:raw.location?.geometry?.coordinates,phone:raw.contact?.phone,municipality:raw.address?.municipality,street:raw.address?.street,postcode:raw.address?.postcode,externalIds:raw.externalIds},candidates.filter(c=>c.id!==raw.id));
 let t=performance.now();const results=raws.map(run),wholeMs=performance.now()-t;t=performance.now();const single=raws[0]?run(raws[0]):null,singleMs=performance.now()-t;
 const result={lane:'READ_ONLY_REAL_RETAINED_ENTITY_RESOLUTION_CPU',operationalWrites:0,rawEntities:raws.length,authorityCandidates:candidates.length,wholeMs,singleMs,singleMatchesFullResult:JSON.stringify(single)===JSON.stringify(results[0]),note:'Profiles the current per-enrichment global entity-resolution path versus exactly the selected entity. Excludes database write time.'};
 await writeFile('docs/handoffs/mega-v/resolver-profile.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await pool.end();}
