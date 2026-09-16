import { json } from './postgres-alert-store-support.mjs';

const ASSET_BATCH_SIZE = 500;

async function seedAssetsBatched(client, territoryId, assets) {
  for (let offset = 0; offset < assets.length; offset += ASSET_BATCH_SIZE) {
    const batch = assets.slice(offset, offset + ASSET_BATCH_SIZE);
    const ids=[],groupIds=[],names=[],assetTypes=[],geometries=[],sources=[],sourceIds=[],provenances=[],metadatas=[],actives=[];
    for (const asset of batch) {
      ids.push(asset.id); groupIds.push(asset.groupId); names.push(asset.name); assetTypes.push(asset.assetType);
      geometries.push(json(asset.geometry)); sources.push(asset.source); sourceIds.push(asset.sourceId);
      provenances.push(json(asset.provenance)); metadatas.push(json(asset.metadata)); actives.push(asset.active !== false);
    }
    await client.query(`INSERT INTO monitored_asset(id,territory_id,group_id,name,asset_type,geometry,source,source_id,provenance,metadata,active)
      SELECT t.id,$2::text,t.group_id,t.name,t.asset_type,ST_SetSRID(ST_GeomFromGeoJSON(t.geometry_geojson),4326),t.source,t.source_id,t.provenance,t.metadata,t.active
      FROM UNNEST($1::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::jsonb[],$10::jsonb[],$11::boolean[])
        AS t(id,group_id,name,asset_type,geometry_geojson,source,source_id,provenance,metadata,active)
      ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,asset_type=excluded.asset_type,geometry=excluded.geometry,source=excluded.source,source_id=excluded.source_id,provenance=excluded.provenance,metadata=excluded.metadata,active=excluded.active,updated_at=now()`,
    [ids,territoryId,groupIds,names,assetTypes,geometries,sources,sourceIds,provenances,metadatas,actives]);
  }
}

