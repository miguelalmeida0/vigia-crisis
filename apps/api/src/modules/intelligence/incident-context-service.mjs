import { createHash } from 'node:crypto';
import { GovernedReferenceInventory } from './governed-reference-inventory.mjs';
import { querySpatialRelationships, validateOperationalGeometry } from './reference-spatial-query.mjs';
import { retainPerimeterObservation } from './perimeter-observation-history.mjs';

function admitted(record,asOf){
  return record&&validateOperationalGeometry(record.geometry,{polygonOnly:true})&&record.source&&record.provenanceRef&&
    Number.isFinite(Date.parse(record.observedAt))&&Date.parse(record.observedAt)<=Date.parse(asOf)&&
    (!record.receivedAt||(Number.isFinite(Date.parse(record.receivedAt))&&Date.parse(record.receivedAt)<=Date.parse(asOf)))&&
    /^(OFFICIAL_PERIMETER|SCIENTIFICALLY_ADMITTED_PERIMETER|ADMITTED_OFFICIAL_PERIMETER)$/.test(record.sourceAdmission??record.authority??'')&&record.synthetic===false&&!record.forecast&&!record.model?record:null;
}
export class IncidentContextService {
  constructor({pool,repository=null,projectRoot,clock=()=>new Date(),inventory=null}){Object.assign(this,{pool,repository,clock});this.inventory=inventory??new GovernedReferenceInventory({projectRoot});this.cache=new Map();this.pending=new Map();this.inventoryLoad=null;this.inventoryAttempted=false;}
  // Single-flight, attempt-once lazy trigger for the governed reference
  // inventory (~62MB to build; see createServices for why it is not started
  // eagerly). Only the first caller — whether that is an explicit
  // initialize() or the first real project() — starts the load; every
  // concurrent or later caller shares that one promise or, once it has
  // settled (success or failure), sees the inventory's own state directly.
  // Deliberately does not retry a failed load: these are static deployment
  // artifacts that either exist or don't, not something that becomes
  // available later within one process's lifetime.
  #loadInventory(){
    if(this.inventoryLoad)return this.inventoryLoad;
    if(this.inventoryAttempted||this.inventory.state!=='UNAVAILABLE')return Promise.resolve();
    this.inventoryAttempted=true;
    this.inventoryLoad=this.inventory.initialize().finally(()=>{this.inventoryLoad=null;});
    return this.inventoryLoad;
  }
  initialize(){return this.#loadInventory();}
  sourceRecords(){return this.inventory.sources;}
  async project({physical,item}){
    void this.#loadInventory();
    const asOf=this.clock().toISOString();let current=admitted(item?.spatialTruth?.officialPerimeter,asOf),history=null;
    if(current){try{history=await retainPerimeterObservation(this.repository,physical.incidentId,current);if(history.conflicting)current=null;}catch{history={state:'HISTORY_UNAVAILABLE'};}}
    const candidate=admitted(item?.spatialTruth?.previousOfficialPerimeter??history?.previous,asOf);
    const previous=candidate&&current&&candidate.source===current.source&&Date.parse(candidate.observedAt)<Date.parse(current.observedAt)?candidate:null;
    const key=createHash('sha256').update(JSON.stringify([physical.incidentId,physical.location,current,previous,history?.state,history?.conflicting,this.knowledgeService?.revision])).digest('hex'),cached=this.cache.get(key);
    if(cached&&Date.now()-cached.at<60000)return {...cached.value,performance:{...cached.value.performance,cache:'HIT'}};
    if(this.pending.has(key))return this.pending.get(key);
    const work=(async()=>{
      const started=performance.now();
      if(!this.pool||this.inventory.state!=='CACHED')return{state:'UNAVAILABLE',relationships:[],reason:'Governed geographic inventory or PostGIS is unavailable.'};
      const cohort=await this.inventory.candidates(physical.location);
      if(this.knowledgeService)cohort.features=cohort.features.map(feature=>{
        const enriched=this.knowledgeService.decorate(feature);
        if(!enriched.canonicalId)return feature;
        return {...enriched,geometry:{type:'Point',coordinates:enriched.coordinate},geometryRole:enriched.canonicalIntelligence.location.locationQuality,source:enriched.canonicalIntelligence.provenance.canonicalName?.[0]?.provider??feature.source};
      });
      if(this.knowledgeService){
        const ids=new Set(cohort.features.map(f=>f.id));
        for(const f of this.knowledgeService.facilityRecords()){
          const dx=(f.coordinate[0]-physical.location[0])*Math.cos(physical.location[1]*Math.PI/180),dy=f.coordinate[1]-physical.location[1];
          if(ids.has(f.id)||Math.hypot(dx,dy)*110000>26000||cohort.features.length>=2000)continue;
          cohort.features.push({...f,geometry:{type:'Point',coordinates:f.coordinate},geometryRole:f.canonicalIntelligence.location.locationQuality,source:f.provenance.provider,sourceRecordId:f.id,receivedAt:f.provenance.retrievedAt,provenanceRef:f.canonicalRevision,limitation:f.staticCapability.limitation});ids.add(f.id);
        }
      }
      try{
        const result=await querySpatialRelationships(this.pool,{coordinate:physical.location,current:current?.geometry,previous:previous?.geometry,features:cohort.features});
        const value={state:'READY',calculatedAt:asOf,relationships:result.relationships,
          perimeter:{areaHa:result.areaHa,perimeterKm:result.perimeterKm,previousAreaHa:result.previousAreaHa,newAreaHa:result.newAreaHa,
            areaDeltaHa:result.areaHa!==null&&result.previousAreaHa!==null?result.areaHa-result.previousAreaHa:null,
            current:result.perimeterValid?current:null,previous:result.previousValid?previous:null,
            historyState:history?.state??'NO_ADMITTED_OBSERVATION',reason:history?.conflicting?'Conflicting same-time perimeter revisions; no single geometry selected.':result.perimeterValid?null:'No valid, dated, attributable admitted perimeter is available.'},
          method:result.method,search:{radiusM:result.radiusM,origin:'INCIDENT_POINT',candidateCount:cohort.features.length,spatialPrefilterCount:cohort.total,truncated:cohort.truncated,returned:result.relationships.length},
          limitation:'Nearest returned reference features within the incident-point search cohort; three per category. Incomplete mapping and feature centres do not establish exposure, route distance or safety.',
          performance:{calculationMs:Math.round((performance.now()-started)*100)/100,cache:'MISS',inputFeatures:cohort.features.length}};
        void this.knowledgeService?.store.enqueue('RECALCULATE_RELATIONSHIPS',physical.incidentId,{priority:110,payload:{coordinate:physical.location,context:{contextRelationships:value.relationships,weather:physical.weather?.station??null,thermal:physical.thermal?.detections??[],notices:physical.warnings?.warnings??[]}}}).catch(()=>{});
        if(this.cache.size>=64)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{at:Date.now(),value});return value;
      }catch(error){return{state:'UNAVAILABLE',relationships:[],reason:'Geospatial query unavailable; other observations remain usable.',failure:String(error.message).slice(0,200)};}
    })().finally(()=>this.pending.delete(key));this.pending.set(key,work);return work;
  }
}
