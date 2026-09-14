import { rows, timestamp, metric } from './physical-metric.mjs';
import { weatherMetrics } from './physical-conditions.mjs';
import { IPMA_WARNING_AREAS } from './ipma-warning-areas.mjs';

export function stationRecords(world) {
  const direct=rows(world?.directWeather),state=world?.sources?.[direct.length?'ipmaWeather':'weather'];
  const sourceId=direct.length?'ipmaWeather':'weather',history=rows(world?.weatherHistory).filter(s=>s.sourceId===sourceId);
  const alternate=new Map(),identity=s=>JSON.stringify([s.id,s.observedAt,s.coordinate]);
  for(const s of rows(world?.weatherHistory))if(s.sourceId!==sourceId&&s.provenance?.synthetic===false){const key=identity(s);if(!alternate.has(key))alternate.set(key,[]);alternate.get(key).push({...s,source:s.provenance.provider});}
  return [...history,...rows(direct.length?direct:world?.weather)].filter(s=>s.provenance?.synthetic===false).map(s=>({...s,source:s.provenance.provider,sourceId,sourceState:state?.error?'unavailable':state?.state,stationId:s.id,stationName:s.name,
    comparisonObservations:alternate.get(identity(s))??[]}));
}
export function nationalContext(world,asOf) {
  if(!world||world.meta?.mode!=='production')return null;
  const now=timestamp(asOf),stations=stationRecords(world),byStation=new Map();
  for(const s of stations)if(timestamp(s.observedAt)<=now&&(!byStation.has(s.id)||timestamp(s.observedAt)>timestamp(byStation.get(s.id).observedAt)))byStation.set(s.id,s);
  const stationMetrics=[...byStation.values()].flatMap(s=>weatherMetrics([s],asOf).metrics);
  const extremes=[['wind','Highest observed wind',false],['gust','Highest observed gust',false],['temperature','Highest temperature',false],['humidity','Lowest humidity',true]].map(([key,label,low])=>{
    const available=stationMetrics.filter(m=>m.id===key&&m.value!==null),current=available.filter(m=>m.freshness==='CURRENT'),candidates=(current.length?current:available).sort((a,b)=>low?a.value-b.value:b.value-a.value);
    return candidates[0]?{...candidates[0],id:`national-${key}`,label:current.length?label:label+' · last reported'}:metric(`national-${key}`,label,null,key==='humidity'?'%':key==='temperature'?'°C':'km/h',{missingReason:key==='gust'?'FIELD_NOT_PROVIDED':'NO_MATCHING_RECORD',source:key==='gust'?'IPMA':null,limitation:key==='gust'?'Gusts are not provided by the current IPMA station feed.':null},asOf);
  });
  const direct=rows(world.directWarnings),useDirect=direct.length>0||world.sources?.ipmaWarnings?.state==='current',state=world.sources?.[useDirect?'ipmaWarnings':'warnings'];
  const checked=timestamp(state?.lastSuccessAt??state?.fetchedAt),coverage=state?.state==='current'&&checked!==null&&checked<=now&&now-checked<=6*3600000;
  const warnings=rows(useDirect?direct:world.warnings).filter(w=>w.provenance?.synthetic===false&&['yellow','orange','red'].includes(w.level)&&timestamp(w.startAt)<=now&&timestamp(w.endAt)>now);
  const unique=[...new Map(warnings.map(w=>[w.id,w])).values()];
  const warningCount=metric('activeWarnings','Active official weather warnings',coverage?unique.length:null,'',{source:state?.origin??'IPMA',sourceId:useDirect?'ipmaWarnings':'warnings',measurementType:'DERIVED',basisAt:state?.lastSuccessAt??state?.fetchedAt,receivedAt:state?.lastSuccessAt??state?.fetchedAt,sourceState:state?.state,spatialScope:'PORTUGAL_WARNING_AREAS',provenanceRef:state?.rawSourceProductId,definition:{statistic:'Count of published yellow, orange and red warnings effective at query time'},missingReason:state?.error?'SOURCE_FAILED':'SOURCE_STALE'},asOf,6*3600000,'IPMA notices. Source check is not notice issuance. Individual applicability requires an area association.');
  const riskState=world.sources?.riskToday,day=asOf?.slice(0,10),risks=rows(world.riskToday).filter(r=>r.provenance?.synthetic===false&&r.forecastDay===day),high=risks.filter(r=>['alto','elevado','muito elevado','máximo','high','very high','maximum'].includes(String(r.label).toLowerCase()));
  const riskCount=metric('highDangerRegions','Municipalities with high fire danger',riskState?.state==='current'&&risks.length?new Set(high.map(r=>r.municipalityCode??r.id)).size:null,'',{source:riskState?.origin,measurementType:'DERIVED',basisAt:riskState?.lastSuccessAt??riskState?.fetchedAt,receivedAt:riskState?.lastSuccessAt??riskState?.fetchedAt,sourceState:riskState?.state,provenanceRef:riskState?.rawSourceProductId,definition:{forecastDay:day,statistic:'Count using published high, very high and maximum categories'}},asOf,12*3600000,'Official forecast category labels for today; municipality count, not incident severity.');
  return {metrics:[...extremes,warningCount,riskCount],warnings:unique.slice(0,12).map(w=>({id:w.id,authority:w.provenance.provider,type:w.type,area:IPMA_WARNING_AREAS[w.areaId]??w.areaName,areaId:w.areaId,level:w.level,text:w.description,effective:w.startAt,expires:w.endAt,issuedAt:null,receivedAt:w.receivedAt??null,provenanceRef:w.provenance?.rawSourceProductId,state:coverage?'ACTIVE':'CURRENTNESS_UNAVAILABLE'})),warningsTotal:unique.length,warningCoverage:coverage?'CURRENT':'UNAVAILABLE',boundary:'Station extrema cover reporting mainland stations. Warnings cover all Portugal, including Madeira and the Azores. Neither is a local safety claim.'};
}
