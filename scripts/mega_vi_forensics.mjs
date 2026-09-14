import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadConfig} from '../apps/api/src/config/env.mjs';
import {AuditService} from '../apps/api/src/modules/audit/audit-service.mjs';
import {auditHash} from '../apps/api/src/modules/audit/audit-chain.mjs';
import {Pool} from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
const config=loadConfig(),state=JSON.parse(await readFile(config.stateFile,'utf8')),events=state.audit??[],audit=new AuditService({repository:{snapshot:()=>({audit:events})}}).verifyChain(),failures=[];
for(let index=0;index<events.length;index++){const e=events[index],{hash,...base}=e,expectedHash=auditHash(base),next=events[index+1];if(hash!==expectedHash||next&&e.previousHash!==next.hash)failures.push({index,id:e.id??null,at:e.at??null,kind:!hash?'UNSIGNED_LEGACY_RECEIPT':hash!==expectedHash?'HASH_MISMATCH':'CHAIN_DISCONTINUITY',expectedHash,actualHash:hash??null,expectedPreviousHash:next?.hash??null,actualPreviousHash:e.previousHash??null,nextId:next?.id??null});}
const pool=new Pool({connectionString:await resolveLocalDatabaseUrl()});
const result={capturedAt:new Date().toISOString(),audit:{...audit,firstHeadOrderFailure:failures[0],oldestArrayOrderFailure:failures.at(-1),boundaries:failures.filter(f=>f.kind==='CHAIN_DISCONTINUITY'),classification:failures.some(f=>f.kind==='HASH_MISMATCH')?'HASH_MISMATCH_REQUIRES_INVESTIGATION':'LEGACY_UNSIGNED_RECEIPTS_AND_BOUNDARY_GAPS',repair:'New receipts sealed at mutation boundary. Historical unsigned data cannot be retroactively authenticated. Preserve evidence and keep the chain gate red.',retainedDigest:createHash('sha256').update(JSON.stringify(events)).digest('hex')}};
const after=process.env.EVIDENCE_PHASE==='after';
if(after){const before=JSON.parse(await readFile('.tmp/mega-vi/audit-retained-before.json','utf8'));result.audit.preservation={beforeEntries:before.length,afterEntries:events.length,retainedSuffixIdentical:JSON.stringify(events.slice(-before.length))===JSON.stringify(before),newEntries:events.length-before.length};}
try{
 result.tables=(await pool.query('SELECT relname,n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 12')).rows;
 result.history=(await pool.query("SELECT incident_id,count(*)::int count,min(known_at) first,max(known_at) last FROM incident_situation_snapshot WHERE universe='OPERATIONAL' GROUP BY incident_id")).rows;
 result.sources=(await pool.query('SELECT payload FROM world_knowledge_source')).rows.map(({payload:s})=>({provider:s.provider,authority:s.authority,family:s.family,adapter:s.adapter,status:s.status,lastFetch:s.lastFetch,url:s.url}));
 result.queryPlans={};for(const [name,text,values]of [['latest','SELECT payload FROM incident_situation_snapshot WHERE incident_id=$1 ORDER BY known_at DESC,capture_sequence DESC LIMIT 1',['PT-2026-01F7E2E21A']],['recent','SELECT DISTINCT ON(incident_id) payload FROM incident_situation_snapshot ORDER BY incident_id,known_at DESC,capture_sequence DESC LIMIT 100',[]]])result.queryPlans[name]=(await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+text,values)).rows[0]['QUERY PLAN'];
}finally{await pool.end();}
await writeFile(`docs/handoffs/mega-vi/readiness-forensics${after?'-after':''}.json`,JSON.stringify(result,null,2));
if(!after)await writeFile('.tmp/mega-vi/audit-retained-before.json',JSON.stringify(events));
console.log(JSON.stringify({auditValid:audit.valid,failures:failures.length,boundaries:result.audit.boundaries,historyIncidents:result.history.length}));
