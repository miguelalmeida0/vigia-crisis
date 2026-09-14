import { createSourceRegistry } from '../../../../../packages/domain/src/event-fabric/index.mjs';
import { createSourceCoverageIndex } from '../../../../../packages/domain/src/reality-network/index.mjs';
import { PROVIDER_MANIFEST_BY_ID } from './provider-portfolio.mjs';

const HOUR=60*60_000,registeredAt='2025-01-01T00:00:00.000Z';
const specifications=Object.freeze([
  ['firms:VIIRS_SNPP_NRT','nasa-firms','VIIRS_SNPP_NRT','physical.viirs','PHYSICAL','NASA-FIRMS','NASA LANCE FIRMS',6*HOUR,['POLAR_THERMAL']],
  ['firms:VIIRS_NOAA20_NRT','nasa-firms','VIIRS_NOAA20_NRT','physical.viirs','PHYSICAL','NASA-FIRMS','NASA LANCE FIRMS',6*HOUR,['POLAR_THERMAL']],
  ['firms:VIIRS_NOAA21_NRT','nasa-firms','VIIRS_NOAA21_NRT','physical.viirs','PHYSICAL','NASA-FIRMS','NASA LANCE FIRMS',6*HOUR,['POLAR_THERMAL']],
  ['firms:MODIS_NRT','nasa-firms','MODIS_NRT','physical.modis','PHYSICAL','NASA-FIRMS','NASA LANCE FIRMS',6*HOUR,['POLAR_THERMAL']],
  ['goes:G18:FDCC','noaa-goes-abi','ABI-L2-FDCC-G18','physical.abi','PHYSICAL','NOAA-NESDIS','NOAA NODD GOES-18',20*60_000,['GEOSTATIONARY_THERMAL']],
  ['goes:G19:FDCC','noaa-goes-abi','ABI-L2-FDCC-G19','physical.abi','PHYSICAL','NOAA-NESDIS','NOAA NODD GOES-19',20*60_000,['GEOSTATIONARY_THERMAL']],
  ['wfigs:current-perimeters','nifc-wfigs','WFIGS_INTERAGENCY_PERIMETERS_CURRENT','official.wfigs-incident-perimeter','OFFICIAL','NIFC-WFIGS','WFIGS',3*HOUR,['OFFICIAL_PERIMETER']],
  ['feds:nrt-perimeters','nasa-feds','FEDS_FIRE_PERIMETERS_NRT','derived.feds-viirs-perimeter','CONTEXT','NASA-FEDS','NASA FEDS',18*HOUR,['DERIVED_PERIMETER']],
  ['nws:active-alerts','nws-cap','NWS_ACTIVE_ALERTS','official.cap-alert','OFFICIAL','NOAA-NWS','api.weather.gov',15*60_000,['OFFICIAL_ALERT']],
  ['ecmwf:ifs:oper','ecmwf-open-data','IFS_OPEN_DATA_0P25','context.weather.ecmwf-ifs','CONTEXT','ECMWF','ECMWF Open Data',12*HOUR,['WEATHER_CONTEXT']],
  ['osm:bounded-assets','openstreetmap-overpass','OSM_BOUNDED_ASSET_CONTEXT','context.assets.openstreetmap','CONTEXT','OPENSTREETMAP-CONTRIBUTORS','Overpass API',48*HOUR,['EXPOSURE_CONTEXT']]
]);

function product(providerId,productId){return PROVIDER_MANIFEST_BY_ID[providerId].products.find((item)=>item.id===productId);}
export function createRealitySourceRegistry(){return createSourceRegistry(specifications.map(([sourceId,providerId,productId,familyId,familyClass,producerId,upstreamOrigin,staleAfterMs,capabilities])=>({sourceId,familyId,familyClass,sourceClass:product(providerId,productId).sourceClass,producerId,provider:providerId,upstreamOrigin,staleAfterMs,initialStatus:'UNKNOWN',registeredAt,capabilities,geographicApplicability:{bbox:PROVIDER_MANIFEST_BY_ID[providerId].coverage.bbox},metadata:{providerId,productId,maturity:product(providerId,productId).maturity}})));}

export function createRealityCoverageIndex(){return createSourceCoverageIndex(specifications.map(([sourceId,providerId,productId,,familyClass,producerId])=>{const manifest=PROVIDER_MANIFEST_BY_ID[providerId],item=product(providerId,productId);return{sourceId,productId,bbox:manifest.coverage.bbox,temporalCoverage:manifest.temporalCoverage,cadenceSeconds:item.cadenceSeconds,expectedLatencySeconds:item.expectedLatencySeconds,sourceClass:familyClass,maturity:item.maturity,lineage:{producerId,providerId},contractRoles:item.sourceClass==='PHYSICAL'?['INDEPENDENT_PHYSICAL_CORROBORATION']:item.sourceClass==='OFFICIAL'?['OFFICIAL_CORROBORATION']:[`${item.sourceClass}_CONTEXT`]};}));}

export const REALITY_SOURCE_SPECIFICATIONS=specifications;
