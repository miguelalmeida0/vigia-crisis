import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
import {WorldKnowledgeStore} from '../apps/api/src/modules/intelligence/world-knowledge-store.mjs';
import {WorldKnowledgeService} from '../apps/api/src/modules/intelligence/world-knowledge-service.mjs';
const dir='data/reference/facility-intelligence/acceleration/',review=JSON.parse(await readFile(dir+'directory-review.json','utf8'));
const pool=new pg.Pool({connectionString:await resolveLocalDatabaseUrl(),max:2});
try{
 const service=new WorldKnowledgeService({store:new WorldKnowledgeStore({pool})});await service.initialize();const results=[];
 for(const {source,records,error} of review.sources){if(error||!records.length||(process.env.SOURCE_ADAPTER&&source.adapter!==process.env.SOURCE_ADAPTER))continue;const result=await service.ingest(await readFile(dir+source.file),source,{reviewed:source.reviewed===true});results.push({source:source.url,state:result.state,accepted:result.accepted,rejected:result.rejected});console.log(source.file,result.state,result.accepted,result.rejected?.length??0);}
 await service.resolveKnownEntities();
 const original=JSON.parse(await readFile('data/reference/facility-intelligence/pilot-review.json','utf8')).pilot;
 const records=[...original.map(p=>({...p.raw,cohort:'ORIGINAL_113'})),...review.sources.flatMap(s=>s.records.map(r=>({...r,cohort:'AUTHORITY_DIRECTORY'})))];
 const seen=new Set(),pilot=[];for(const raw of records){const entity=await service.entity(raw.id);if(seen.has(entity?.id)&&raw.cohort!=='ORIGINAL_113')continue;if(entity)seen.add(entity.id);pilot.push({raw,entity,review:{method:'DETERMINISTIC_PUBLISHED_RECORD_AND_FIELD_PASSAGE',physicallyVerified:false,independentReview:false}});}
 const fields=['canonicalType','address.street','contact.phone','contact.website','operator'];
 const coverage=rows=>Object.fromEntries(fields.map(k=>{const n=rows.filter(r=>r.entity?.fields[k]?.value!=null).length;return[k,{count:n,total:rows.length,percent:Math.round(n/rows.length*10000)/100}]}));
 const metrics={total:pilot.length,originalRetained:pilot.filter(p=>p.raw.cohort==='ORIGINAL_113').length,coverage:coverage(pilot),byType:Object.fromEntries([...new Set(pilot.map(p=>p.entity?.canonicalType??'UNKNOWN'))].map(t=>{const rows=pilot.filter(p=>(p.entity?.canonicalType??'UNKNOWN')===t);return[t,{total:rows.length,coverage:coverage(rows)}]})),hasMappedCoordinate:pilot.filter(p=>p.entity?.location?.geometry).length,reviewLimit:'Source consistency review, not independent field verification. No geometry is inferred from an address.'};
 await writeFile(dir+'pilot-review.json',JSON.stringify({metrics,pilot,ingestion:results},null,2));console.log(JSON.stringify(metrics));
}finally{await pool.end();}
