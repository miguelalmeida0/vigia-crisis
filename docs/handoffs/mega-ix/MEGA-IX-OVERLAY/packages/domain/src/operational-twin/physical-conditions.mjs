import { rows, number, timestamp, coordinate, distanceKm, compass, metric, trend } from './physical-metric.mjs';

const WEATHER_TTL=3*3600000; // Existing IPMA station-source freshness policy.
export const THERMAL_RETENTION_HOURS=72;
const THERMAL_TTL=90*60000; // Existing operational evidence window, not fire duration.
const latest=items=>[...items].sort((a,b)=>(timestamp(b.observedAt)??-Infinity)-(timestamp(a.observedAt)??-Infinity))[0];
// Request-local preparation reuses station history across locations, never
// across source refreshes or clocks. Location and subject are bound per call.
export function weatherProjection(records,asOf) {
  const now=timestamp(asOf),byStation=new Map(),history=new Map(),times=new Map();
  for(const r of rows(records)) {
    const at=timestamp(r.observedAt??r.validAt);
    if(r.modelRun||r.model||r.measurementType==='MODELED'||r.weatherRole==='FORECAST_CONTEXT_NOT_FIRE_EVIDENCE'||at===null||at>now)continue;
    const sample={...r,observedAt:r.observedAt??r.validAt,
      windSpeedKph:number(r.windSpeedKph)??number(r.wind?.speedKph),gustKph:/daily|24.?h/i.test(r.gustStatistic??r.measurementDefinitions?.gust?.statistic??'')?null:number(r.gustKph)??number(r.windGustKph),windDirection:r.windDirection??r.wind?.direction};
    times.set(sample,at);
    const key=(sample.source??'')+':'+(sample.stationId??sample.coordinate?.join(',')??'unknown');
    if(!byStation.has(key)||at>times.get(byStation.get(key)))byStation.set(key,sample);
    if(sample.stationId&&!Number.isNaN(sample.stationId)){
      if(!history.has(sample.stationId))history.set(sample.stationId,new Map());
      const sources=history.get(sample.stationId);
      if(!sources.has(sample.source))sources.set(sample.source,[]);
      sources.get(sample.source).push(sample);
    }
  }
  const usable=s=>['temperatureC','windSpeedKph','humidityPercent'].some(k=>number(s[k])!==null);
  const candidates=[...byStation.values()].map(sample=>({sample,at:times.get(sample),usable:usable(sample),current:usable(sample)&&now-times.get(sample)<=WEATHER_TTL&&!/stale|failed|unavailable/i.test(sample.sourceState??'')}));
  return (options={})=>weatherAtLocation(candidates,history,asOf,options);
}
export function weatherMetrics(records,asOf,options={}) {
  return weatherProjection(records,asOf)(options);
}
function weatherAtLocation(candidates,history,asOf,{location=null,subjectId=null,sourceState=null}={}) {
  const selected=candidates.map(candidate=>({...candidate,distance:distanceKm(location,candidate.sample.coordinate)??candidate.sample.distanceKm}))
    .sort((a,b)=>Number(b.current)-Number(a.current)||Number(b.usable)-Number(a.usable)||(a.distance??Infinity)-(b.distance??Infinity)||b.at-a.at)[0];
  const station=selected?{...selected.sample,subjectId,distanceKm:selected.distance}:undefined;
  const same=history.get(station?.stationId)?.get(station?.source)??[];
  const local=coordinate(location)&&coordinate(station?.coordinate)&&location.every((v,i)=>v===station.coordinate[i]);
  const context=station?`${station.stationName??station.stationId??'Reporting station'}${number(station.distanceKm)!==null?` · ${station.distanceKm} km away`:''} · ${local?'measured at this location':'regional context; conditions at the incident may differ'}.`:'No suitable station observation was returned for this location.';
  const definitions=[['temperature','Temperature','temperatureC','°C'],['wind','Wind','windSpeedKph','km/h'],['gust','Wind gusts','gustKph','km/h'],['humidity','Humidity','humidityPercent','%'],['rain','Rain','precipitationMm','mm']];
  const metrics=definitions.map(([id,label,key,unit])=>{
    let v=number(station?.[key]);if(v===-99||(['wind','gust','rain'].includes(id)&&v<0)||(id==='humidity'&&(v<0||v>100)))v=null;
    const ipma=/IPMA/i.test(station?.source??'');
    const known={temperature:{rawField:'temperatura',statistic:'hourly mean',periodMinutes:60,heightM:1.5},humidity:{rawField:'humidade',statistic:'hourly mean',periodMinutes:60,heightM:1.5},wind:{rawField:'intensidadeVentoKM',statistic:'wind speed; averaging interval not specified',periodMinutes:null,heightM:10},rain:{rawField:'precAcumulada',statistic:'accumulation',periodMinutes:60,heightM:1.5},gust:{rawField:null,statistic:null,missingReason:'FIELD_NOT_PROVIDED'}};
    const definition=station?.measurementDefinitions?.[id]??(ipma?known[id]:{statistic:station?.[id+'Statistic']??'Observation interval not supplied',periodMinutes:null});
    const missingReason=station&&v===null?'FIELD_NOT_PROVIDED':sourceState==='unavailable'?'SOURCE_FAILED':'NO_SUITABLE_LOCAL_OBSERVATION';
    const limitation=id==='gust'&&v===null?'Gusts are not provided as a current measurement by this observation source.':null;
    // Cross-provider disagreement requires identical station, location, time and declared measurement definition.
    const comparable=rows(station?.comparisonObservations).filter(s=>station?.measurementDefinitions?.[id]&&JSON.stringify(s.measurementDefinitions?.[id])===JSON.stringify(station.measurementDefinitions[id]));
    const currentReports=[...same.filter(s=>s.observedAt===station?.observedAt),...comparable].filter(s=>number(s[key])!==null),conflicting=new Set(currentReports.map(s=>s[key])).size>1;
    const conflicts=conflicting?currentReports.map(s=>({value:s[key],unit,observedAt:s.observedAt,receivedAt:s.receivedAt??null,source:s.source,provenanceRef:s.provenance?.rawSourceProductId??s.id})):[];
    const m=metric(id,label,v,unit,{...station,conflicting,conflicts,sourceState:station?.sourceState??sourceState,subjectId,definition,missingReason,limitation,measurementType:local?'OBSERVED_LOCAL':'OBSERVED_REGIONAL',spatialScope:local?'AT_SOURCE_LOCATION':'REGIONAL_CONTEXT'},asOf,WEATHER_TTL,context);
    m.trend=m.value===null?null:trend(same,key,asOf);return m;
  });
  const degrees=number(station?.windDirectionDeg),direction=compass(degrees)??(/^(N|NE|E|SE|S|SW|W|NW)$/.test(station?.windDirection)?station.windDirection:null);
  metrics.push(metric('windDirection','Wind from',direction?`${direction}${degrees!==null?` · ${degrees}°`:''}`:null,'',{...station,subjectId,measurementType:local?'OBSERVED_LOCAL':'OBSERVED_REGIONAL'},asOf,WEATHER_TTL,context));
  metrics.find(m=>m.id==='wind').direction=direction;
  const indexed=Object.fromEntries(metrics.map(m=>[m.id,m]));
  return {location,temperature:indexed.temperature,wind:indexed.wind,gust:indexed.gust,humidity:indexed.humidity,precipitation:indexed.rain,observedAt:station?.observedAt??null,stationDistance:station?.distanceKm??null,freshness:indexed.wind.freshnessState,suitability:indexed.wind.suitability,limitations:[context],
    station:station?{id:station.stationId,name:station.stationName??station.stationId??null,coordinate:station.coordinate??null,distanceKm:station.distanceKm??null,source:station.source,observedAt:station.observedAt,receivedAt:station.receivedAt??null}:null,metrics};
}
export function thermalMetrics(records,location,asOf,independentFamilies=null,coverage=null) {
  const now=timestamp(asOf), dated=rows(records).filter(r=>r.source&&timestamp(r.observedAt)!==null&&timestamp(r.observedAt)<=now);
  // Prefer original measurement identity; never count a transport copy twice.
  const detections=[...new Map(dated.map(r=>[r.measurementId??`${r.independenceGroup??r.product??r.instrument??r.sourceFamily??r.source}:${r.observedAt}:${r.coordinate}`,{...r,measurementType:'OBSERVED_NEARBY',distanceKm:distanceKm(location,r.coordinate),definition:{sensor:r.product??r.instrument??null,pixelFootprintKm:r.scanKm&&r.trackKm?[r.scanKm,r.trackKm]:null,nominalResolutionKm:r.nominalResolutionKm??null}}])).values()];
  const retainedHistory=detections.splice(0,detections.length,...detections.filter(d=>now-timestamp(d.observedAt)<=THERMAL_RETENTION_HOURS*3600000));
  const last=latest(detections),near=detections.map(r=>({...r,distance:distanceKm(location,r.coordinate)})).filter(r=>r.distance!==null).sort((a,b)=>a.distance-b.distance)[0];
  const context='Thermal observations are not a fire front or official fire confirmation.';
  const metrics=[metric('thermalTime','Latest thermal detection',last?.observedAt??null,'',last,asOf,THERMAL_TTL,context),metric('thermalLatestDistance','Distance to latest detection',last?.distanceKm??null,'km',last,asOf,THERMAL_TTL,context),metric('thermalDistance','Nearest thermal detection',near?.distance??null,'km',near,asOf,THERMAL_TTL,context),metric('frp','Fire radiative power',number(last?.frpMw),'MW',last,asOf,THERMAL_TTL,context),metric('thermalProduct','Satellite / product',last?.product??null,'',last,asOf,THERMAL_TTL,context)];
  for(const minutes of [30,60,180]){
    const recent=detections.filter(r=>timestamp(r.observedAt)>=now-minutes*60000);
    // A retained positive cohort is a lower bound, not proof of complete coverage or zero detections.
    const checked=timestamp(coverage?.lastSuccessAt),healthy=checked!==null&&checked<=now&&now-checked<=THERMAL_TTL&&!coverage?.error&&!/unavailable|failed|not_configured/i.test(coverage?.state??'');
    metrics.push(metric(`thermal${minutes}`,`Thermal detections · ${minutes===60?'1h':minutes===180?'3h':'30m'}`,healthy?recent.length:recent.length||null,'',{source:last?.source??coverage?.origin??'Thermal source',measurementType:'DERIVED',basisAt:healthy?coverage.lastSuccessAt:last?.observedAt,receivedAt:coverage?.lastSuccessAt,sourceState:healthy?'current':coverage?.state,missingReason:coverage?.error?'SOURCE_FAILED':'NO_MATCHING_RECORD',transformation:`Deduplicated returned observations in the preceding ${minutes} minutes.`},asOf,THERMAL_TTL,'Returned detections only. A zero does not establish absence of fire or complete satellite coverage.'));
  }
  metrics.push(metric('independentFamilies','Independent physical families',number(independentFamilies),'',{source:'Existing evidence independence contract',observedAt:asOf},asOf,null,'Qualifying families; providers and transport copies are not independent witnesses.'));
  return {metrics,detections,retainedHistory,expiryPolicy:{lastKnownHours:THERMAL_RETENTION_HOURS,currentMinutes:THERMAL_TTL/60000},latestThermalDetection:last??null,nearestDetection:near??null,trend:{currentHour:detections.filter(d=>timestamp(d.observedAt)>=now-3600000).length,previousHour:detections.filter(d=>timestamp(d.observedAt)>=now-7200000&&timestamp(d.observedAt)<now-3600000).length,basis:'Returned observation counts; changes in satellite sampling can change the count without a change in fire.'}};
}
export function airMetrics(records,location,asOf) {
  const observed=rows(records).filter(r=>r.kind==='OBSERVED_AIR_QUALITY'&&!r.model&&timestamp(r.observedAt)!==null&&timestamp(r.observedAt)<=timestamp(asOf)),sample=latest(observed),model=latest(rows(records).filter(r=>r.kind==='MODELLED_SMOKE'&&r.model));
  const metrics=[['pm25','PM2.5','pm25UgM3'],['pm10','PM10','pm10UgM3'],['ozone','Ozone','ozoneUgM3']].map(([id,label,key])=>{
    const v=number(sample?.[key]),m=metric(id,label,v!==null&&v>=0?v:null,'µg/m³',{...sample,measurementType:'OBSERVED_REGIONAL',distanceKm:distanceKm(location,sample?.coordinate),missingReason:sample?'FIELD_NOT_PROVIDED':'CAPABILITY_NOT_CONNECTED',definition:{pollutant:label,averagingPeriod:sample?.averagingPeriod??'Not supplied'}},asOf,null,`${sample?.stationName??'No observed air-quality station connected'} · Observed air quality, not modelled smoke.`);
    m.trend=sample?.stationId&&m.value!==null?trend(observed.filter(r=>r.stationId===sample.stationId&&r.source===sample.source),key,asOf):null;return m;
  });
  metrics.push(metric('aqCategory','Air quality',sample?.classification?.reference?sample.classification.label:null,'',{...sample,missingReason:sample?'FIELD_NOT_PROVIDED':'CAPABILITY_NOT_CONNECTED'},asOf,null,sample?.classification?.reference??'No observed air-quality station and published classification returned.'));
  metrics.push(metric('aqDistance','Distance to AQ station',distanceKm(location,sample?.coordinate),'km',sample,asOf,null,sample?.stationName??''));
  return {metrics,smoke:metric('smoke','Modelled smoke',model?.plumeDirection??null,'',model,asOf,null,model?`${model.model} · ${model.limitation??'Modelled, not observed.'}`:'No admitted smoke model returned.'),observed};
}
export function warningMetrics(records,asOf) {
  const now=timestamp(asOf), valid=rows(records).filter(r=>r.authority&&r.official===true&&r.universe!=='EXERCISE'&&(timestamp(r.issuedAt)===null||timestamp(r.issuedAt)<=now));
  const warnings=valid.map(r=>{const from=timestamp(r.effective),until=timestamp(r.expires);return {...r,state:r.cancelled?'CANCELLED':r.superseded?'SUPERSEDED':until!==null&&until<=now?'EXPIRED':from!==null&&from>now?'SCHEDULED':from!==null&&until!==null?'ACTIVE':'UNKNOWN'};});
  const active=warnings.filter(w=>w.state==='ACTIVE'),last=latest(warnings.map(w=>({...w,observedAt:w.issuedAt??w.observedAt,source:w.authority})));
  return {warnings,metric:metric('warnings','Active official warnings',active.length||null,'',last,asOf,6*3600000,'Only notices explicitly associated with this incident; no notice is not proof of no warning.')};
}
export function placeMetrics(assets,roads,asOf) {
  const groups=['INSIDE_KNOWN_EXPOSURE','NEAR_KNOWN_EXPOSURE','INSIDE_MODELLED_EXPOSURE','STATUS_UNKNOWN'];
  const labels=['Inside known exposure','Near known exposure','Inside modelled exposure','Exposure unknown'];
  const unique=xs=>[...new Map(rows(xs).filter(r=>r.id).map(r=>[r.id,r])).values()];
  const places=unique(assets).map(r=>({...r,exposureState:groups.includes(r.exposureState)&&r.exposureBasis?r.exposureState:'STATUS_UNKNOWN'}));
  const roadRows=unique(roads).map(r=>({...r,statusLabel:({CLOSED:'Known closed',RESTRICTED:'Known restricted',HAZARD_EXPOSED:'Hazard-exposed',NO_KNOWN_RESTRICTION:'No known restriction'})[r.statusEvidenceId?r.state:null]??'Status unknown'}));
  const record=items=>{const dated=items.filter(r=>r.source&&timestamp(r.observedAt)!==null);const at=dated.map(r=>r.observedAt).sort()[0];return{source:[...new Set(dated.map(r=>r.source))].join(' ')||null,observedAt:at,measurementType:'DERIVED',basisAt:at,missingReason:'CAPABILITY_NOT_CONNECTED'};};
  return {places:places.slice(0,12),roads:roadRows.slice(0,12),metrics:groups.map((g,i)=>metric(`exposure${i}`,labels[i],places.length?places.filter(p=>p.exposureState===g).length:null,'places',record(places),asOf,null,'Returned place inventory; oldest attributable source time. Nearby mapped places are not automatically threatened.')),
    roadMetrics:['Known closed','Known restricted','Hazard-exposed'].map((label,i)=>metric(`road${i}`,label,roadRows.some(r=>r.statusLabel!=='Status unknown')?roadRows.filter(r=>r.statusLabel===label).length:null,'roads',record(roadRows.filter(r=>r.statusEvidenceId)),asOf,null,'Counts cover returned status records only; oldest attributable source time. No safe route is inferred.'))};
}
