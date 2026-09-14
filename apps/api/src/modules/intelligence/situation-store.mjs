import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {readJson,writeJsonAtomic} from '../../shared/json-file.mjs';
import {runPostgresMigrations} from '../storage/postgres-migration-runner.mjs';
import {hash} from '../../../../../packages/domain/src/intelligence/world-knowledge.mjs';
import {randomUUID} from 'node:crypto';

const empty=()=>({snapshots:[],jobs:[],documents:[],admissions:[]});
export class SituationStore{
  constructor({pool=null,filePath=null}){if(!pool&&!filePath)throw new Error('situation_storage_required');Object.assign(this,{pool,filePath});this.tail=Promise.resolve();}
  async initialize(){if(this.pool)await runPostgresMigrations(this.pool);else{await mkdir(path.dirname(this.filePath),{recursive:true});if(!await readJson(this.filePath,null))await writeJsonAtomic(this.filePath,empty());}}
  async local(operation){const work=this.tail.then(async()=>{const state=await readJson(this.filePath,empty()),value=await operation(state);await writeJsonAtomic(this.filePath,state);return value;});this.tail=work.catch(()=>{});return work;}
  async latest(incidentId,asOf=new Date().toISOString()){
    if(this.pool)return(await this.pool.query('SELECT payload FROM incident_situation_snapshot WHERE incident_id=$1 AND known_at<=$2 ORDER BY known_at DESC,capture_sequence DESC LIMIT 1',[incidentId,asOf])).rows[0]?.payload??null;
    await this.tail;return(await readJson(this.filePath,empty())).snapshots.slice().reverse().filter(s=>s.incident.id===incidentId&&s.knownAt<=asOf).sort((a,b)=>b.knownAt.localeCompare(a.knownAt))[0]??null;
  }
  async interval(incidentId,from,to){
    if(this.pool)return(await this.pool.query('SELECT payload FROM incident_situation_snapshot WHERE incident_id=$1 AND known_at>$2 AND known_at<=$3 ORDER BY known_at,capture_sequence LIMIT 100',[incidentId,from,to])).rows.map(r=>r.payload);
    await this.tail;return(await readJson(this.filePath,empty())).snapshots.filter(s=>s.incident.id===incidentId&&s.knownAt>from&&s.knownAt<=to).sort((a,b)=>a.knownAt.localeCompare(b.knownAt)).slice(0,100);
  }
  async causalEvents(incidentId,from,to){
    if(this.pool)return(await this.pool.query("SELECT payload->'causalEvents' events FROM incident_situation_snapshot WHERE incident_id=$1 AND known_at>$2 AND known_at<=$3 ORDER BY known_at,capture_sequence LIMIT 100",[incidentId,from,to])).rows.flatMap(r=>r.events??[]);
    return(await this.interval(incidentId,from,to)).flatMap(s=>s.causalEvents??[]);
  }
  async times(incidentId){if(this.pool)return(await this.pool.query('SELECT id,known_at,content_hash FROM incident_situation_snapshot WHERE incident_id=$1 ORDER BY known_at DESC,capture_sequence DESC LIMIT 100',[incidentId])).rows.map(r=>({id:r.id,knownAt:r.known_at.toISOString(),contentHash:r.content_hash}));await this.tail;return(await readJson(this.filePath,empty())).snapshots.filter(s=>s.incident.id===incidentId).slice(-100).reverse().map(({id,knownAt,contentHash})=>({id,knownAt,contentHash}));}
  async recentChanges(incidentId,from,to){if(this.pool)return(await this.pool.query("SELECT payload->'changes' changes FROM incident_situation_snapshot WHERE incident_id=$1 AND known_at>=$2 AND known_at<=$3 ORDER BY known_at DESC,capture_sequence DESC LIMIT 50",[incidentId,from,to])).rows.flatMap(r=>r.changes??[]);await this.tail;return(await readJson(this.filePath,empty())).snapshots.filter(s=>s.incident.id===incidentId&&s.knownAt>=from&&s.knownAt<=to).slice(-50).reverse().flatMap(s=>s.changes??[]);}
  async append(snapshot){
    if(snapshot.universe==='SCENARIO')throw new Error('scenario_cannot_write_operational_history');
    if(!this.pool)return this.local(s=>{const previous=s.snapshots.filter(x=>x.incident.id===snapshot.incident.id).at(-1);if(previous&&previous.knownAt>snapshot.knownAt)throw new Error('situation_knowledge_clock_regressed');if(previous?.contentHash===snapshot.contentHash)return{state:'UNCHANGED',snapshot:previous};s.snapshots.push(snapshot);return{state:'APPENDED',snapshot};});
    const client=await this.pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['situation:'+snapshot.incident.id]);const previous=(await client.query('SELECT payload FROM incident_situation_snapshot WHERE incident_id=$1 ORDER BY known_at DESC,capture_sequence DESC LIMIT 1',[snapshot.incident.id])).rows[0]?.payload;if(previous?.contentHash===snapshot.contentHash){await client.query('COMMIT');return{state:'UNCHANGED',snapshot:previous};}
      if(previous&&previous.knownAt>snapshot.knownAt)throw new Error('situation_knowledge_clock_regressed');
      await client.query('INSERT INTO incident_situation_snapshot(id,incident_id,known_at,content_hash,universe,payload) VALUES($1,$2,$3,$4,$5,$6)',[snapshot.id,snapshot.incident.id,snapshot.knownAt,snapshot.contentHash,snapshot.universe,JSON.stringify(snapshot)]);
      const dependencies=snapshot.relationships.flatMap(r=>[...new Set((r.dependencies??[]).flat().filter(x=>typeof x==='string'))].map(dependency=>({dependency,relationshipId:r.id,kind:r.kind})));
      if(dependencies.length)await client.query("INSERT INTO incident_situation_dependency(snapshot_id,incident_id,dependency_id,relationship_id,kind) SELECT $1,$2,v->>'dependency',v->>'relationshipId',v->>'kind' FROM jsonb_array_elements($3::jsonb) v ON CONFLICT DO NOTHING",[snapshot.id,snapshot.incident.id,JSON.stringify(dependencies)]);
      await client.query('COMMIT');return{state:'APPENDED',snapshot};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
  async enqueue(incidentId,input,dueAt=new Date().toISOString()){
    const revision=randomUUID(),payload={input,reason:input.reason??'OBSERVED_PROJECTION'};
    if(this.pool){await this.pool.query("INSERT INTO incident_situation_job(incident_id,revision,payload,due_at) VALUES($1,$2,$3,$4) ON CONFLICT(incident_id) DO UPDATE SET revision=excluded.revision,payload=jsonb_build_object('reason',excluded.payload->'reason','input',(incident_situation_job.payload->'input') || (excluded.payload->'input') || jsonb_build_object('incident',COALESCE(incident_situation_job.payload->'input'->'incident','{}'::jsonb) || COALESCE(excluded.payload->'input'->'incident','{}'::jsonb))),due_at=LEAST(incident_situation_job.due_at,excluded.due_at)",[incidentId,revision,JSON.stringify(payload),dueAt]);return;}
    return this.local(s=>{const existing=s.jobs.find(j=>j.incidentId===incidentId),row={incidentId,revision,...payload,dueAt};if(existing){row.input={...existing.input,...input,incident:{...existing.input.incident,...input.incident}};row.dueAt=existing.dueAt<dueAt?existing.dueAt:dueAt;Object.assign(existing,row);}else s.jobs.push(row);});
  }
  async recent(){if(this.pool)return(await this.pool.query('SELECT DISTINCT ON(incident_id) payload FROM incident_situation_snapshot ORDER BY incident_id,known_at DESC,capture_sequence DESC LIMIT 100')).rows.map(r=>r.payload);await this.tail;return [...new Map((await readJson(this.filePath,empty())).snapshots.map(s=>[s.incident.id,s])).values()].slice(0,100);}
  async jobs(at=new Date().toISOString()){
    if(this.pool)return(await this.pool.query('SELECT incident_id,revision,payload,due_at,attempts FROM incident_situation_job WHERE due_at<=$1 ORDER BY due_at LIMIT 4',[at])).rows.map(r=>({incidentId:r.incident_id,revision:r.revision,...r.payload,dueAt:r.due_at.toISOString(),attempts:r.attempts}));
    await this.tail;return(await readJson(this.filePath,empty())).jobs.filter(j=>j.dueAt<=at).slice(0,4);
  }
  async finish(job,error=null,at=new Date().toISOString()){
    if(this.pool){if(!error)await this.pool.query('DELETE FROM incident_situation_job WHERE incident_id=$1 AND revision=$2',[job.incidentId,job.revision]);else await this.pool.query("UPDATE incident_situation_job SET attempts=attempts+1,last_error=$3,due_at=$4::timestamptz + interval '60 seconds' WHERE incident_id=$1 AND revision=$2",[job.incidentId,job.revision,String(error).slice(0,250),at]);return;}
    return this.local(s=>{const i=s.jobs.findIndex(j=>j.incidentId===job.incidentId&&j.revision===job.revision);if(i<0)return;if(error)Object.assign(s.jobs[i],{attempts:(s.jobs[i].attempts??0)+1,lastError:String(error),dueAt:new Date(Date.parse(at)+60000).toISOString()});else s.jobs.splice(i,1);});
  }
  async affected(dependencies){
    if(this.pool)return(await this.pool.query('SELECT DISTINCT d.incident_id FROM incident_situation_dependency d JOIN (SELECT DISTINCT ON(incident_id) id FROM incident_situation_snapshot ORDER BY incident_id,known_at DESC,capture_sequence DESC) s ON s.id=d.snapshot_id WHERE d.dependency_id=ANY($1::text[]) LIMIT 100',[dependencies])).rows.map(r=>r.incident_id);
    await this.tail;const snapshots=(await readJson(this.filePath,empty())).snapshots,latest=new Map(snapshots.map(s=>[s.incident.id,s]));return[...latest.values()].filter(s=>s.relationships.some(r=>r.dependencies?.some(id=>dependencies.includes(id)))).map(s=>s.incident.id);
  }
  async saveDocument(doc){if(this.pool){await this.pool.query('INSERT INTO incident_situation_document(id,incident_id,known_at,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[doc.id,doc.incidentId,doc.knownAt,JSON.stringify(doc)]);return doc;}return this.local(s=>{if(!s.documents.some(d=>d.id===doc.id))s.documents.push(doc);return doc;});}
  async document(id){if(this.pool)return(await this.pool.query('SELECT payload FROM incident_situation_document WHERE id=$1',[id])).rows[0]?.payload??null;await this.tail;return(await readJson(this.filePath,empty())).documents.find(d=>d.id===id)??null;}
  async admit(record){if(this.pool){await this.pool.query('INSERT INTO incident_situation_admission(id,incident_id,document_id,known_at,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[record.id,record.incidentId,record.documentId,record.knownAt,JSON.stringify(record)]);return record;}return this.local(s=>{if(!s.admissions.some(r=>r.id===record.id))s.admissions.push(record);return record;});}
  async admissions(incidentId,at=new Date().toISOString()){if(this.pool)return(await this.pool.query('SELECT payload FROM incident_situation_admission WHERE incident_id=$1 AND known_at<=$2 ORDER BY known_at',[incidentId,at])).rows.map(r=>r.payload);await this.tail;return(await readJson(this.filePath,empty())).admissions.filter(r=>r.incidentId===incidentId&&r.knownAt<=at);}
  async metrics(){if(this.pool)return(await this.pool.query("SELECT (SELECT count(*)::int FROM incident_situation_snapshot) snapshots,(SELECT count(*)::int FROM incident_situation_dependency) dependencies,(SELECT count(*)::int FROM incident_situation_job) jobs,(SELECT count(*)::int FROM incident_situation_document) documents,(SELECT count(*)::int FROM incident_situation_admission) admissions")).rows[0];await this.tail;const s=await readJson(this.filePath,empty());return Object.fromEntries(Object.entries(s).map(([k,v])=>[k,v.length]));}
  async retainHistory(at=new Date().toISOString(),days=30){
    if(days!==30)throw new Error('history_retention_policy_invalid');
    const cutoff=new Date(Date.parse(at)-days*86400000).toISOString();
    if(!this.pool)return this.local(s=>{const anchors=new Map();for(const row of s.snapshots)if(row.knownAt<cutoff)anchors.set(row.incident.id,row.id);const before=s.snapshots.length;s.snapshots=s.snapshots.filter(row=>row.knownAt>=cutoff||anchors.get(row.incident.id)===row.id);return{days,cutoff,removed:before-s.snapshots.length};});
    const client=await this.pool.connect();try{await client.query('BEGIN');await client.query('CREATE TEMP TABLE expired_situation_ids ON COMMIT DROP AS SELECT id FROM incident_situation_snapshot WHERE known_at<$1 AND id NOT IN (SELECT DISTINCT ON(incident_id) id FROM incident_situation_snapshot WHERE known_at<$1 ORDER BY incident_id,known_at DESC,capture_sequence DESC)',[cutoff]);await client.query('DELETE FROM incident_situation_dependency WHERE snapshot_id IN(SELECT id FROM expired_situation_ids)');const result=await client.query('DELETE FROM incident_situation_snapshot WHERE id IN(SELECT id FROM expired_situation_ids)');await client.query('COMMIT');return{days,cutoff,removed:result.rowCount};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}
