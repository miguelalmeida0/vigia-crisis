import { canonicalIncidentId, incidentInScope } from '../authorization.mjs';
import { rows, number, timestamp, distanceKm, metric } from './physical-metric.mjs';
import { weatherMetrics, thermalMetrics, airMetrics, warningMetrics, placeMetrics } from './physical-conditions.mjs';
import { stationRecords, nationalContext } from './physical-world-context.mjs';
import { incidentQuestions, getNationalSituation, MATERIAL_CHANGE_POLICY } from './operator-questions.mjs';

export const FIRE_SEARCH_POLICY=Object.freeze({radiusKm:25,windowHours:72,meaning:'Returned thermal observations within an explicit search radius; not a hazard or safety radius.'});
const incidentPoint=item=>item.incident?.location?.coordinate??item.incident?.location?.coordinates??item.incident?.location?.geometry?.coordinates??item.incident?.operatorIdentity?.coordinate??null;

function measurements(item) {
  const graph=item.evidenceGraph??{},sources=new Map(rows(graph.sources).map(s=>[s.id,s])),families=new Map(rows(graph.sourceFamilies).map(f=>[f.id,f]));
  return rows(graph.observations).map(o=>{const s=sources.get(o.sourceId),p=o.value??{};return {...p,id:o.id,measurementId:o.upstreamMeasurementId,observedAt:o.observedAt,receivedAt:o.receivedAt??p.receivedAt??null,coordinate:o.location?.coordinate??o.location?.geometry?.coordinates,provenance:o.provenance,provenanceRef:o.provenance?.rawObjectRef??o.provenance?.operationalEventId??o.id,
    source:s?.metadata?.producerId??s?.label??null,sourceId:s?.id,sourceState:s?.status,family:s?.familyId,familyClass:families.get(s?.familyId)?.familyClass,
    product:p.product??([p.platform,p.instrument].filter(Boolean).join(' ')||null)};});
}
export function physicalChanges({weather,thermal,air,warnings},asOf,policy=MATERIAL_CHANGE_POLICY) {
  const changes=[];
  for(const m of [...weather.metrics,...air.metrics])if(m.trend&&m.trend.delta!==0){const t=m.trend;changes.push({at:m.asOf,source:m.source,type:['pm25','pm10','ozone'].includes(m.id)?'Air quality':'Weather',where:m.location,material:t.material===true,policy:t.policy??'History only: no configured physical escalation threshold',comparison:t,text:`${m.label} ${t.delta>0?'increased':'decreased'} by ${Math.abs(t.delta)} ${m.unit} in ${t.minutes} minutes.`,evidence:[m.id]});}
  const newThermal=thermal.detections.filter(r=>timestamp(r.observedAt)>=timestamp(asOf)-20*60000);
  if(newThermal.length)changes.push({at:newThermal.map(r=>r.observedAt).sort().at(-1),source:[...new Set(newThermal.map(r=>r.source))].join(' · '),type:'Fire detection',material:true,text:`${newThermal.length} distinct thermal detection${newThermal.length===1?'':'s'} recorded in the last 20 minutes.`,evidence:newThermal.slice(0,12).map(r=>r.id)});
  for(const w of warnings.warnings.filter(w=>timestamp(w.issuedAt)!==null&&timestamp(w.issuedAt)>=timestamp(asOf)-3*3600000&&timestamp(w.issuedAt)<=timestamp(asOf)))changes.push({at:w.issuedAt,source:w.authority,type:'Official update',where:w.area,material:true,text:`${w.authority} issued ${w.type??'a warning'} for ${w.area??'the associated area'}.`,evidence:[w.id]});
  for(const change of changes.filter(c=>c.comparison)){
    const id=change.evidence[0],threshold=policy.physicalThresholds?.[id],m=[...weather.metrics,...air.metrics].find(m=>m.id===id);
    if(Number.isFinite(threshold?.minimumDelta)&&threshold.minimumDelta>0){change.material=m.trend.minutes<=threshold.windowMinutes&&Math.abs(m.trend.delta)>=threshold.minimumDelta;change.policy=policy.version;}
  }
  return changes.sort((a,b)=>timestamp(b.at)-timestamp(a.at)).slice(0,8);
}
export function incidentPhysicalWorld(item,asOf,all=[],scene=null) {
  const observations=measurements(item),location=incidentPoint(item);
  const association=item.weatherAssociation,weatherRows=association&&association.state!=='UNASSOCIATED'?[{...association,observedAt:association.validAt}]:[];
  const stationObservations=observations.filter(r=>r.weatherRole==='OBSERVED_STATION').map(r=>({...r,...r.values}));
  const weather=weatherMetrics([...weatherRows,...stationObservations],asOf,{location,subjectId:item.incident.id});
  const heat=observations.filter(r=>r.familyClass==='PHYSICAL'&&/thermal|viirs|modis|abi|mtg|firms|slstr|fci/i.test(r.family??''));
  const matched=canonicalIncidentId(scene?.selectedIncidentId??'')===canonicalIncidentId(item.incident.id),layer=matched?scene?.layers?.observations:null;
  const sceneHeat=['READY','DEGRADED'].includes(layer?.state)?rows(layer.value).filter(r=>/thermal|hotspot/i.test(r.type??'')||/^(VIIRS|MODIS|SLSTR|ABI|FCI)$/i.test(r.instrument??'')).map(r=>({...r,source:r.source??r.provenance?.provider,product:[r.platform,r.instrument].filter(Boolean).join(' ')||null})):[];
  // One inventory owns a count. Do not add compact map copies to native observations.
  const thermal=thermalMetrics(heat.length?heat:sceneHeat,location,asOf,item.assessment?.sourceCoverage?.independentPhysicalFamilies);
  const air=airMetrics(observations,location,asOf);
  const cap=observations.filter(r=>r.familyClass==='OFFICIAL'&&r.cap?.status==='Actual'&&r.cap?.scope==='Public').map(r=>({...r,id:r.cap.identifier,official:true,authority:r.source,type:r.cap.event,issuedAt:r.cap.sent??null,effective:r.cap.effective,expires:r.cap.expires,area:r.cap.areaDescription,cancelled:r.cap.messageType==='Cancel',superseded:r.superseded===true}));
  const contextAssets=observations.flatMap(o=>rows(o.assets).map(a=>({...a,source:o.source,retrievedAt:o.observedAt,kind:a.tags?.amenity??a.tags?.power??a.kind,label:a.tags?.name??a.label})));
  const warnings=warningMetrics(cap,asOf),places=placeMetrics([...rows(item.assets??item.exposure?.assets),...contextAssets],item.roads??item.exposure?.roads,asOf);
  const nearest=all.filter(i=>i.incident.id!==item.incident.id).map(i=>({item:i,distance:distanceKm(location,incidentPoint(i))})).filter(i=>i.distance!==null).sort((a,b)=>a.distance-b.distance)[0];
  // Internal OPEN is never presented as an official incident status.
  const official=observations.filter(r=>r.familyClass==='OFFICIAL'&&r.officialIncidentStatus&&timestamp(r.observedAt)<=timestamp(asOf)).sort((a,b)=>timestamp(b.observedAt)-timestamp(a.observedAt))[0];
  const status=metric('officialStatus','Official incident status',official?.officialIncidentStatus??null,'',{...official,subjectId:item.incident.id,measurementType:'OFFICIAL',missingReason:'NO_MATCHING_RECORD'},asOf,90*60000,'Only the status explicitly supplied by an official incident source.');
  const danger=observations.filter(r=>r.familyClass==='OFFICIAL'&&r.fireDanger?.classificationReference).sort((a,b)=>timestamp(b.observedAt)-timestamp(a.observedAt))[0];
  const result={incidentId:item.incident.id,asOf,location,locationLabel:item.incident.operatorIdentity?.label??item.incident.label??item.incident.name??item.incident.location?.label??(location?`Incident near ${location[1].toFixed(4)}, ${location[0].toFixed(4)}`:'Location not reported'),weather,thermal,air:{metrics:air.metrics,smoke:air.smoke},warnings,places,status,
    observedGeometry:['Polygon','MultiPolygon'].includes(item.spatialTruth?.officialPerimeter?.geometry?.type)?item.spatialTruth.officialPerimeter:null,modeledGeometry:item.spatialTruth?.forecastGeometry??null,
    fireDanger:metric('fireDanger','Official fire danger',danger?.fireDanger?.label??null,'',danger,asOf,12*3600000,danger?.fireDanger?.classificationReference??'No official fire-danger classification returned.'),
    nearestIncident:metric('nearestIncident','Nearest known incident record',nearest?.distance??null,'km',{source:'Authorized incident locations',observedAt:nearest?.item.incident.updatedAt??nearest?.item.claim?.validTime?.to},asOf,null,'Point-to-point distance to a known record, not to an active fire front.'),
    windTowardLocation:metric('windToward','Wind toward location',null,'',{},asOf,null,'A wind bearing alone does not establish fire or smoke transport toward this location.')};
  result.changes=physicalChanges({weather,thermal,air,warnings},asOf);return result;
}
export function projectPhysicalWorld({twin,actor,incidentId,world=null,scene=null,asOf=twin?.asOf}) {
  const authorized=rows(twin?.incidents).filter(i=>incidentInScope(actor,i.incident.id));
  const selected=incidentId?authorized.filter(i=>canonicalIncidentId(i.incident.id)===canonicalIncidentId(incidentId)):authorized;
  const stations=stationRecords(world),incidents=selected.map(i=>{
    const result=incidentPhysicalWorld(i,asOf,authorized,scene);
    if(world&&result.location)result.weather=weatherMetrics(stations,asOf,{location:result.location,subjectId:i.incident.id,sourceState:world.sources?.ipmaWeather?.error?'unavailable':world.sources?.ipmaWeather?.state});
    if(world&&result.location){
      const nearby=rows(world.thermalDetections).filter(r=>r.provenance?.synthetic===false&&distanceKm(result.location,r.coordinate)!==null&&distanceKm(result.location,r.coordinate)<=FIRE_SEARCH_POLICY.radiusKm&&timestamp(r.observedAt)>=timestamp(asOf)-FIRE_SEARCH_POLICY.windowHours*3600000).map(r=>({...r,sourceState:world.sources?.firms?.error?'unavailable':world.sources?.firms?.state,product:[r.satellite??r.platform,r.instrument].filter(Boolean).join(' ')||r.product}));
      result.thermal=thermalMetrics(nearby.length?nearby:result.thermal.detections,result.location,asOf,null,world.sources?.firms);
      result.thermalRadiusKm=FIRE_SEARCH_POLICY.radiusKm;
      result.thermal.independentObservationFamilies=[...new Set(result.thermal.detections.map(d=>d.independenceGroup??d.family??d.sourceFamily).filter(Boolean))];
      result.thermal.limitations=[FIRE_SEARCH_POLICY.meaning,world.sources?.firms?.error?'Thermal source failed; retained detections are last known observations.':world.sources?.firms?.state==='stale'?'Latest satellite observations are old; fresh downloads do not make them current.':null].filter(Boolean);
    }
    result.changes=physicalChanges(result,asOf).filter(c=>c.type!=='Fire detection').map(c=>({...c,incidentId:result.incidentId,where:c.where??result.locationLabel}));
    for(const d of result.thermal.detections)result.changes.push({id:d.id,at:d.observedAt,type:'Fire detection',source:d.source,distanceKm:d.distanceKm,where:result.locationLabel,incidentId:result.incidentId,material:true,text:`${d.product??'Thermal'} detection${number(d.distanceKm)!==null?' '+d.distanceKm+' km from the incident point':''}.`,evidence:[d.id]});
    for(const r of result.places.roads.filter(r=>r.statusEvidenceId&&timestamp(r.observedAt)!==null))result.changes.push({id:r.statusEvidenceId,at:r.observedAt,type:'Road',source:r.source,where:r.label??r.name??result.locationLabel,incidentId:result.incidentId,material:true,text:`${r.label??r.name??'Road segment'}: ${r.statusLabel}.`,evidence:[r.statusEvidenceId]});
    if(result.status.value)result.changes.push({at:result.status.observedAt,type:'Official update',source:result.status.sourceName,where:result.locationLabel,incidentId:result.incidentId,material:true,text:`Official incident status reported: ${result.status.value}.`,evidence:[result.status.provenanceRef]});
    result.changes=result.changes.filter(c=>timestamp(c.at)!==null&&timestamp(c.at)<=timestamp(asOf)).sort((a,b)=>timestamp(b.at)-timestamp(a.at)).slice(0,40);
    if(incidentId)result.questions=incidentQuestions(result);
    return result;
  });
  const max=(id,label,low=false)=>{
    const values=incidents.flatMap(i=>i.weather.metrics.filter(m=>m.id===id&&m.value!==null&&m.freshness==='CURRENT').map(m=>({...m,location:i.weather.station?.name??null}))).sort((a,b)=>low?a.value-b.value:b.value-a.value);
    return values[0]?{...values[0],id:`national-${id}`,label,context:`${values[0].location??'Associated station'} · authorized returned stations only`}:metric(`national-${id}`,label,null,id==='humidity'?'%':id==='temperature'?'°C':'km/h',{},asOf);
  };
  const official=incidents.filter(i=>i.status.freshness==='CURRENT'&&i.status.value==='ACTIVE'),warnings=[...new Map(incidents.flatMap(i=>i.warnings.warnings.filter(w=>w.state==='ACTIVE')).map(w=>[w.id,w])).values()];
  const thermalIds=new Map();for(const i of selected)for(const o of measurements(i))if(o.familyClass==='PHYSICAL'&&/thermal|viirs|modis|abi|mtg|firms/i.test(o.family??'')&&timestamp(o.observedAt)>=timestamp(asOf)-3600000&&timestamp(o.observedAt)<=timestamp(asOf))thermalIds.set(o.measurementId??o.id,o);
  const count=(id,label,n,context)=>metric(id,label,n||null,'',{source:'Authorized attributed source records',observedAt:asOf},asOf,null,context);
  // National inventory stays bounded in size. Full fact provenance is returned by the incident query.
  const listMetrics=i=>[...i.weather.metrics,...i.thermal.metrics,i.status,i.warnings.metric,...i.air.metrics,i.fireDanger].map(m=>({id:m.id,label:m.label,value:m.value,unit:m.unit,asOf:m.observedAt,observedAt:m.observedAt,source:m.sourceName,freshness:m.freshness,staleAfterMs:m.staleAfterMs,location:m.location,distanceToSubject:m.distanceToSubject,measurementType:m.measurementType,missingReason:m.missingReason,reason:m.reason,context:m.context,direction:m.direction}));
  const national=!incidentId&&actor?.incidentScopes?.includes('*')?nationalContext(world,asOf):null;
  const summary=[count('activeOfficial','Active official incidents',official.length,'Only fresh explicit official ACTIVE statuses; absent status coverage is unavailable, not zero.'),count('thermalHour','New thermal detections · 1h',thermalIds.size,'Distinct returned measurements, not complete national satellite coverage.'),count('activeWarnings','Active official warnings',warnings.length,'Only explicitly associated current official notices.'),max('gust','Highest observed gust'),max('temperature','Highest temperature'),max('humidity','Lowest humidity',true),metric('worstAQ','Worst observed air quality',null,'',{missingReason:'CAPABILITY_NOT_CONNECTED',limitation:'No comparable observed air-quality station feed is connected.'},asOf,null,'No comparable published station-category scale returned.')];
  const summaryMap=new Map(summary.map(m=>[m.id,m]));for(const m of national?.metrics??[])summaryMap.set(m.id,m);
  if(national){
    const feed=world.sources?.fires,checked=feed?.lastSuccessAt??feed?.fetchedAt,healthy=feed?.state==='current'&&timestamp(checked)!==null&&timestamp(asOf)-timestamp(checked)<=600000;
    summaryMap.set('activeOfficial',metric('activeOfficial','Active official-feed records',healthy?rows(world.fires).filter(r=>r.provenance?.synthetic===false).length:null,'',{source:feed?.origin,measurementType:'DERIVED',basisAt:checked,receivedAt:checked,sourceState:feed?.state,provenanceRef:feed?.rawSourceProductId,definition:{statistic:'Returned records in the active civil-protection occurrence feed'},spatialScope:'PORTUGAL_MAINLAND'},asOf,600000,'ANEPC-derived public records via Fogos.pt / PTData. Feed membership, not a fresh official update on each incident.'));
    const thermal=thermalMetrics(rows(world.thermalDetections).filter(r=>r.provenance?.synthetic===false),null,asOf,null,world.sources?.firms).metrics.find(m=>m.id==='thermal60');
    summaryMap.set('thermalHour',{...thermal,id:'thermalHour',label:'New thermal detections · 1h'});
  }
  const sourceFailures=national?Object.values(world.sources??{}).filter(s=>s.error&&timestamp(s.lastAcquisitionAttemptAt)!==null).map(s=>({id:'source-failure:'+s.id,at:s.lastAcquisitionAttemptAt,type:'System failure',source:s.origin??s.provider,where:'Source coverage',material:true,text:`${s.label??s.id} could not be refreshed. Last known observations may be retained.`,evidence:[s.id]})):[];
  const activity=[...new Map([...incidents.flatMap(i=>i.changes),...sourceFailures].sort((a,b)=>(b.distanceKm??0)-(a.distanceKm??0)).map(c=>[c.id?c.type+':'+c.id+':'+c.at:c.source+':'+c.where+':'+c.at+':'+c.text,c])).values()].sort((a,b)=>timestamp(b.at)-timestamp(a.at)).slice(0,100);
  const result={schemaVersion:'vigia.physical-world.v2',asOf,national,incidents:incidentId?incidents:incidents.map(i=>({incidentId:i.incidentId,asOf,metrics:listMetrics(i),station:i.weather.station,changes:i.changes.slice(0,6)})),summary:[...summaryMap.values()],activity,
    boundary:'Authorized incident context and explicitly labeled national sources. Availability does not prove local coverage.'};
  if(national)result.nationalQuestion=getNationalSituation(result);
  return result;
}
