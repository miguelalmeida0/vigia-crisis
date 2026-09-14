import {DetailRows,TechnicalDetails} from './measurement-panel.js';
import {humanDistance,FacilityDetail,facilityTitle} from './facility-detail.js';
import { value } from '../../canonicalViewModel.js';
import { e,button } from './html.js';
import { panel } from './section-panel.js';
import { measured } from '../data/field.js';
import { FieldFeed } from './field.js';

export const briefingFor=vm=>value(vm.source,'incidentIntelligence');
const kinds={SETTLEMENT:'Settlement',ROAD_REFERENCE:'Road reference point',HOSPITAL:'Hospital',FIRE_STATION:'Fire station',WATER_POINT:'Water point',SHELTER:'Shelter',EMS_BASE:'Medical base',POLICE:'Police',PUBLIC_INSTITUTION:'Public institution',CIVIL_PROTECTION:'Civil protection',AIR_SUPPORT_BASE:'Air support base',POWER_INFRASTRUCTURE:'Power infrastructure'};
const distance=row=>Number.isFinite(row.distanceFromPerimeterM)?`${(row.distanceFromPerimeterM/1000).toFixed(2)} km from perimeter`:`${(row.distanceFromPointM/1000).toFixed(2)} km from incident point`;
const age=seconds=>!Number.isFinite(seconds)?'Observation age unknown':seconds<60?'less than 1 min':seconds<3600?`${Math.floor(seconds/60)} min`:seconds<86400?`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`:`${Math.floor(seconds/86400)}d ${Math.floor(seconds%86400/3600)}h`;

export function BriefingChanges(briefing){
  if(!briefing?.changes?.length)return '';
  return FieldFeed(briefing.changes.map(c=>({at:c.to,type:'Weather',source:c.source,text:`${c.label}: ${c.previous} → ${c.current} ${c.unit} · ${c.delta>0?'+':''}${c.delta} in ${c.minutes} min.`,where:'Change between comparable source observations'})),{title:'Meaningful changes',subtitle:'Source measurements; no fire-spread inference.',limit:3,id:'intelligence-changes'});
}

export function NearbyIntelligence(briefing){
  if(!briefing)return '';
  const all=briefing.exposure?.relationships??[],nearest=all.filter(r=>r.rank===1);
  const row=r=>`<li><div><strong>${e(r.feature.name)}</strong><small>${e(kinds[r.feature.kind]??r.feature.kind)} · ${e(distance(r))}</small></div>${button('Details','intelligence-place',{tone:'small-btn',extra:`data-id="${e(r.feature.id)}" aria-label="Details for ${e(r.feature.name)}"`})}</li>`;
  const perimeter=briefing.fire?.perimeter;
  const geometry=Number.isFinite(perimeter?.areaHa)?`<p class="intelligence-geometry"><strong>${e(perimeter.areaHa.toFixed(1))} ha</strong> · ${e(perimeter.perimeterKm.toFixed(2))} km perimeter · observed ${e(measured(perimeter.current.observedAt))}${Number.isFinite(perimeter.areaDeltaHa)?` · ${e(perimeter.areaDeltaHa>0?'+':'')}${e(perimeter.areaDeltaHa.toFixed(1))} ha since ${e(measured(perimeter.previous.observedAt))}`:''}</p>`:'';
  return panel('Nearby mapped places',`${geometry}${nearest.length?`<ul class="intelligence-nearby" data-vqa="intelligence-nearby">${nearest.slice(0,5).map(row).join('')}</ul>${nearest.length>5?`<details><summary>More mapped categories · ${nearest.length-5}</summary><ul class="intelligence-nearby">${nearest.slice(5).map(row).join('')}</ul></details>`:''}`:`<div class="response-coverage" role="status"><p>Mapped context is unavailable for this selection.</p>${button('Retry mapped context','refresh-runtime',{tone:'small-btn',ico:'refresh'})}</div>`}<p class="intelligence-context-note">Mapped proximity, not confirmed exposure. ${briefing.exposure?.search?.truncated?'Results use a bounded candidate cohort. ':''}${perimeter?.areaHa===null||!perimeter?'Fire size and movement unavailable without an attributable perimeter.':''}</p>`,{ico:'pin',cls:'intelligence-context-panel',sub:'Nearest returned reference point per category · 25 km search.',action:button('Sources & gaps','intelligence-sources',{tone:'small-btn'})});
}

