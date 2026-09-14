import { createHash } from 'node:crypto';
import path from 'node:path';
import { bboxCovers } from '../../../../../packages/domain/src/observation-integrity.mjs';
import { runGeospatialProcess } from './geospatial-process.mjs';
import { ProductionIntegrityViolation } from '../../../../../packages/domain/src/production-integrity.mjs';

function proofHash(payload){return createHash('sha256').update(JSON.stringify(payload)).digest('hex');}
function unavailable(scene,coordinate,reason){const proof={mode:'catalog_only',sceneId:scene?.id??null,coordinate,bbox:scene?.bbox??null,reason};return{state:'catalog_only',renderAllowed:false,scientificInferenceAllowed:false,pixelVerified:false,scienceBandsVerified:false,reason,bindingHash:proofHash(proof),proof};}
function scienceAssets(scene){return{red:scene.redCogUrl??null,nir:scene.nirCogUrl??null,swir16:scene.swir16CogUrl??null,scl:scene.sclCogUrl??null};}
export function rasterSourceAuthenticity(localized,contentBinding){
  if(!localized?.brokerOrigin&&path.isAbsolute(String(localized?.href??'')))return{verified:true,mode:'governed_local_asset'};
  if(contentBinding?.sourceAuthenticity?.verified===true)return{verified:true,mode:String(contentBinding.sourceAuthenticity.mode??'independently_anchored')};
  return{verified:false,mode:'allowlisted_origin_continuity_only'};
}
export class GeoIntegrityService{
  constructor({projectRoot,python='python3',timeoutMs=20_000,proofRepository=null,runtimeService=null,rasterAssetBroker=null}={}){this.python=python;this.timeoutMs=timeoutMs;this.script=path.join(projectRoot,'workers/geospatial/geo_integrity.py');this.cache=new Map();this.proofRepository=proofRepository;this.runtimeService=runtimeService;this.rasterAssetBroker=rasterAssetBroker;}
  async localizeScene(scene,options={}){if(this.rasterAssetBroker)return this.rasterAssetBroker.localizeScene(scene,options);for(const key of ['visualCogUrl','redCogUrl','nirCogUrl','swir16CogUrl','swir22CogUrl','sclCogUrl'])if(scene?.[key]&&!path.isAbsolute(scene[key]))throw new Error('raster_asset_broker_required');return{scene:{...scene},assetBrokerOrigin:null,contentBindings:{}};}
  async #verifyAsset(asset,coordinate,scene){const assetHash=proofHash({asset});let localized;if(this.rasterAssetBroker)localized=await this.rasterAssetBroker.localizeAsset(asset,{allowedHosts:scene.rasterAssetHosts??[]});else if(path.isAbsolute(asset))localized={href:asset,brokerOrigin:null,capabilityId:null};else throw new Error('raster_asset_broker_required');const priorBinding=this.rasterAssetBroker?.bindingFor(localized.href)??null,identity=priorBinding?.objectVersionHash??localized.capabilityId??assetHash,key=`${assetHash}:${identity}:${coordinate.map((v)=>Number(v).toFixed(6)).join(':')}`;if(this.cache.has(key))return structuredClone(this.cache.get(key));const result=await runGeospatialProcess({python:this.python,script:this.script,input:{asset:localized.href,assetBrokerOrigin:localized.brokerOrigin,coordinate},timeoutMs:this.timeoutMs}),contentBinding=this.rasterAssetBroker?.bindingFor(localized.href)??null;if(localized.brokerOrigin&&!contentBinding)throw new Error('raster_asset_content_unbound');const sourceAuthenticity=rasterSourceAuthenticity(localized,contentBinding),bound={...result,contentBinding,sourceAuthenticity},finalKey=`${assetHash}:${contentBinding?.objectVersionHash??identity}:${coordinate.map((v)=>Number(v).toFixed(6)).join(':')}`;this.cache.set(finalKey,bound);if(this.cache.size>160)this.cache.delete(this.cache.keys().next().value);await this.proofRepository?.record?.({key:finalKey,assetHash,coordinate,result:bound});return structuredClone(bound);}
  async verifyScene(scene,coordinate,{scienceRequired=false}={}){
    if(!scene)return unavailable(scene,coordinate,'Scene unavailable.');
    if(scene.fixture||scene.provenance?.synthetic===true)throw new ProductionIntegrityViolation('Synthetic scene rejected by the production geospatial integrity boundary.',{sceneId:scene.id??null});
    if(!bboxCovers(scene.bbox,coordinate))return unavailable(scene,coordinate,'STAC/catalog footprint does not contain the selected coordinate.');
    if(this.runtimeService&&this.runtimeService.snapshot().ok!==true)return unavailable(scene,coordinate,'Scientific raster runtime is unavailable; catalogue coverage is retained but native pixels are not analysis-grade.');
    if(!scene.visualCogUrl)return unavailable(scene,coordinate,'Native georeferenced raster asset is unavailable; browse imagery cannot establish pixel binding.');
    let visual;try{visual=await this.#verifyAsset(scene.visualCogUrl,coordinate,scene);}catch(error){return unavailable(scene,coordinate,`Raster transport rejected: ${error.message}`);}const renderAllowed=visual.ok===true&&visual.pixelVerified===true;
    let bands={},scienceBandsVerified=false;
    if(scienceRequired&&scene.sensor==='Sentinel-2'){
      const assets=scienceAssets(scene),required=['red','nir','swir16'];
      if(required.every((name)=>assets[name])){const entries=await Promise.all(Object.entries(assets).filter(([,asset])=>asset).map(async([name,asset])=>{try{return[name,await this.#verifyAsset(asset,coordinate,scene)];}catch(error){return[name,{ok:false,error:`raster_transport_rejected:${error.message}`}];}}));bands=Object.fromEntries(entries);scienceBandsVerified=required.every((name)=>bands[name]?.ok===true&&bands[name]?.pixelVerified===true)&&(bands.scl?bands.scl.ok===true&&bands.scl.pixelVerified===true:true);}
    }
    const scienceSourceAuthenticityVerified=renderAllowed&&visual.sourceAuthenticity?.verified===true&&Object.entries(bands).filter(([name])=>['red','nir','swir16','scl'].includes(name)).every(([,value])=>value?.sourceAuthenticity?.verified===true);
    const scientificInferenceAllowed=renderAllowed&&scienceBandsVerified&&scienceSourceAuthenticityVerified;
    const contentBindings={visual:visual.contentBinding??null,...Object.fromEntries(Object.entries(bands).map(([name,value])=>[name,value?.contentBinding??null]))};
    const proof={mode:'raster_pixel_round_trip',sceneId:scene.id,coordinate,catalogBbox:scene.bbox,visual,bands,contentBindings,scienceRequired,scienceSourceAuthenticityVerified};
    const state=renderAllowed?'pixel_verified':'rejected';
    const reason=!renderAllowed?(visual.error??visual.reason??'Raster binding could not be proven.'):scienceRequired&&!scienceBandsVerified?'Visual raster verified, but every required science band did not pass pixel-level binding.':scienceRequired&&!scienceSourceAuthenticityVerified?'Pixels were localized, but source authenticity is allowlisted-origin continuity only; scientific inference is withheld.':'Raster CRS, geotransform, selected pixel, reverse projection and source authenticity verified.';
    return{state,renderAllowed,scientificInferenceAllowed,pixelVerified:renderAllowed,scienceBandsVerified,scienceSourceAuthenticityVerified,reason,bindingHash:proofHash(proof),contentBindings,proof};
  }
}
