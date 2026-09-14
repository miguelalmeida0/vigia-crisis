import pg from 'pg';
import { PostgresPhysicalTruthStore } from '../apps/api/src/modules/storage/postgres-physical-truth-store.mjs';

const databaseUrl=process.env.VIGIA_DATABASE_URL;
if(!databaseUrl)throw new Error('VIGIA_DATABASE_URL is required');
const at='2026-08-10T12:00:00.000Z',clock=()=>new Date(at);
const product={id:'raw:test:firms:a',sourceId:'test:firms:VIIRS_NOAA20_NRT',provider:'test-nasa-firms',providerProductId:'TEST:2026-08-10T11:55:00Z',requestWindow:{aoi:'test-portugal'},requestedAt:at,receivedAt:at,sourceTimestamp:'2026-08-10T11:55:00Z',sourceTimestampRange:{start:'2026-08-10T11:55:00Z',end:'2026-08-10T11:55:00Z'},contentType:'text/csv',byteLength:100,checksumSha256:'a'.repeat(64),originalUriOrObjectKey:'test/received/a.raw',httpStatus:200,acquisitionRunId:'test-run-1',parserVersion:'test-csv-v1',normalizerVersion:'test-normalizer-v1',licenceMetadata:{state:'test'},parsedAt:at};
const footprint={type:'Feature',properties:{authoritativePerimeter:false},geometry:{type:'Polygon',coordinates:[[[-8.101,40.099],[-8.099,40.099],[-8.099,40.101],[-8.101,40.099]]]}};
const observation={id:'thermal:test:n20:1',type:'thermal',source:'TEST NASA FIRMS VIIRS',at:'2026-08-10T11:55:00Z',receivedAt:at,coordinate:[-8.1,40.1],footprint,sourceFamily:'viirs',independenceGroup:'viirs_noaa_20',instrument:'VIIRS',satellite:'VIIRS NOAA-20',confidence:'nominal',frpMw:14.2,qualityFlags:[],provenance:{rawSourceProductId:product.id,normalizerVersion:'test-normalizer-v1',checksumSha256:product.checksumSha256,synthetic:true,universe:'test'}};
const event={id:'PT-TEST-2026-ABC',firstSeenAt:observation.at,lastSeenAt:observation.at,coordinate:observation.coordinate,evidenceState:'satellite-only',evolutionState:'active',knowledgeState:'physically_observed',behaviorState:'unknown',association:{state:'single_source'},observedGeometry:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-8.11,40.09],[-8.09,40.09],[-8.09,40.11],[-8.11,40.09]]]}},observations:[observation]};
const checkpoint={sourceId:product.sourceId,lastSuccessfulPollAt:at,pendingProductIds:[product.id],healthState:'archive_ready'};
const input={products:[product],events:[event],checkpoints:[checkpoint]};
const store=new PostgresPhysicalTruthStore({databaseUrl,clock,universe:'test'});
let output=null;
try{
  const initialized=await store.initialize();if(initialized.state!=='ready')throw new Error(initialized.lastError);
  const first=await store.commitSnapshot(input),second=await store.commitSnapshot(input);
  const action=await store.commitOperatorAction({id:'audit:postgis-verifier',at,actorId:'verification-operator',actorRole:'administrator',type:'persistence.verified',entityType:'storage',entityId:'postgres-physical-truth',payload:{purpose:'transactional persistence verification'},previousHash:'GENESIS',hash:'b'.repeat(64)});
  const client=new pg.Client({connectionString:databaseUrl,application_name:'vigia-postgis-verifier'});await client.connect();
  const result=await client.query(`SELECT (SELECT count(*)::int FROM raw_source_product WHERE id=$1) raw_products,(SELECT count(*)::int FROM physical_observation WHERE id=$2) physical_observations,(SELECT count(*)::int FROM fire_event WHERE id=$3) events,(SELECT count(*)::int FROM event_observation WHERE event_id=$3 AND observation_id=$2) event_links,(SELECT count(*)::int FROM source_checkpoint WHERE source_id=$4) checkpoints,(SELECT count(*)::int FROM provenance_lineage WHERE parent_id IN ($1,$2) OR child_id IN ($2,$3)) lineage_edges,(SELECT count(*)::int FROM operator_action WHERE id='audit:postgis-verifier') operator_actions,PostGIS_Version() postgis_version,ST_AsText((SELECT position::geometry FROM physical_observation WHERE id=$2)) observation_position,ST_GeometryType((SELECT support_geometry FROM physical_observation WHERE id=$2)) support_geometry_type`,[product.id,observation.id,event.id,product.sourceId]);
  await client.end();output={state:'passed',fixtureUniverse:'test',commits:[first,second],operatorAction:action,persisted:result.rows[0]};
}finally{
  await store.close();
  const cleanup=new pg.Client({connectionString:databaseUrl,application_name:'vigia-postgis-verifier-cleanup'});await cleanup.connect();
  try{
    await cleanup.query('BEGIN');
    await cleanup.query(`DELETE FROM provenance_lineage WHERE (parent_id=$1 AND child_id=$2) OR (parent_id=$2 AND child_id=$3)`,[product.id,observation.id,event.id]);
    await cleanup.query(`DELETE FROM event_observation WHERE event_id=$1 AND observation_id=$2`,[event.id,observation.id]);
    await cleanup.query(`DELETE FROM fire_event WHERE id=$1`,[event.id]);
    await cleanup.query(`DELETE FROM physical_observation WHERE id=$1 AND provenance->>'synthetic'='true'`,[observation.id]);
    await cleanup.query(`DELETE FROM source_checkpoint WHERE source_id=$1`,[product.sourceId]);
    await cleanup.query(`DELETE FROM raw_source_product WHERE id=$1 AND source_id=$2`,[product.id,product.sourceId]);
    await cleanup.query(`DELETE FROM operator_action WHERE id='audit:postgis-verifier' AND actor_id='verification-operator'`);
    await cleanup.query('COMMIT');
    const residual=await cleanup.query(`SELECT (SELECT count(*)::int FROM physical_observation WHERE id=$1) observations,(SELECT count(*)::int FROM raw_source_product WHERE id=$2) products,(SELECT count(*)::int FROM fire_event WHERE id=$3) events`,[observation.id,product.id,event.id]);
    if(Object.values(residual.rows[0]).some(Number))throw new Error('postgis_verifier_cleanup_incomplete');
    if(output)output.cleanup={state:'passed',residual:residual.rows[0]};
  }catch(error){await cleanup.query('ROLLBACK').catch(()=>{});throw error;}finally{await cleanup.end();}
}
console.log(JSON.stringify(output,null,2));
