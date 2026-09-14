import { shell, metricCell, badge, button, esc } from '../components.js?v=2.1.0';
import { tileMap } from '../map.js?v=2.1.0';
import { portugalEvents, preventionFindings, eventTone, eventStatus, ageLabel, sourceRows, openEvidenceNeeds } from '../viewModel.js?v=2.1.0';
import { icon } from '../icons.js?v=2.1.0';
import { finiteNumberOrNull } from '../truth.js?v=2.1.0';
import { overviewIntelligence } from '../intelligenceView.js?v=2.1.0';

function measuredOr(value,fallback){return finiteNumberOrNull(value)??fallback;}
function needsReview(finding){return measuredOr(finding.reviewSummary?.count,null)===0;}

function attentionItems(state){
  const events=portugalEvents(state),findings=preventionFindings(state),items=[];
  for(const event of events){
    const physical=event.physicalState?.freshness,report=event.reportState?.sourceActivity;
    if(physical==='current'||event.actionNeed?.needsRouting||report==='current')items.push({tone:eventTone(event),label:eventStatus(event),title:event.label??event.id,meta:event.actionNeed?.kind?String(event.actionNeed.kind).replaceAll('_',' '):`${finiteNumberOrNull(event.physicalSourceProfile?.familyCount)??'Unmeasured'} physical families`,time:ageLabel(event.lastSeenAt),action:`select-event:${event.id}`});
  }
  for(const finding of findings.filter(needsReview))items.push({tone:'warning',label:'Prevention review',title:finding.place??finding.municipality??finding.findingId,meta:'Governed measurement / review remains open',time:finding.firstObservableInterval?.end?ageLabel(finding.firstObservableInterval.end):'open',action:`select-finding:${finding.findingId??finding.id}`});
  return items.slice(0,4);
}

export function renderOverview(state){
  const ready=state.runtime?.status==='ready',events=portugalEvents(state),findings=preventionFindings(state),summary=state.runtime?.events?.summary??{},sources=sourceRows(state),attention=attentionItems(state);
  const sourceIssues=sources.filter(s=>!['current','ready','healthy','operational'].includes(String(s.state).toLowerCase()));
  const currentPhysical=measuredOr(summary.activeCurrentPhysicalEvents??summary.currentPhysicalEvents,events.filter(e=>e.physicalState?.freshness==='current').length);
  const physicalFirst=measuredOr(summary.currentPhysicalCandidates,events.filter(e=>e.physicalFirst&&e.physicalState?.freshness==='current').length);
  const evidenceNeedCount=openEvidenceNeeds(state).length;
  const metrics=[['Current physical',String(currentPhysical),'Defensible now',currentPhysical?'critical':'green'],['Needs attention',String(attention.length),'Highest-priority work',attention.length?'warning':'green'],['Physical-first',String(physicalFirst),'Unreported candidates',physicalFirst?'warning':'teal'],['Measurement required',String(findings.filter(needsReview).length),'PREVENT review','warning'],['Degraded sources',String(sourceIssues.length),sourceIssues.slice(0,2).map(source=>source.name).join(' · ')||'All returned providers healthy',sourceIssues.length?'warning':'green'],['Evidence gaps',String(evidenceNeedCount),evidenceNeedCount?'Open follow-up required':'No open linked gaps',evidenceNeedCount?'warning':'teal']];
  const queue=attention.length?attention.map(item=>`<button class="attention-item attention-item--${item.tone}" data-action="${esc(item.action)}"><span class="attention-item__rail"></span><span class="attention-item__content"><span class="attention-item__top"><span>${esc(item.label)}</span><time>${esc(item.time)}</time></span><strong>${esc(item.title)}</strong><small>${esc(item.meta)}</small></span>${icon('chevron',16)}</button>`).join(''):`<div class="empty-state"><strong>No unresolved attention item</strong><p>The canonical Portugal event window currently has no routed item.</p></div>`;
  const markers=events.slice(0,24).map(e=>({coordinate:e.coordinate,label:e.label??e.id,short:'',tone:eventTone(e),action:`select-event:${e.id}`}));
  const briefing=currentPhysical?`${currentPhysical} qualifying current physical fire ${currentPhysical===1?'event':'events'} require operator review.`:physicalFirst?`${physicalFirst} physical-first ${physicalFirst===1?'candidate requires':'candidates require'} investigation.`:'No qualifying current physical fire evidence. Pipeline remains active.';
  const content=`${overviewIntelligence(state,events)}<div class="overview-intelligence-map"><section class="map-card overview-map" aria-label="Portugal operational territory map">${tileMap({coordinate:[-8.05,39.55],zoom:7,thermal:ready,markers,label:'Real Portugal satellite and thermal context',enabled:ready&&state.runtime?.session?.authenticated===true})}<header class="map-card__header"><div><span class="eyebrow">Operational evidence map</span><h2>Portugal mainland</h2></div><span class="live-time"><span class="status-dot status-dot--${ready?'green':'critical'}"></span>${ready?'Canonical 4177':'Backend unavailable'}</span></header><div class="briefing-card"><span class="eyebrow ${currentPhysical||physicalFirst?'eyebrow--critical':''}">Physical truth · now</span><h3>${esc(briefing)}</h3><p>${ready?'Real VIGIA event projection · intelligence remains a projection over evidence.':'Canonical evidence is unavailable. No fallback incident is shown.'}</p>${ready?button('Inspect live events',{tone:'primary',action:'review-incident'}):button('Retry backend',{tone:'primary',action:'refresh-runtime'})}</div></section></div>`;
  return shell('overview',content,{fullBleed:true});
}
