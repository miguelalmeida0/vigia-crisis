// Attention policy only. The caller retains the original event journal unchanged.
export const MATERIALITY_POLICY=Object.freeze({version:'operational-materiality-v1',weatherBucketMinutes:60,thresholds:Object.freeze({})});
const time=v=>Date.parse(v??'');
export function operationalMateriality(changes,{asOf,policy=MATERIALITY_POLICY,currentIncidentIds=null}={}){
 const audit=changes.filter(c=>Number.isFinite(time(c.at??c.timestamp))&&time(c.at??c.timestamp)<=time(asOf)),weather=new Map(),attention=[];
 for(const c of audit){
  const type=String(c.type??'').toLowerCase(),at=c.at??c.timestamp;
  if(/weather/.test(type)){
   const key=[c.incidentId??c.entity??'',c.sourceId??c.source??'',Math.floor(time(at)/(policy.weatherBucketMinutes*60000))].join(':');
   const group=weather.get(key)??[];group.push(c);weather.set(key,group);continue;
  }
  if(/projection|synchron|evidence|graph|corroboration|verification|geometry_changed|new_observation/.test(type))continue;
  if(/source_failed|source_recovered|system failure/.test(type)&&currentIncidentIds&&!c.affectedIncidentIds?.some(id=>currentIncidentIds.includes(id)))continue;
  if(c.material===true||/thermal|fire detection|official|warning|road|field|incident_currentness|conflict|source_failed|source_recovered/.test(type))attention.push({...c,at,severity:c.severity??'INFORMATIONAL'});
 }
 for(const [key,group] of weather){
  group.sort((a,b)=>time(a.at??a.timestamp)-time(b.at??b.timestamp));const last=group.at(-1),notable=group.filter(c=>{const t=policy.thresholds?.[c.metricId??c.evidence?.[0]];return (c.material===true&&Boolean(c.policy))||t&&Number.isFinite(c.comparison?.delta)&&Math.abs(c.comparison.delta)>=t.minimumDelta&&c.comparison.minutes<=t.windowMinutes;});
  attention.push({...last,id:'weather-summary:'+key,at:last.at??last.timestamp,type:'Weather',severity:'INFORMATIONAL',material:notable.length>0,consolidated:true,observationCount:group.length,evidence:group.flatMap(c=>c.evidence??[c.id]).filter(Boolean),text:notable[0]?.text??`Weather observations updated${group.length>1?' · '+group.length+' updates consolidated':''}.`,summary:notable[0]?.text??'Weather observations updated.',policy:policy.version});
 }
 return{events:attention.sort((a,b)=>time(b.at)-time(a.at)),auditCount:audit.length,attentionCount:attention.length,consolidatedCount:audit.length-attention.length,policy};
}
