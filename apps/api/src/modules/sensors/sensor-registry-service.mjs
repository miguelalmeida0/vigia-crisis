import { readJson } from '../../shared/json-file.mjs';
import { haversineKm } from '../../../../../packages/domain/src/geo.mjs';

const TYPES=new Set(['camera','thermal_camera','ground_sensor','drone','field_unit']);
function cleanAsset(item){
  if(!item||!TYPES.has(item.type)||!Array.isArray(item.coordinate)||!item.coordinate.every(Number.isFinite))return null;
  const status=String(item.currentAvailability??item.status??'available');
  const incidentIds=[...new Set((Array.isArray(item.incidentIds)?item.incidentIds:[]).map((value)=>String(value).trim()).filter((value)=>value&&value!=='*'))];
  return{id:String(item.id),name:String(item.name??item.id),organizationId:item.organizationId?String(item.organizationId):null,type:item.type,coordinate:item.coordinate.slice(0,2),lastKnownLocation:item.lastKnownLocation??{coordinate:item.coordinate.slice(0,2),at:item.updatedAt??null},status,currentAvailability:status,shift:item.shift?structuredClone(item.shift):null,capabilities:Array.isArray(item.capabilities)?item.capabilities.map(String):[],incidentIds,viewRadiusKm:Number(item.viewRadiusKm??item.coverageRadiusKm??0)||0,speedKph:Number(item.speedKph??0)||0,launchMinutes:Number(item.launchMinutes??0)||0,ownerId:item.ownerId?String(item.ownerId):null,updatedAt:item.updatedAt??null,endpoint:item.endpoint?String(item.endpoint):null,ingestSecret:item.ingestSecret?String(item.ingestSecret):null};
}
function publicAsset(item){const{ingestSecret,incidentIds,...safe}=item;return{...safe,endpoint:Boolean(item.endpoint),signedIngest:Boolean(ingestSecret),incidentScopeCount:incidentIds.length};}
export class SensorRegistryService{
  constructor({filePath,reader=readJson,clock=()=>new Date(),mirrorStore=null}={}){this.filePath=filePath;this.reader=reader;this.clock=clock;this.mirrorStore=mirrorStore;this.assets=[];this.loadedAt=null;this.error=null;}
  async refresh(){try{const payload=this.filePath?await this.reader(this.filePath,{assets:[]}):{assets:[]};this.assets=(payload.assets??[]).map(cleanAsset).filter(Boolean);this.error=null;await this.mirrorStore?.commitFieldResources?.(this.assets);}catch(error){this.assets=[];this.error=String(error.message??error);}this.loadedAt=this.clock().toISOString();return this.snapshot();}
  snapshot(){return{state:this.error?'unavailable':this.assets.length?'current':'not_configured',loadedAt:this.loadedAt,count:this.assets.length,assets:this.assets.map(publicAsset),error:this.error??(this.assets.length?null:'No connected observation assets are configured.')};}
  get(id){const asset=this.assets.find((item)=>item.id===String(id));return asset?{...asset}:null;}
  async nearby(coordinate,{maxKm=80}={}){if(!this.loadedAt)await this.refresh();return this.assets.map((asset)=>({...publicAsset(asset),distanceKm:haversineKm(coordinate,asset.coordinate)})).filter((asset)=>Number.isFinite(asset.distanceKm)&&asset.distanceKm<=maxKm).sort((a,b)=>a.distanceKm-b.distanceKm);}
}
