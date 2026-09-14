import { shell, esc } from '../components.js?v=2.1.0';
import { canonicalMap, emptyTruthState, humanState, objectMeta, objectTitle, technicalDisclosure } from '../canonicalComponents.js?v=3.0.0';
import { availableCount, canonicalIncidents, envelope, incidentAssessment, incidentChangedAt, incidentCoordinate, incidentEnvelope, incidentId, incidentLabel, incidentLocation, operatorText, sectionAvailable, timeLabel, value } from '../canonicalViewModel.js?v=3.0.0';
import { icon } from '../icons.js?v=2.1.0';
import { finiteNumberOrNull } from '../truth.js?v=2.1.0';
import { vigiaSelect } from '../operatorPrimitives.js?v=3.2.0';
import { incidentQuicklook } from '../executiveComponents.js?v=3.0.0';

const rows=input=>Array.isArray(input)?input:[];
const normalizedSearch=input=>String(input??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const stateOf=item=>String(item?.operationalTruth?.classification??item?.incident?.operationalTruth?.classification??item?.incident?.classification??item?.classification??item?.incident?.lifecycleState??item?.incident?.status??item?.evaluation?.state??item?.assessment?.state??item?.state??'NOT_CLASSIFIED').toUpperCase();
const typeOf=item=>String(item?.incident?.type??item?.incident?.incidentType??item?.type??'').trim();
const metadata=(item,key)=>item?.incident?.metadata?.[key]??item?.metadata?.[key];
const toneFor=input=>{const value=String(input??'').toUpperCase();if(/ACTIVE|CRITICAL|FAILED|BLOCK/.test(value))return'critical';if(/CONTAINED|READY|VERIFIED|COMPLETE/.test(value))return'green';if(/MONITORING|OBSERVED/.test(value))return'info';return'warning';};

function relativeAge(input,baseline){const current=Date.parse(input??''),now=Date.parse(baseline??'');if(!Number.isFinite(current)||!Number.isFinite(now))return'';const minutes=Math.max(0,Math.round((now-current)/60000));if(minutes<60)return`${minutes}m ago`;const hours=Math.floor(minutes/60);return hours<48?`${hours}h ago`:`${Math.floor(hours/24)}d ago`;}
const priorityOf=item=>operatorText(item?.incident?.priority?.band??item?.incident?.priority?.label??item?.priority?.band??item?.priority?.label,{missing:'Not assessed'});
const assessmentOf=item=>operatorText(item?.evaluation?.operatorStatement??item?.assessment?.operatorStatement??item?.claim?.proposition??item?.evaluation?.state??item?.state,{missing:'Assessment unavailable'});
const priorityScore=item=>Number(item?.operationalTruth?.priority?.score??item?.incident?.operationalTruth?.priority?.score??item?.incident?.priority?.score??item?.priority?.score??0);
const priorityOrder=(first,second)=>priorityScore(second)-priorityScore(first)||Date.parse(incidentChangedAt(second)??0)-Date.parse(incidentChangedAt(first)??0)||incidentId(first).localeCompare(incidentId(second));

function incidentRows(state,source){
  const query=normalizedSearch(String(state.incidentSearch??'').trim()),status=String(state.incidentStateFilter??'ALL').toUpperCase(),type=String(state.incidentTypeFilter??'ALL'),saved=String(state.incidentSavedFilter??'ALL');
  const result=canonicalIncidents(source).filter(item=>{
    const searchable=normalizedSearch(`${incidentLabel(item)} ${incidentLocation(item)} ${incidentId(item)} ${typeOf(item)}`),classification=stateOf(item),freshness=String(item?.operationalTruth?.axes?.freshness?.state??''),rank=Number(item?.operationalTruth?.priority?.rank??Infinity),attention=rows(item?.humanAttention).some(entry=>entry.state==='ACKNOWLEDGEMENT_REQUIRED'),savedMatch=saved==='ALL'||saved==='NEW_CANDIDATES'&&classification==='DETECTION_CANDIDATE'||saved==='NEEDS_REVALIDATION'&&classification==='NEEDS_REVALIDATION'||saved==='OFFICIAL_VERIFIED'&&classification==='VERIFIED_CURRENT'||saved==='STALE_HIGH_PRIORITY'&&freshness==='STALE'&&rank<=25||saved==='HUMAN_DECISION_DUE'&&attention;
    return(!query||searchable.includes(query))&&(status==='ALL'||classification===status)&&(type==='ALL'||typeOf(item)===type)&&savedMatch;
  });
  if(state.incidentSort==='CHANGED')result.sort((first,second)=>Date.parse(incidentChangedAt(second)??0)-Date.parse(incidentChangedAt(first)??0));
  else result.sort(priorityOrder);
  return result;
}

function savedFilters(state,all){
  const specs=[['NEW_CANDIDATES','New candidates'],['NEEDS_REVALIDATION','Needs revalidation'],['OFFICIAL_VERIFIED','Official / verified'],['STALE_HIGH_PRIORITY','Stale high priority'],['HUMAN_DECISION_DUE','Human decision due']],source={data:{canonicalIncidents:{state:'READY',value:{incidents:all}}}};
  const counts=new Map(specs.map(([id])=>[id,incidentRows({...state,incidentSavedFilter:id,incidentSearch:'',incidentStateFilter:'ALL',incidentTypeFilter:'ALL'},source).length]));
  return`<nav class="incident-saved-filters" aria-label="Saved operational filters"><button data-action="incident-saved-filter:ALL" aria-pressed="${state.incidentSavedFilter==='ALL'}" class="${state.incidentSavedFilter==='ALL'?'is-active':''}">All operational records <strong>${all.length}</strong></button>${specs.map(([id,label])=>`<button data-action="incident-saved-filter:${id}" aria-pressed="${state.incidentSavedFilter===id}" class="${state.incidentSavedFilter===id?'is-active':''}">${label} <strong>${counts.get(id)}</strong></button>`).join('')}</nav>`;
}

function materialChanges(source,items){
  const twin=value(source,'canonicalIncidents')??{},projection=value(source,'reliabilityProjection')??{};
  const identifiers=new Set(items.map(incidentId).flatMap(id=>[id,id.replace(/^incident:/,'')]));
  return[...rows(twin.transitions),...rows(projection.events)].filter(item=>{const keys=[item?.incidentId,item?.entityId,...rows(item?.correlationKeys)].filter(Boolean).map(String);return!identifiers.size?false:!keys.length?items.length>0:keys.some(key=>identifiers.has(key)||identifiers.has(key.replace(/^incident:/,'')));})
    .map((item,index)=>({item,index,at:Date.parse(item?.at??item?.changedAt??item?.observedAt??item?.updatedAt??item?.lastSeenAt??item?.receivedAt??''),explanation:item?.whyItMatters??item?.explanation??item?.summary??item?.basis??null}))
    .filter(entry=>Number.isFinite(entry.at)&&typeof entry.explanation==='string'&&entry.explanation.trim())
    .sort((first,second)=>Number.isFinite(second.at)&&Number.isFinite(first.at)?second.at-first.at:first.index-second.index)
    .slice(0,6)
    .map(entry=>({...entry.item,__operatorChangeAt:new Date(entry.at).toISOString(),__operatorChangeExplanation:entry.explanation}));
}

function statusOptions(items,selected){
  const counts=new Map();for(const item of items){const key=stateOf(item);if(key)counts.set(key,(counts.get(key)??0)+1);}
  return[{value:'ALL',label:'All statuses',count:items.length},...[...counts.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([value,count])=>({value,label:operatorText(value),count}))];
}

function typeOptions(items,selected){
  const counts=new Map();for(const item of items){const key=typeOf(item);if(key)counts.set(key,(counts.get(key)??0)+1);}
  return[{value:'ALL',label:'All incident types',count:items.length},...[...counts.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([value,count])=>({value,label:operatorText(value),count}))];
}

function incidentTable(items,selected,generatedAt,{query='',total=0}={}){
  if(!items.length){const target=String(query??'').trim();return`<div class="incident-no-match">${emptyTruthState(target?`No incidents match “${target}”`:'No incidents match the active filters',`0 matching · ${total} in scope. Canonical incidents are never synthesized to fill an empty result.`)}<div><button class="button button--ghost" data-action="clear-incident-search" ${target?'':'disabled'}>Clear search</button><button class="button button--ghost" data-action="reset-incident-filters">Reset all filters</button></div></div>`;}
  return`<div class="incident-table-scroll" data-scroll-key="incidents-table"><table class="incident-table">
    <thead><tr><th scope="col">Incident</th><th scope="col">Location</th><th scope="col">Operational class</th><th scope="col">Verification assessment</th><th scope="col">Last change</th><th scope="col">Priority</th></tr></thead>
    <tbody>${items.map(item=>{const id=incidentId(item),active=id===incidentId(selected),updated=incidentChangedAt(item),priority=item?.operationalTruth?.priority??{},sourceStrength=Number(item?.independence?.distinctFamilyCount??0),attention=rows(item?.humanAttention).some(entry=>entry.state==='ACKNOWLEDGEMENT_REQUIRED'),material=item?.decisionSupport?.materialChange;return`<tr class="incident-table__row ${active?'is-selected':''}" data-action="inspect-incident:${esc(id)}" tabindex="0" aria-selected="${active}">
      <th scope="row"><div class="incident-identity"><span class="incident-symbol incident-symbol--${toneFor(stateOf(item))}">${icon('flame',15)}</span><span><strong>${esc(incidentLabel(item))}</strong><small>${esc(operatorText(typeOf(item),{missing:'Not reported'}))}</small></span></div></th>
      <td><strong>${esc(incidentLocation(item))}</strong><small>${esc(item?.geolocationQuality?.state?`${operatorText(item.geolocationQuality.state)} · ${item.geolocationQuality.method??''}`:item?.incident?.operatorIdentity?.district??'')}</small></td><td>${humanState(stateOf(item))}</td><td><span class="assessment-copy">${esc(assessmentOf(item))}</span><small>${sourceStrength} independent ${sourceStrength===1?'family':'families'}${attention?' · human decision due':''}</small></td><td><time datetime="${esc(material?.at??updated??'')}">${esc(timeLabel(material?.at??updated))}</time><small>${esc(material?.summary??(generatedAt&&updated?relativeAge(updated,generatedAt):''))}</small></td><td><strong>${priority.rank?`#${priority.rank} · `:''}${esc(priorityOf(item))}</strong><small title="${esc(priority.explanation??'')}">${esc(priority.explanation??'Priority factors unavailable')}</small></td>
    </tr>`;}).join('')}</tbody>
  </table></div>`;
}

function pageControls(page,totalPages){
  const candidates=[1,page-1,page,page+1,totalPages].filter(value=>value>=1&&value<=totalPages),pages=[...new Set(candidates)].sort((a,b)=>a-b),parts=[];let prior=0;
  for(const value of pages){if(prior&&value-prior>1)parts.push('<span aria-hidden="true">…</span>');parts.push(`<button data-action="incident-page:${value}" ${value===page?'aria-current="page" class="is-current"':''} aria-label="Incident page ${value}">${value}</button>`);prior=value;}
  return`<div class="pagination" aria-label="Incident pages"><button class="is-previous" data-action="incident-page:${Math.max(1,page-1)}" ${page===1?'disabled':''} aria-label="Previous page">${icon('chevron',14)}</button>${parts.join('')}<button data-action="incident-page:${Math.min(totalPages,page+1)}" ${page===totalPages?'disabled':''} aria-label="Next page">${icon('chevron',14)}</button></div>`;
}

function selectedSummary(selected,detail){
  if(!selected)return'';
  const canonical=incidentId(detail)===incidentId(selected)?detail:selected;
  return`<div class="incident-map-summary"><span><small>Selected incident</small><strong>${esc(incidentLabel(canonical))}</strong></span>${humanState(incidentAssessment(canonical))}<button class="text-button" data-action="open-incident-workspace:${esc(incidentId(canonical))}">Open detail ${icon('arrow',13)}</button></div>`;
}

function changeStream(changes){
  if(!changes.length)return emptyTruthState('No material changes','The current operational view returned no recent material update.');
  return`<ol class="incident-change-list">${changes.map(item=>`<li><i aria-hidden="true"></i><span><strong>${esc(objectTitle(item,'Material change'))}</strong><p>${esc(item.__operatorChangeExplanation)}</p><time datetime="${esc(item.__operatorChangeAt)}">${esc(timeLabel(item.__operatorChangeAt))}</time></span></li>`).join('')}</ol>`;
}

export function renderIncidents(state){
  const source=envelope(state,'incidents'),all=canonicalIncidents(source),truth=value(source,'operationalTruth')??{},filtered=incidentRows(state,source),count=availableCount(source,'canonicalIncidents',all),pageSize=7,totalPages=Math.max(1,Math.ceil(filtered.length/pageSize)),page=Math.min(totalPages,Math.max(1,Number(state.incidentPage)||1)),pageRows=filtered.slice((page-1)*pageSize,page*pageSize),selected=all.find(item=>incidentId(item)===String(state.selectedIncidentId??''))??null,selectedOutside=Boolean(selected&&!filtered.some(item=>incidentId(item)===incidentId(selected))),start=filtered.length?(page-1)*pageSize+1:0,end=Math.min(page*pageSize,filtered.length);
  const detailSource=incidentEnvelope(state,'detail'),detail=value(detailSource,'canonicalIncident'),detailWork=rows(value(detailSource,'governedWork')),scene=value(source,'mapScene'),mapAvailable=sectionAvailable(source,'mapScene')&&Boolean(scene),changes=materialChanges(source,filtered),types=[...new Set(all.map(typeOf).filter(Boolean))],activeFilterCount=[String(state.incidentSearch??'').trim(),state.incidentStateFilter!=='ALL',state.incidentTypeFilter!=='ALL',state.incidentSort!=='IDENTITY',state.incidentSavedFilter!=='ALL'].filter(Boolean).length,mapItems=selectedOutside?[...filtered,selected]:filtered;
  const body=`<section class="incidents-route final-white-route">
    <div class="incidents-toolbar panel-surface" data-vqa="incidents.filters">
      <label class="search-field">${icon('search',17)}<span class="sr-only">Search incidents</span><input type="search" data-input="incident-search" value="${esc(state.incidentSearchDraft??state.incidentSearch??'')}" placeholder="Search by incident, place, or ID" aria-keyshortcuts="Escape"><button type="button" class="search-field__clear" data-action="clear-incident-search" aria-label="Clear incident search" ${String(state.incidentSearchDraft??state.incidentSearch??'')?'':'hidden'}>${icon('close',14)}</button></label>
      ${vigiaSelect({id:'incident-filter',label:'Status',value:String(state.incidentStateFilter??'ALL').toUpperCase(),options:statusOptions(all),iconName:'filter',openId:state.openSelectId})}
      ${vigiaSelect({id:'incident-type',label:'Incident type',value:String(state.incidentTypeFilter??'ALL'),options:typeOptions(all),iconName:'flame',disabled:!types.length,openId:state.openSelectId})}
      ${vigiaSelect({id:'incident-sort',label:'Sort by',value:state.incidentSort,options:[{value:'IDENTITY',label:'Canonical priority'},{value:'CHANGED',label:'Latest update'}],iconName:'sync',openId:state.openSelectId})}
      <button class="incidents-filter-reset" data-action="reset-incident-filters" ${activeFilterCount?'':'disabled'}>${activeFilterCount?`${activeFilterCount} active · Clear all`:'Default filters'}</button>
    </div>
    ${savedFilters(state,all)}
    ${selectedOutside?`<section class="incident-filter-notice" role="status"><span><strong>Selected incident is outside the current filter</strong><small>${esc(incidentLabel(selected))} remains selected and explicitly shown on the map.</small></span><button class="text-button" data-action="show-selected-incident">Show selected</button><button class="text-button" data-action="clear-incident-selection">Clear selection</button></section>`:''}
    <div class="incidents-layout">
      <section class="incident-inventory panel-surface" data-vqa="incidents.table"><header><div><h2>Incident inventory</h2><p>${Number(truth.activeCount??0)} verified current · ${Number(truth.counts?.DETECTION_CANDIDATE??0)} detection candidates · ${Number(truth.counts?.NEEDS_REVALIDATION??0)} need revalidation</p></div><strong>${esc(count)} records</strong></header>${incidentTable(pageRows,selected,source?.generatedAt,{query:state.incidentSearch,total:all.length})}<footer><span>${start}–${end} of ${filtered.length} records</span>${pageControls(page,totalPages)}</footer></section>
      <aside class="incidents-side">
        <section class="incidents-map panel-surface" data-vqa="incidents.map"><header><div><h2>Incident Summary</h2><p>Observed geography and nearby incident context</p></div><span data-map-health>${esc(operatorText(scene?.currentness?.state??'LOADING'))}</span></header><div class="incidents-map__canvas">${mapAvailable?canonicalMap({state,incidents:mapItems,selected,thermal:state.mapThermal,label:'Selected incident and nearby context',mapScene:scene,scope:'INCIDENTS',vqa:'incidents.map-canvas'}):emptyTruthState('Incident map unavailable','The incident scene is unavailable; the browser does not reconstruct it.')}</div>${selectedSummary(selected,detail)}</section>
        ${state.quicklookRoute==='incidents'?incidentQuicklook({incident:selected,detail,work:detailWork,scene,route:'incidents'}):`<section class="incident-changes panel-surface" data-vqa="incidents.changes"><header><div><h2>Latest changes</h2><p>Material updates across the current scope</p></div><strong>${changes.length}</strong></header>${changeStream(changes)}</section>`}
      </aside>
    </div>
    ${technicalDisclosure('Incidents projection details',[['Projection state',source?.state],['Generated at',source?.generatedAt],['Returned incidents',count],['Mapped incidents',all.filter(incidentCoordinate).length]])}
  </section>`;
  return shell('incidents',body,{pageClass:'final-white-route-page'});
}