export async function seedTerritory({tx,audit}, { territory, zones = [],groups = [], assets = [], policies = [] }) {
  return tx(async (client) => {
    await client.query(`INSERT INTO monitored_territory(id,name,mode,geometry,administrative_reference,source,provenance,owner_actor_id,active)
      VALUES($1,$2,$3,ST_SetSRID(ST_GeomFromGeoJSON($4),4326),$5::jsonb,$6,$7::jsonb,$8,$9)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,mode=excluded.mode,geometry=excluded.geometry,administrative_reference=excluded.administrative_reference,source=excluded.source,provenance=excluded.provenance,owner_actor_id=excluded.owner_actor_id,active=excluded.active,updated_at=now()`,
    [territory.id, territory.name, territory.mode, json(territory.geometry), json(territory.administrativeReference), territory.source, json(territory.provenance), territory.ownerActorId, territory.active !== false]);
    for(const zone of zones)await client.query(`INSERT INTO monitored_zone(id,territory_id,name,geometry,source,provenance,active) VALUES($1,$2,$3,ST_SetSRID(ST_GeomFromGeoJSON($4),4326),$5,$6::jsonb,$7)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,geometry=excluded.geometry,source=excluded.source,provenance=excluded.provenance,active=excluded.active,updated_at=now()`,[zone.id,territory.id,zone.name,json(zone.geometry),zone.source,json(zone.provenance),zone.active!==false]);
    for (const group of groups) await client.query(`INSERT INTO monitored_asset_group(id,territory_id,name,asset_type,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,asset_type=excluded.asset_type,active=excluded.active,updated_at=now()`, [group.id, territory.id, group.name, group.assetType, group.active !== false]);
    await seedAssetsBatched(client, territory.id, assets);
    for (const policy of policies) await client.query(`INSERT INTO territory_alert_policy(territory_id,policy_id,policy_version,enabled,radius_meters,channels) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(territory_id,policy_id) DO UPDATE SET policy_version=excluded.policy_version,enabled=excluded.enabled,radius_meters=excluded.radius_meters,channels=excluded.channels,updated_at=now()`,[territory.id,policy.id,policy.version,policy.enabled!==false,policy.radiusMeters,json(policy.channels)]);
    await audit(client,{aggregateType:'MONITORED_TERRITORY',aggregateId:territory.id,action:'TERRITORY_REGISTRY_SYNCED',actorId:'vigia-system',payload:{source:territory.source,zoneCount:zones.length,assetCount:assets.length,policyCount:policies.length}});
    return{territoryId:territory.id,zoneCount:zones.length,assetCount:assets.length,policyCount:policies.length};
  });
}
export async function territoryContext({pool,assertReady},coordinate){
  assertReady();if(!Array.isArray(coordinate)||coordinate.length!==2||!coordinate.every(Number.isFinite))return{territories:[],zones:[],policies:[],assets:[]};
  const point='ST_SetSRID(ST_MakePoint($1,$2),4326)',territories=await pool.query(`SELECT id,name,mode,source,owner_actor_id FROM monitored_territory WHERE active AND ST_Covers(geometry,${point})`,coordinate),territoryIds=territories.rows.map((row)=>row.id);
  const zones=await pool.query(`SELECT id,name,territory_id,source FROM monitored_zone WHERE active AND ST_Covers(geometry,${point})`,coordinate),policies=await pool.query('SELECT territory_id,policy_id,policy_version,radius_meters,channels FROM territory_alert_policy WHERE enabled AND territory_id=ANY($1::text[])',[territoryIds]);
  const radius=Math.max(0,...policies.rows.map((row)=>Number(row.radius_meters)||0)),assets=radius?await pool.query(`SELECT id,name,asset_type,territory_id,source,source_id,provenance,ST_Distance(geometry::geography,${point}::geography) distance_meters FROM monitored_asset WHERE active AND ST_DWithin(geometry::geography,${point}::geography,$3) ORDER BY distance_meters LIMIT 50`,[...coordinate,radius]):{rows:[]};
  const criticality={POWER_GENERATION:'HIGH',HIGH_TEMPERATURE_INDUSTRIAL:'HIGH',WASTE_PROCESSING:'MEDIUM',INDUSTRIAL_WORKS:'MEDIUM',INDUSTRIAL_SITE:'MEDIUM',QUARRY:'REVIEW'},rank={HIGH:3,MEDIUM:2,REVIEW:1};
  const assetRows=assets.rows.map((row)=>({id:row.id,name:row.name,assetType:row.asset_type,criticality:criticality[row.asset_type]??'REVIEW',territoryId:row.territory_id,distanceMeters:Math.round(Number(row.distance_meters)),source:row.source,sourceId:row.source_id,provenance:row.provenance,connectedDevice:false})),highest=assetRows.map((item)=>item.criticality).sort((a,b)=>(rank[b]??0)-(rank[a]??0))[0]??null;
  const policyRows=policies.rows.map((row)=>({territoryId:row.territory_id,policyId:row.policy_id,policyVersion:row.policy_version,radiusMeters:row.radius_meters,channels:row.channels}));
  return{insideMonitoredTerritory:territories.rows.length>0,territories:territories.rows.map((row)=>({id:row.id,name:row.name,mode:row.mode,source:row.source,ownerActorId:row.owner_actor_id})),zones:zones.rows.map((row)=>({id:row.id,name:row.name,territoryId:row.territory_id,source:row.source})),policies:policyRows,territoryAlertPolicy:policyRows[0]??null,assetSearchRadiusMeters:radius,assets:assetRows,nearestAsset:assetRows[0]??null,assetsWithinConfiguredRadius:assetRows.length,highestRelevantCriticality:highest,assetQualification:'OSM-derived reference assets are proximity context, not connected devices.'};
}
export async function listTerritories({pool,assertReady}){assertReady();return(await pool.query('SELECT id,name,mode,source,owner_actor_id,active,created_at,updated_at,ST_AsGeoJSON(geometry)::jsonb geometry FROM monitored_territory ORDER BY name')).rows;}
export async function listAssets({pool,assertReady},{territoryId=null,limit=500}={}){assertReady();return(await pool.query('SELECT id,territory_id,group_id,name,asset_type,source,source_id,provenance,metadata,active,ST_AsGeoJSON(geometry)::jsonb geometry FROM monitored_asset WHERE ($1::text IS NULL OR territory_id=$1) ORDER BY name LIMIT $2',[territoryId,Math.min(2000,Math.max(1,Number(limit)||500))])).rows;}