export function IntelligenceSources(briefing){
  if(!briefing)return '<p>No incident intelligence has been returned for this selection.</p>';
  return `<div class="intelligence-source-details ux-trust" data-vqa="intelligence-sources"><section><h3>Information coverage</h3>${briefing.coverage.map(c=>TechnicalDetails(c.label+' · '+c.state.toLowerCase().replaceAll('_',' '),`<p>${e(c.reason)}</p>`)).join('')}</section><section><h3>Providers and age</h3>${briefing.sources.sources.map(s=>TechnicalDetails(`${s.name} · ${s.status.toLowerCase().replaceAll('_',' ')}${s.freshness==='STALE'?' · older observations':''}`,DetailRows([['Provider',s.provider??'Not connected'],['Data',s.dataClass?.toLowerCase()],['Observed',`${measured(s.lastObservationAt)||'Not supplied'} · ${age(s.observationAgeSeconds)}`],['Received by Vigia',measured(s.lastIngestedAt)||'Not received'],['Expected update',s.cadence??'Not specified'],['Stale after',Number.isFinite(s.staleAfterSeconds)?age(s.staleAfterSeconds):'No live measurement expiry'],['Source reference',s.provenanceRef??'Not supplied']])+`<p>${e(s.limitation??s.coverage??'Coverage not established')}</p>${s.retainedLastGood?'<p>Last valid records retained; the provider is currently unavailable.</p>':''}`)).join('')}</section>${briefing.conflictingMetrics.length?`<section><h3>Conflicting readings</h3>${briefing.conflictingMetrics.map(m=>TechnicalDetails(m.label,DetailRows(m.conflicts.map(c=>[c.source,`${c.value} ${c.unit} · ${measured(c.observedAt)}`])))).join('')}</section>`:''}</div>`;

}

export function IntelligencePlace(briefing,id){
  const row=briefing?.exposure?.relationships?.find(r=>r.feature.id===id);if(!row)return '<p>This mapped record is no longer in the selected incident context.</p>';
  const f=row.feature;
  if(f.canonicalIntelligence)return `<h3>${e(facilityTitle(f))}</h3>${FacilityDetail({...f,distanceKm:row.distanceFromPointM/1000})}`;
  const km=Number.isFinite(row.distanceFromPerimeterM)?row.distanceFromPerimeterM/1000:row.distanceFromPointM/1000;
  return `<div class="ux-trust place-sheet"><h3>${e(/^Mapped\s/i.test(f.name)?kinds[f.kind]??'Place':f.name)}</h3><p>${e(kinds[f.kind]??f.kind)}</p><p class="place-distance"><strong>${e(humanDistance(km))} away</strong></p><p>Straight-line distance from the ${Number.isFinite(row.distanceFromPerimeterM)?'reported perimeter':'incident point'}.</p><section class="ux-limits"><h3>What is confirmed?</h3><p>This place appears in the map source. Proximity does not confirm that it is affected, open or accessible.</p></section>
  ${TechnicalDetails('Source and location details',DetailRows([['Provider',f.source],['Mapped geometry',f.geometryRole?.toLowerCase().replaceAll('_',' ')],['Observed',measured(f.observedAt)||'Not supplied by the source'],['Received by Vigia',measured(f.receivedAt)],['Calculated by Vigia',measured(briefing.exposure.calculatedAt)],['Method','PostGIS WGS84 geography · distance in metres'],['Source record',f.sourceRecordId],['Archive checksum',f.provenanceRef]])+`<p>${e(f.limitation)}</p><p>${e(briefing.exposure.limitation)}</p>`)}</div>`;

}
