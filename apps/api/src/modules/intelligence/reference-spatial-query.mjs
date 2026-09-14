import { validCoordinate } from '../world/observation-validation.mjs';

export function validateOperationalGeometry(geometry,{polygonOnly=false}={}) {
  if(!geometry||!['Point','LineString','Polygon','MultiPolygon'].includes(geometry.type)||geometry.crs)return false;
  if(polygonOnly&&!['Polygon','MultiPolygon'].includes(geometry.type))return false;
  let vertices=0,west=Infinity,east=-Infinity;
  const point=p=>{vertices++;if(!validCoordinate(p))return false;west=Math.min(west,p[0]);east=Math.max(east,p[0]);return vertices<=20000;};
  const line=(r,closed=false)=>Array.isArray(r)&&r.length>=(closed?4:2)&&r.every(point)&&(!closed||r[0].every((v,i)=>v===r.at(-1)[i]));
  const polygon=p=>Array.isArray(p)&&p.length>0&&p.every(r=>line(r,true));
  const valid=geometry.type==='Point'?point(geometry.coordinates):geometry.type==='LineString'?line(geometry.coordinates):geometry.type==='Polygon'?polygon(geometry.coordinates):Array.isArray(geometry.coordinates)&&geometry.coordinates.length>0&&geometry.coordinates.every(polygon);
  return valid&&east-west<=180; // This Portugal service does not reinterpret antimeridian-spanning geometry.
}

export const SPATIAL_RELATIONSHIP_SQL=`
WITH input AS (
 SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326) origin,
 CASE WHEN $2::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326) END current_geometry,
 CASE WHEN $3::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($3::text),4326) END previous_geometry
), subject AS (
 SELECT origin,CASE WHEN ST_IsValid(current_geometry) THEN current_geometry END current_geometry,
 CASE WHEN ST_IsValid(previous_geometry) THEN previous_geometry END previous_geometry FROM input
), features AS (
 SELECT item,ST_SetSRID(ST_GeomFromGeoJSON((item->'geometry')::text),4326) geometry
 FROM jsonb_array_elements($4::jsonb) item
), valid AS (SELECT * FROM features WHERE ST_IsValid(geometry)), relations AS (
 SELECT item,ST_Distance(geometry::geography,origin::geography) distance_from_point_m,
 CASE WHEN current_geometry IS NOT NULL THEN ST_Distance(geometry::geography,current_geometry::geography) END distance_from_perimeter_m,
 CASE WHEN previous_geometry IS NOT NULL THEN ST_Distance(geometry::geography,previous_geometry::geography) END previous_distance_m,
 CASE WHEN current_geometry IS NOT NULL THEN ST_Intersects(geometry,current_geometry) END intersects,
 CASE WHEN current_geometry IS NOT NULL AND previous_geometry IS NOT NULL THEN ST_Intersects(geometry,current_geometry) AND NOT ST_Intersects(geometry,previous_geometry) END newly_intersected
 FROM valid CROSS JOIN subject WHERE ST_DWithin(geometry::geography,COALESCE(current_geometry,origin)::geography,$5)
), ordered AS (
 SELECT *,row_number() OVER(PARTITION BY item->>'kind' ORDER BY COALESCE(distance_from_perimeter_m,distance_from_point_m),item->>'id') rank,
 count(*) OVER(PARTITION BY item->>'kind') category_count FROM relations
)
SELECT jsonb_build_object('relationships',COALESCE((SELECT jsonb_agg(jsonb_build_object(
 'feature',item,'distanceFromPointM',distance_from_point_m,'distanceFromPerimeterM',distance_from_perimeter_m,
 'previousDistanceFromPerimeterM',previous_distance_m,'distanceChangeM',distance_from_perimeter_m-previous_distance_m,
 'intersects',intersects,'newlyIntersected',newly_intersected,'rank',rank,'categoryCount',category_count)
 ORDER BY COALESCE(distance_from_perimeter_m,distance_from_point_m),item->>'id') FROM ordered WHERE rank<=3),'[]'::jsonb),
 'perimeterValid',current_geometry IS NOT NULL,'previousValid',previous_geometry IS NOT NULL,
 'areaHa',CASE WHEN current_geometry IS NOT NULL THEN ST_Area(current_geometry::geography)/10000 END,
 'perimeterKm',CASE WHEN current_geometry IS NOT NULL THEN ST_Perimeter(current_geometry::geography)/1000 END,
 'previousAreaHa',CASE WHEN previous_geometry IS NOT NULL THEN ST_Area(previous_geometry::geography)/10000 END,
 'newAreaHa',CASE WHEN current_geometry IS NOT NULL AND previous_geometry IS NOT NULL THEN ST_Area(ST_Difference(current_geometry,previous_geometry)::geography)/10000 END
) result FROM subject`;

export async function querySpatialRelationships(pool,{coordinate,current=null,previous=null,features=[],radiusM=25000}) {
  if(!validCoordinate(coordinate)||!Number.isFinite(radiusM)||radiusM<0||radiusM>50000)throw new Error('spatial_query_scope_invalid');
  if(features.length>2000)throw new Error('spatial_query_feature_bound');
  const valid=features.filter(f=>f.id&&f.source&&f.provenanceRef&&validateOperationalGeometry(f.geometry));
  const perimeter=current&&validateOperationalGeometry(current,{polygonOnly:true})?current:null;
  const prior=previous&&validateOperationalGeometry(previous,{polygonOnly:true})?previous:null;
  const result=await pool.query({text:SPATIAL_RELATIONSHIP_SQL,values:[JSON.stringify({type:'Point',coordinates:coordinate}),perimeter?JSON.stringify(perimeter):null,prior?JSON.stringify(prior):null,JSON.stringify(valid),radiusM],query_timeout:3000});
  return {...result.rows[0].result,rejected:features.length-valid.length,method:'POSTGIS_WGS84_GEOGRAPHY',radiusM};
}
