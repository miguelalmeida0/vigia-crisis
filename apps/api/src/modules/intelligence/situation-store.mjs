import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {readJson,writeJsonAtomic} from '../../shared/json-file.mjs';
import {runPostgresMigrations} from '../storage/postgres-migration-runner.mjs';
import {hash} from '../../../../../packages/domain/src/intelligence/world-knowledge.mjs';
import {enqueueSituationJob,dueSituationJobs,finishSituationJob} from './situation-job-queue.mjs';
import {compactRouteList,hydrateRouteList,collectRouteArtifactHashes} from './situation-route-artifact.mjs';

const empty=()=>({snapshots:[],jobs:[],documents:[],admissions:[]});
// A compact snapshot (routes/communityRoutes referencing route artifacts
// instead of embedding geometry) should be a few tens of KB even for an
// incident with 200 facilities and 200 road reports. The pre-fix average was
// ~869KB, almost all of it repeated route geometry. Any payload still this
// large after compaction indicates a real bug (a new heavy field embedded
// without dedup) rather than legitimate compact history, so this fails
// loudly instead of silently writing megabytes again.
const MAX_SNAPSHOT_PAYLOAD_BYTES=250_000;
export class SituationStore{
  constructor({pool=null,filePath=null}){if(!pool&&!filePath)throw new Error('situation_storage_required');Object.assign(this,{pool,filePath});this.tail=Promise.resolve();}
  // Batched: collects every routeArtifactHash referenced across all given
  // payloads and resolves them with one query, instead of one query per row.
  async #hydrateRows(rows){
    const hashes=[...rows.reduce((set,row)=>{collectRouteArtifactHashes(row?.routes,set);collectRouteArtifactHashes(row?.communityRoutes,set);return set;},new Set())];
    if(!hashes.length)return rows;
    const artifacts=(await this.pool.query('SELECT content_hash,facility_id,direction,source,distance_km,travel_time_minutes,roads,geometry FROM situation_route_artifact WHERE content_hash=ANY($1::text[])',[hashes])).rows;
    const byHash=new Map(artifacts.map((a)=>[a.content_hash,{facilityId:a.facility_id,direction:a.direction,source:a.source,distanceKm:a.distance_km,travelTimeMinutes:a.travel_time_minutes,roads:a.roads,geometry:a.geometry}]));
    return rows.map((row)=>row?{...row,routes:hydrateRouteList(row.routes,byHash),communityRoutes:hydrateRouteList(row.communityRoutes,byHash)}:row);
  }
  async #hydratePayload(payload){return payload?(await this.#hydrateRows([payload]))[0]:payload;}
  async initialize(){if(this.pool)await runPostgresMigrations(this.pool);else{await mkdir(path.dirname(this.filePath),{recursive:true});if(!await readJson(this.filePath,null))await writeJsonAtomic(this.filePath,empty());}}
  async local(operation){const work=this.tail.then(async()=>{const state=await readJson(this.filePath,empty()),value=await operation(state);await writeJsonAtomic(this.filePath,state);return value;});this.tail=work.catch(()=>{});return work;}
  async latest(incidentId,asOf=new Date().toISOString()){
    if(this.pool)return this.#hydratePayload((await this.pool.query('SELECT payload FROM incident_situation_snapshot WHERE incident_id=$1 AND known_at<=$2 ORDER BY known_at DESC,capture_sequence DESC LIMIT 1',[incidentId,asOf])).rows[0]?.payload??null);
    await this.tail;return(await readJson(this.filePath,empty())).snapshots.slice().reverse().filter(s=>s.incident.id===incidentId&&s.knownAt<=asOf).sort((a,b)=>b.knownAt.localeCompare(a.knownAt))[0]??null;
  }
  async interval(incidentId,from,to){
    if(this.pool)return this.#hydrateRows((await this.pool.query('SELECT payload FROM incident_situation_snapshot WHERE incident_id=$1 AND known_at>$2 AND known_at<=$3 ORDER BY known_at,capture_sequence LIMIT 100',[incidentId,from,to])).rows.map(r=>r.payload));
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
    const client=await this.pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['situation:'+snapshot.incident.id]);const previous=(await client.query('SELECT payload FROM incident_situation_snapshot WHERE incident_id=$1 ORDER BY known_at DESC,capture_sequence DESC LIMIT 1',[snapshot.incident.id])).rows[0]?.payload;if(previous?.contentHash===snapshot.contentHash){await client.query('COMMIT');return{state:'UNCHANGED',snapshot:await this.#hydratePayload(previous)};}
      if(previous&&previous.knownAt>snapshot.knownAt)throw new Error('situation_knowledge_clock_regressed');
      // Route geometry is the one genuinely heavy, genuinely repeated
      // structure here (see situation-route-artifact.mjs) — everything else
      // in a snapshot (facilities, roadReports, relationships, ...) is
      // already bounded (buildSituation() caps each list) and, now that
      // situationHash() no longer churns on route freshness alone, a
      // snapshot only gets written when something operationally meaningful
      // actually changed. compactRouteList() replaces each route/community
      // route's geometry+roads with a routeArtifactHash reference; the
      // artifacts themselves are content-addressed and insert-once.
      const artifacts=new Map();
      const compacted={...snapshot,routes:compactRouteList(snapshot.routes,artifacts),communityRoutes:compactRouteList(snapshot.communityRoutes,artifacts)};
      const serialized=JSON.stringify(compacted);
      if(Buffer.byteLength(serialized)>MAX_SNAPSHOT_PAYLOAD_BYTES)throw Object.assign(new Error('situation_snapshot_payload_too_large'),{statusCode:507,bytes:Buffer.byteLength(serialized),limit:MAX_SNAPSHOT_PAYLOAD_BYTES});
      for(const[contentHash,artifact]of artifacts)await client.query('INSERT INTO situation_route_artifact(content_hash,facility_id,direction,source,distance_km,travel_time_minutes,roads,geometry) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(content_hash) DO UPDATE SET last_seen_at=now()',[contentHash,artifact.facilityId,artifact.direction,artifact.source,artifact.distanceKm,artifact.travelTimeMinutes,JSON.stringify(artifact.roads),JSON.stringify(artifact.geometry)]);
      await client.query('INSERT INTO incident_situation_snapshot(id,incident_id,known_at,content_hash,universe,payload) VALUES($1,$2,$3,$4,$5,$6)',[snapshot.id,snapshot.incident.id,snapshot.knownAt,snapshot.contentHash,snapshot.universe,serialized]);
      const dependencies=snapshot.relationships.flatMap(r=>[...new Set((r.dependencies??[]).flat().filter(x=>typeof x==='string'))].map(dependency=>({dependency,relationshipId:r.id,kind:r.kind})));
      if(dependencies.length)await client.query("INSERT INTO incident_situation_dependency(snapshot_id,incident_id,dependency_id,relationship_id,kind) SELECT $1,$2,v->>'dependency',v->>'relationshipId',v->>'kind' FROM jsonb_array_elements($3::jsonb) v ON CONFLICT DO NOTHING",[snapshot.id,snapshot.incident.id,JSON.stringify(dependencies)]);
      await client.query('COMMIT');return{state:'APPENDED',snapshot};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
  async enqueue(incidentId,input,dueAt=new Date().toISOString()){return enqueueSituationJob(this,incidentId,input,dueAt);}
  async recent(){if(this.pool)return this.#hydrateRows((await this.pool.query('SELECT DISTINCT ON(incident_id) payload FROM incident_situation_snapshot ORDER BY incident_id,known_at DESC,capture_sequence DESC LIMIT 100')).rows.map(r=>r.payload));await this.tail;return [...new Map((await readJson(this.filePath,empty())).snapshots.map(s=>[s.incident.id,s])).values()].slice(0,100);}
  async jobs(at=new Date().toISOString()){return dueSituationJobs(this,at);}
  async finish(job,error=null,at=new Date().toISOString()){return finishSituationJob(this,job,error,at);}
  async affected(dependencies){
    if(this.pool)return(await this.pool.query('SELECT DISTINCT d.incident_id FROM incident_situation_dependency d JOIN (SELECT DISTINCT ON(incident_id) id FROM incident_situation_snapshot ORDER BY incident_id,known_at DESC,capture_sequence DESC) s ON s.id=d.snapshot_id WHERE d.dependency_id=ANY($1::text[]) LIMIT 100',[dependencies])).rows.map(r=>r.incident_id);
    await this.tail;const snapshots=(await readJson(this.filePath,empty())).snapshots,latest=new Map(snapshots.map(s=>[s.incident.id,s]));return[...latest.values()].filter(s=>s.relationships.some(r=>r.dependencies?.some(id=>dependencies.includes(id)))).map(s=>s.incident.id);
  }
  async saveDocument(doc){if(this.pool){await this.pool.query('INSERT INTO incident_situation_document(id,incident_id,known_at,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[doc.id,doc.incidentId,doc.knownAt,JSON.stringify(doc)]);return doc;}return this.local(s=>{if(!s.documents.some(d=>d.id===doc.id))s.documents.push(doc);return doc;});}
  async document(id){if(this.pool)return(await this.pool.query('SELECT payload FROM incident_situation_document WHERE id=$1',[id])).rows[0]?.payload??null;await this.tail;return(await readJson(this.filePath,empty())).documents.find(d=>d.id===id)??null;}
  async admit(record){if(this.pool){await this.pool.query('INSERT INTO incident_situation_admission(id,incident_id,document_id,known_at,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[record.id,record.incidentId,record.documentId,record.knownAt,JSON.stringify(record)]);return record;}return this.local(s=>{if(!s.admissions.some(r=>r.id===record.id))s.admissions.push(record);return record;});}
  async admissions(incidentId,at=new Date().toISOString()){if(this.pool)return(await this.pool.query('SELECT payload FROM incident_situation_admission WHERE incident_id=$1 AND known_at<=$2 ORDER BY known_at',[incidentId,at])).rows.map(r=>r.payload);await this.tail;return(await readJson(this.filePath,empty())).admissions.filter(r=>r.incidentId===incidentId&&r.knownAt<=at);}
  // pg_column_size() on a sampled window (not every row — this table can
  // hold history for many incidents) is a cheap way to watch for the
  // payload-size regression this whole redesign exists to fix, without
  // itself becoming another high-volume scan/telemetry stream.
  async metrics(){if(this.pool)return(await this.pool.query(`SELECT
      (SELECT count(*)::int FROM incident_situation_snapshot) snapshots,
      (SELECT count(*)::int FROM incident_situation_dependency) dependencies,
      (SELECT count(*)::int FROM incident_situation_job) jobs,
      (SELECT count(*)::int FROM incident_situation_document) documents,
      (SELECT count(*)::int FROM incident_situation_admission) admissions,
      (SELECT count(*)::int FROM situation_route_artifact) route_artifacts,
      (SELECT round(avg(pg_column_size(payload)))::int FROM (SELECT payload FROM incident_situation_snapshot ORDER BY known_at DESC LIMIT 500) recent) avg_recent_snapshot_bytes,
      (SELECT max(pg_column_size(payload))::int FROM (SELECT payload FROM incident_situation_snapshot ORDER BY known_at DESC LIMIT 500) recent) max_recent_snapshot_bytes
    `)).rows[0];await this.tail;const s=await readJson(this.filePath,empty());return Object.fromEntries(Object.entries(s).map(([k,v])=>[k,v.length]));}
  async retainHistory(at=new Date().toISOString(),days=30){
    if(days!==30)throw new Error('history_retention_policy_invalid');
    const cutoff=new Date(Date.parse(at)-days*86400000).toISOString();
    if(!this.pool)return this.local(s=>{const anchors=new Map();for(const row of s.snapshots)if(row.knownAt<cutoff)anchors.set(row.incident.id,row.id);const before=s.snapshots.length;s.snapshots=s.snapshots.filter(row=>row.knownAt>=cutoff||anchors.get(row.incident.id)===row.id);return{days,cutoff,removed:before-s.snapshots.length};});
    const client=await this.pool.connect();try{await client.query('BEGIN');await client.query('CREATE TEMP TABLE expired_situation_ids ON COMMIT DROP AS SELECT id FROM incident_situation_snapshot WHERE known_at<$1 AND id NOT IN (SELECT DISTINCT ON(incident_id) id FROM incident_situation_snapshot WHERE known_at<$1 ORDER BY incident_id,known_at DESC,capture_sequence DESC)',[cutoff]);await client.query('DELETE FROM incident_situation_dependency WHERE snapshot_id IN(SELECT id FROM expired_situation_ids)');const result=await client.query('DELETE FROM incident_situation_snapshot WHERE id IN(SELECT id FROM expired_situation_ids)');await client.query('COMMIT');return{days,cutoff,removed:result.rowCount};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}
