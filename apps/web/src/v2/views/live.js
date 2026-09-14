import { escapeHtml } from '../utils/html.js';
import { coordinateLabel, dateTime, evidenceDateTime, number, relativeTime, statusLabel } from '../utils/format.js';
import { actions, pill } from '../components/primitives.js';
import { associationCard, candidateCard, coverageCard, eventTimeline, evidenceNeedCard, fireEvidenceStateCard, observationPlanCard, physicalProvenanceCard, physicalTimelineMatrix, thermalChart } from './event-presenter.js';
import { incidentCommandSnapshot } from './live-command.js';
import { autonomousEvidenceClosure, coverageIntelligence, incidentDecisionLedger } from './decision-ledger.js';
import { analysisInstrument } from './living-fire-analysis.js';
import { fieldNetEntry } from '../fieldnet/entry.js';
export const liveFilters = Object.freeze([
  ['all','All attention'], ['current','Current'], ['review','Needs review']
]);

export function liveSummary(state) {
  if (state.live?.state === 'unavailable') return `<div class="summary-hero unavailable"><strong>—</strong><span>live state unavailable</span></div><p class="summary-note">No live event count is shown because the physical-truth transaction did not complete.</p><button type="button" class="summary-drilldown" data-action="refresh">Retry live state</button>`;
  if(state.live?.state==='loading')return `<div class="command-quantities is-loading" aria-busy="true">${['Current physical fires','Delayed physical candidates','Physical-first / unreported','Multisource physical','Prevention measurement / review','Report-only current'].map((label)=>`<div><strong>—</strong><span>${label}</span></div>`).join('')}</div>`;
  const territory=state.territory?.summary??{},live=state.live?.summary??{},events=state.live?.events??[],findings=state.bootstrap?.prevention?.findings??[];
  const reportOnlyCurrent=events.filter((event)=>event.reportState?.sourceActivity==='current'&&event.physicalState?.freshness!=='current').length;
  const preventionReviews=findings.filter((item)=>Number(item.reviewSummary?.count??0)===0).length;
  const current=Number(live.activeCurrentPhysicalEvents??live.currentPhysicalEvents??territory.physicalFireEvents??0),physicalFirst=Number(live.currentPhysicalCandidates??0),multisource=Number(live.currentMultisourcePhysicalEvents??territory.multisourcePhysicalEvents??0),delayed=Number(territory.delayedPhysicalEvents??live.agingPhysicalEvidenceEvents??0),attention=[[preventionReviews,'Prevention measurements / reviews','Open governed measurement or external-validation gate'],[reportOnlyCurrent,'Public report needs corroboration','Request physical corroboration'],[physicalFirst,'Physical-first candidates','Inspect physical evidence'],[delayed,'Delayed physical candidates','Review as history']].filter(([value])=>Number(value)>0);
  return `<section class="overview-attention-summary ${current?'has-current':'is-clear'}"><header><div><span>LIVE TERRITORY</span><strong>${current?`${number(current)} CURRENT PHYSICAL FIRE DETECTION${current===1?'':'S'}`:'No qualifying physical fire now'}</strong></div><b>${attention.reduce((sum,[value])=>sum+Number(value),0)} OPEN</b></header><p>${current?'Current physical evidence · operator review required.':'The physical pipeline is active; zero is bounded to qualifying current evidence.'}</p><footer><span>VIIRS <b>${escapeHtml(statusLabel(state.live?.sources?.firms?.state??'unavailable'))}</b></span><span>SLSTR <b>${escapeHtml(statusLabel(state.live?.sources?.sentinel3Pixels?.state??'unavailable'))}</b></span></footer><span class="md-visually-hidden">${number(physicalFirst)} physical-first · ${number(reportOnlyCurrent)} report-only · ${number(preventionReviews)} prevention review · ${number(multisource)} multisource · ${attention.map(([,label])=>escapeHtml(label)).join(' · ')}</span></section>`;
}

export function liveIntro(state) {
  const live = state.live;
  if (!live) return '';
  if(live.state==='loading')return `<section class="command-map-status is-loading" aria-busy="true"><header><div><span>COMMAND SHELL READY</span><strong>Resolving current physical evidence…</strong></div><p>Navigation and attributable session controls are available while the bounded physical state completes.</p></header><div class="dependency-strip"><button type="button" class="is-delayed"><span>VIIRS</span><strong>CHECKING</strong></button><button type="button" class="is-delayed"><span>SENTINEL-3</span><strong>CHECKING</strong></button><button type="button" data-action="work" class="is-delayed"><span>ALERTS + WORK</span><strong>INDEPENDENT</strong></button><button type="button" data-action="validation" class="is-partial"><span>VALIDATION</span><strong>ON DEMAND</strong></button></div><p>No current, zero, or unavailable claim is inferred until the physical-truth read completes.</p></section>`;
  if (live.state === 'unavailable') return `<div class="live-stage-status event-status physical-live-state is-unavailable"><div><span class="live-label">LIVE PHYSICAL TRUTH</span><i></i><strong>DEPENDENCY UNAVAILABLE</strong></div><h2>LIVE STATE NOT RESOLVED</h2><p>VIGIA will not present cached or unpersisted detections as current physical truth.</p><small>${escapeHtml(live.error ?? 'The live event service did not complete.')}</small></div>`;
  const event=state.selected?.kind==='event'?(live.events??[]).find((item)=>String(item.id)===String(state.selected.id)):null;
  if(!event){
    const sourceState=(source)=>{const value=source?.state??'unavailable';if(value==='current')return['current','CURRENT'];if(value==='stale')return['delayed','DELAYED'];if(value==='empty')return['partial','NO POSITIVE FRP'];return['unavailable','UNAVAILABLE'];};
    const [viirsTone,viirsLabel]=sourceState(live.sources?.firms??state.bootstrap?.sources?.firms),[s3Tone,s3Label]=sourceState(live.sources?.sentinel3Pixels??state.bootstrap?.sources?.sentinel3Pixels);
    const operationsTone=state.operationsState==='ready'?'current':state.operationsState==='partially_available'?'partial':state.operationsState==='loading'?'delayed':'unavailable';
    const operationsLabel=state.operationsState==='ready'?'READY':state.operationsState==='partially_available'?'PARTIAL':state.operationsState==='loading'?'RETRYING':'UNAVAILABLE';
    const validationTone=state.validationState==='ready'?'current':state.validationState==='error'||state.validationState==='unavailable'?'unavailable':'partial';
    const validationLabel=state.validationState==='ready'?'READY':state.validationState==='error'||state.validationState==='unavailable'?'UNAVAILABLE':'ON DEMAND';
    const broadContextAt=live.clocks?.mtg?.observedAt??live.meta?.generatedAt;
    const summary=live.summary??{},current=Number(summary.activeCurrentPhysicalEvents??summary.currentPhysicalEvents??0),physicalFirst=Number(summary.currentPhysicalCandidates??0),reportOnly=Number(summary.currentReportEvents??0);
    const commandDecision=current?'Current physical evidence requires operator review.':physicalFirst?'A physical-first candidate requires investigation.':reportOnly?'Current reports require physical corroboration.':'No qualifying current physical fire evidence. Pipeline remains active.';
    const secondary=current||physicalFirst
      ? `${number(current)} current physical fire${current===1?'':'s'} · ${number(physicalFirst)} unreported physical candidate${physicalFirst===1?'':'s'}.`
      : reportOnly
        ? `${number(reportOnly)} current public report${reportOnly===1?'':'s'} awaiting physical corroboration.`
      : 'No current signal · providers polling · persistence active.';
    return `<section class="overview-map-brief ${current||physicalFirst?'has-spatial-priority':'is-no-current'}"><header><span>OPERATIONAL BRIEFING · NOW</span><strong>${escapeHtml(commandDecision)}</strong><p>${escapeHtml(secondary)}</p></header><small>${broadContextAt?`Broad satellite context timestamp ${escapeHtml(dateTime(broadContextAt))} · not detection evidence`:'Broad satellite context timestamp unavailable'}</small></section>`;
  }
  const current=event.physicalState?.freshness==='current',reportCurrent=event.reportState?.sourceActivity==='current';
  const posture=current&&!reportCurrent?'INVESTIGATE PHYSICAL-FIRST':current?'MAINTAIN PHYSICAL WATCH':reportCurrent?'CORROBORATE REPORT':'RETAIN · NOT CURRENT';
  return `<div class="incident-workspace-banner"><span>INCIDENT DECISION · ${escapeHtml(event.id)}</span><strong>${escapeHtml(posture)}</strong><p>${escapeHtml(event.label)} · ${escapeHtml(reportValue(event))} · physical ${escapeHtml(statusLabel(event.physicalState?.freshness??'unobserved'))} · latest ${escapeHtml(relativeTime(event.lastSeenAt))}</p></div>`;
}

function reportValue(event) {
  const state = event.reportState?.sourceActivity;
  return state === 'current' ? 'Current report' : state === 'delayed' ? 'Delayed report' : state === 'stale_open' ? 'Stale open report' : state === 'closed' ? 'Closed report' : 'No public report';
}

function supportedIncident(state, event) {
  const ids = new Set((event.incidentIds ?? []).map(String));
  return state.bootstrap?.detection?.incidents?.find((item) => {
    const matches = ids.has(String(item.id)) || (item.sourceRecordIds ?? []).some((id) => ids.has(String(id)));
    return matches && ['corroborated','verified'].includes(item.truthStage) && item.freshness?.state !== 'stale';
  }) ?? null;
}

function activeEventRequest(state, event) {
  const target = `event:${event.id}`;
  const requests = state.bootstrap?.operations?.evidenceRequests ?? [];
  return requests.find((item) => item.id === event.evidenceNeed?.evidenceRequestId && !['accepted','rejected','cancelled'].includes(item.state))
    ?? requests.find((item) => item.targetId === target && !['accepted','rejected','cancelled'].includes(item.state)) ?? null;
}

function eventCorrectionTools(state, event) {
  const actor = (state.bootstrap?.control?.actors ?? []).find((item) => item.id === state.actorId);
  if (!['analyst','supervisor','administrator'].includes(actor?.role)) return '';
  const mergeAvailable = (state.live?.events ?? []).some((item) => item.id !== event.id);
  const splitAvailable = (event.observations ?? []).length > 1;
  if (!mergeAvailable && !splitAvailable) return '';
  return `<div class="event-correction-tools"><span>EVENT IDENTITY REVIEW</span>${mergeAvailable ? '<button type="button" class="secondary-action" data-action="merge-event">Merge event</button>' : ''}${splitAvailable ? '<button type="button" class="secondary-action" data-action="split-event">Split observation</button><button type="button" class="danger-action" data-action="reject-event-association">Reject association</button>' : ''}</div>`;
}

function eventActions(state, event) {
  const consequence = supportedIncident(state, event);
  const request = activeEventRequest(state, event);
  const acquisition = request
    ? [{ action:'open-operation', id:request.id, label:`Open assigned work · ${statusLabel(request.state)}`, kind:'primary' }]
    : event.actionNeed?.needsRouting
      ? [{ action:'open-action', label:'Open Action queue', kind:'primary' }]
      : [];
  return actions([
    ...acquisition,
    ...(consequence ? [{ action:'screen-event-consequence', id:consequence.id, label:'Screen consequences' }] : []),
    ...(state.view !== 'incidents' ? [{ action:'open-incident-truth', label:'Open fire workspace' }] : [])
  ]);
}
function historySection(event, index) {
  const timeline = event.timeline ?? [];
  if (timeline.length > 1) return `<section class="inspector-section physical-history"><div class="section-label">PHYSICAL EVENT TIMELINE</div>${physicalTimelineMatrix(event)}<details class="technical-detail"><summary>Timestamped observation ledger</summary>${eventTimeline(event,index)}</details></section>`;
  const only = timeline[0];
  return `<section class="inspector-section physical-history"><div class="section-label">PHYSICAL EVENT TIMELINE</div>${physicalTimelineMatrix(event)}<div class="single-observation-card"><strong>1 timestamped observation</strong><p>${only ? `${dateTime(only.at)} · ${escapeHtml(only.label)}` : 'Replay becomes available after a second observation.'}</p></div></section>`;
}
function twoFamilyBreakthrough(event) {
  const profile=event.physicalSourceProfile??{};
  if(profile.twoPhysicalSourceFamilies!==true&&Number(profile.familyCount??0)<2)return'';
  const physical=(event.observations??[]).filter((item)=>item.type==='thermal');
  const family=(id)=>physical.filter((item)=>id==='viirs'
    ? item.sourceFamily==='viirs'||/viirs/i.test(`${item.instrument??''} ${item.source??''}`)
    : item.sourceFamily==='sentinel3_slstr'||/sentinel.?3|slstr/i.test(`${item.instrument??''} ${item.source??''}`));
  const summary=(id,label)=>{const rows=family(id).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),frp=rows.map((item)=>Number(item.frpMw)).filter(Number.isFinite);return`<article><span>${escapeHtml(label)}</span><strong>${number(rows.length)} associated observation${rows.length===1?'':'s'}</strong><dl><div><dt>First physical</dt><dd>${rows[0]?escapeHtml(dateTime(rows[0].at)):'Unavailable in projection'}</dd></div><div><dt>Latest physical</dt><dd>${rows.at(-1)?escapeHtml(dateTime(rows.at(-1).at)):'Unavailable in projection'}</dd></div><div><dt>Maximum FRP</dt><dd>${frp.length?`${number(Math.max(...frp))} MW`:'Unmeasured'}</dd></div></dl></article>`;};
  const freshness=event.physicalState?.freshness??'unknown',current=freshness==='current',association=event.association?.state??event.associationState??'retained';
  return `<section class="two-family-breakthrough ${current?'is-current':'is-historical'}" aria-label="Two independent physical source families">
    <header><div><span>VIIRS + SENTINEL-3 / SLSTR</span><h3>TWO INDEPENDENT PHYSICAL FAMILIES</h3></div><strong>${current?'CURRENT PHYSICAL EVIDENCE':`${statusLabel(freshness)} PHYSICAL EVIDENCE · NOT CURRENT`}</strong></header>
    <div class="two-family-evidence">${summary('viirs','VIIRS')}${summary('sentinel3','SENTINEL-3 / SLSTR')}</div>
    <footer><span>REPORT STATE <b>${escapeHtml(reportValue(event))}</b></span><span>ASSOCIATION <b>${escapeHtml(statusLabel(association))}</b></span><span>EVENT <b>${escapeHtml(event.id)}</b></span></footer>
    <p>${escapeHtml(event.candidateAssessment?.conclusion??'The source families are associated by the governed event policy.')} ${current?'This panel describes current attributable evidence.':'This is retained historical physical evidence and is not presented as a current-fire claim.'}</p>
  </section>`;
}
function incidentOperationsCard(state,event){
  const projection=state.incidentOperations?.incident?.id===event.id?state.incidentOperations:null;
  if(!projection&&state.incidentOperationsError){
    const detail=/server error/i.test(state.incidentOperationsError)
      ?'The PostGIS-backed operations service did not respond'
      :String(state.incidentOperationsError).replace(/\.$/,'');
    return`<section class="incident-operations-state is-unavailable"><span>LIVE OPERATIONS</span><strong>PostGIS-backed incident operations unavailable</strong><p>${escapeHtml(detail)}. Physical evidence remains visible, but no alert, asset or opportunity state is inferred.</p></section>`;
  }
  if(!projection)return`<section class="incident-operations-state"><span>LIVE OPERATIONS</span><strong>Resolving bounded incident operations</strong><p>Alert, territory and observation-opportunity state load separately from physical evidence.</p></section>`;
  const summary=projection.alertSummary??{},territory=projection.territoryContext??{},opportunities=projection.observationOpportunities??[],results=projection.observationOpportunityResults??[],assets=territory.assets??[];
  return`<section class="incident-operations-state"><span>LIVE OPERATIONS · POSTGIS</span><strong>${number(summary.active??0)} active alert${summary.active===1?'':'s'} · ${number(summary.unacknowledged??0)} unacknowledged</strong><div><article><b>${number(assets.length)}</b><small>nearby monitored assets</small></article><article><b>${number(opportunities.length)}</b><small>observation opportunities</small></article><article><b>${number(results.length)}</b><small>attributable opportunity results</small></article></div><p>Alert lifecycle, monitored-territory context and observation opportunities are persisted independently from the physical event graph.</p></section>`;
}
export function liveInspector(state, event) {
  if (!event) return { kicker:'FIRE', content:'<section class="inspector-section"><h2>Select a fire event.</h2><p class="deck">Report state, physical observations, response context and next knowledge live together.</p></section>', actions:'' };
  const timelineIndex = Math.max(0, Math.min((event.timeline?.length ?? 1) - 1, state.liveTimeIndex ?? 0));
  const evidenceNeed = evidenceNeedCard(event, { actors:state.bootstrap?.control?.actors ?? [], requests:state.bootstrap?.operations?.evidenceRequests ?? [] });
  const association = (event.association?.state === 'associated' || event.evidenceState === 'association-uncertain' || event.evidenceState === 'satellite-only')
    ? `<section class="inspector-section"><div class="section-label">SOURCE ASSOCIATION</div>${associationCard(event)}${candidateCard(event)}${eventCorrectionTools(state,event)}</section>` : '';
  const physicalFirst = event.leadTime?.thermalBeforeReport ? `<section class="inspector-section"><div class="early-detection-callout"><span>OBSERVATION BEFORE REPORT</span><strong>Physical observation timestamp preceded the public report by ${number(event.leadTime.minutes)} minutes.</strong><p>${dateTime(event.leadTime.firstThermalAt)} observation · ${dateTime(event.leadTime.firstReportAt)} report · provider delivery latency unmeasured</p></div></section>` : '';
  const observationPlan = event.actionNeed?.needsRouting || event.observationPlan?.recommended
    ? `<section class="inspector-section"><div class="section-label">NEXT OBSERVATION</div>${observationPlanCard(event)}</section>` : '';
  const sourceProfile=event.physicalSourceProfile??{families:event.fireEvidenceState?.physicalSourceFamilies??[],familyCount:event.fireEvidenceState?.physicalSourceFamilyCount??0,independenceGroupCount:event.fireEvidenceState?.independenceGroups?.length??0,twoPhysicalSourceFamilies:event.fireEvidenceState?.twoPhysicalSourceFamilies===true};
  const familyStrip=`<section class="physical-family-strip ${sourceProfile.twoPhysicalSourceFamilies?'is-two-family':'is-single-family'}"><span>PHYSICAL SOURCE FAMILIES</span><strong>${sourceProfile.familyCount??0} ${sourceProfile.twoPhysicalSourceFamilies?'· TWO-FAMILY PHYSICAL EVENT':''}</strong><p>${escapeHtml((sourceProfile.families??[]).map((item)=>item==='viirs'?'VIIRS':item==='sentinel3_slstr'?'Sentinel-3 / SLSTR':statusLabel(item)).join(' + ')||'No point-level physical family attached')} · ${sourceProfile.independenceGroupCount??event.fireEvidenceState?.independenceGroups?.length??0} declared dependency groups</p></section>`;
  return {
    kicker:'INCIDENT COMMAND',
    content:`<section class="inspector-section event-head"><div class="detail-kicker"><span>CURRENT INCIDENT</span>${pill(event.reportState?.sourceActivity ?? 'unknown',reportValue(event))}</div><h2>${escapeHtml(event.label)}</h2><p class="deck">${escapeHtml(coordinateLabel(event.coordinate))}</p><p class="location-line">First seen ${escapeHtml(relativeTime(event.firstSeenAt))} · last signal ${escapeHtml(relativeTime(event.lastSeenAt))}</p></section>
      <div class="incident-decision-order"><span>NOW</span><strong>Current incident state</strong></div>
      ${incidentCommandSnapshot(event)}
      <div class="incident-decision-order"><span>WHY</span><strong>Physical support for this decision</strong></div>
      ${twoFamilyBreakthrough(event)}
      <section class="inspector-section"><div class="section-label">PHYSICAL EVIDENCE STATE</div>${fireEvidenceStateCard(event)}</section>
      ${evidenceNeed ? `<div class="incident-decision-order"><span>UNKNOWN</span><strong>Unresolved evidence</strong></div><section class="inspector-section">${evidenceNeed}</section>` : ''}
      <div class="incident-decision-order"><span>NEXT</span><strong>Bounded next observation or action</strong></div>
      ${observationPlan}
      ${incidentOperationsCard(state,event)}
      ${fieldNetEntry(event)}
      <div class="incident-decision-order"><span>LEDGER</span><strong>Attributable decisions and evidence changes</strong></div>
      ${incidentDecisionLedger(state,event)}
      <details class="incident-method"><summary>METHOD + FULL EVIDENCE LEDGER <span>Identifiers, provenance, coverage and analysis</span></summary>${autonomousEvidenceClosure(state,event)}${coverageIntelligence(state,event)}${familyStrip}${physicalFirst}${event.thermal?.samples ? `<section class="inspector-section"><div class="section-label">FRP EVOLUTION</div>${thermalChart(event)}</section>` : ''}${association}${historySection(event,timelineIndex)}<section class="inspector-section"><div class="section-label">SENSOR COVERAGE</div>${coverageCard(event)}</section><section class="inspector-section"><div class="section-label">PHYSICAL PRODUCT PROVENANCE · ${escapeHtml(event.id)}</div>${physicalProvenanceCard(event)}</section></details>`,
    actions:eventActions(state,event)
  };
}
export function renderLiveOverlay(state) {
  if (state.live?.state === 'unavailable') return `<div class="live-replay event-replay service-unavailable"><div><span>LIVE WORKSPACE UNAVAILABLE</span><strong>Physical-truth state was not committed.</strong><p>${escapeHtml(state.live.error ?? 'The live event service did not complete.')}</p></div><button type="button" data-action="refresh">Retry live state</button></div>`;
  const finding = state.selected?.kind === 'finding' ? state.bootstrap?.prevention?.findings?.find((item) => String(item.findingId) === String(state.selected.id)) : null;
  if (finding) return `<div class="live-replay event-replay fuel-screen-overlay"><div class="live-replay-head"><div><span>PRE-IGNITION SCREEN · ${escapeHtml(finding.detectorVersion)}</span><strong>${escapeHtml(finding.place)}</strong></div><b>SCREENING CANDIDATE</b></div><div class="fuel-screen-measures"><span><b>${Number(finding.affectedAreaHa).toFixed(2)} ha</b> affected area</span><span><b>${Math.round(finding.corridorLengthM)} m</b> connected span</span><span><b>${Math.round(finding.nearestStructureM)} m</b> nearest mapped structure</span><span><b>UNMEASURED</b> precision / recall</span></div><small>First observable between ${escapeHtml(evidenceDateTime(finding.firstObservableInterval?.start))} and ${escapeHtml(evidenceDateTime(finding.firstObservableInterval?.end))}. Native pixels verified; physical hazard not confirmed.</small></div>`;
  const event = state.selected?.kind === 'event' ? state.live?.events?.find((item) => String(item.id) === String(state.selected.id)) : null;
  const enabled = state.liveThermalEnabled === true;
  if (!event) {
    const summary=state.live?.summary??{},events=state.live?.events??[],sources=state.live?.sources??state.bootstrap?.sources??{};
    const current=Number(summary.activeCurrentPhysicalEvents??summary.currentPhysicalEvents??0);
    const physicalFirst=Number(summary.currentPhysicalCandidates??0);
    const reportOnly=events.filter((item)=>item.reportState?.sourceActivity==='current'&&item.physicalState?.freshness!=='current').length;
    const delayed=Number(summary.agingPhysicalEvidenceEvents??0);
    const sourceCount=[sources.firms,sources.sentinel3Pixels].filter((source)=>['current','stale','empty'].includes(source?.state)).length;
    const freshness=[sources.firms?.freshness?.ageMinutes,sources.sentinel3Pixels?.freshness?.ageMinutes].filter(Number.isFinite);
    const newest=freshness.length?`${number(Math.min(...freshness))} min`:'unmeasured';
    if(state.view==='incidents')return `<section class="detect-timeline-dock"><header><div><span>LIVE DETECTION CLOCK</span><strong>${current||physicalFirst?'Current candidates available':'Running · awaiting qualifying physical evidence'}</strong></div><b>${sourceCount}/2 SOURCES OBSERVED</b></header><div><span><b>${number(current)}</b> physical fires now</span><span><b>${number(physicalFirst)}</b> physical-first</span><span><b>${number(reportOnly)}</b> report-only</span><span><b>${number(delayed)}</b> retained history</span><span><b>${escapeHtml(newest)}</b> newest source age</span></div></section>`;
    const findings=state.bootstrap?.prevention?.findings??[],review=findings.filter((item)=>Number(item.reviewSummary?.count??0)===0).length;
    return `<section class="overview-metric-dock" aria-label="Territory operational quantities"><article><span>PHYSICAL FIRES NOW</span><strong>${number(current)}</strong><small>${current?'Operator review required':'Pipeline active'}</small></article><article><span>NEW PHYSICAL CANDIDATES</span><strong>${number(physicalFirst)}</strong><small>Unreported / pending review</small></article><article><span>REPORT-ONLY</span><strong>${number(reportOnly)}</strong><small>Physical corroboration required</small></article><article><span>PREVENT REVIEW</span><strong>${number(review)}</strong><small>Measurement or validation gates</small></article><article><span>SOURCE COVERAGE</span><strong>${sourceCount}/2</strong><small>Newest age ${escapeHtml(newest)}</small></article></section>`;
  }
  const timeline = event.timeline ?? [];
  const analysisToggle = `<button type="button" class="analysis-mode-toggle ${state.analysisMode ? 'is-active' : ''}" data-action="toggle-analysis-mode" aria-pressed="${state.analysisMode === true}">${state.analysisMode ? 'Exit analysis' : 'Analysis mode'}</button>`;
  const rasterToggle = `<button type="button" class="${enabled ? 'is-active' : ''}" data-action="toggle-live-thermal" aria-pressed="${enabled}">${enabled ? 'Raster on' : 'Raster off'}</button>`;
  const controls = `<div class="live-replay-actions">${analysisToggle}${rasterToggle}</div>`;
  const index = Math.max(0, Math.min(timeline.length - 1, state.liveTimeIndex ?? timeline.length - 1));
  const entry = timeline[index]??null;
  const slots = state.live?.thermal?.replaySlots ?? [];
  const target = Date.parse(entry?.at??'');
  const nearest = slots.length ? slots.reduce((best,slot) => Math.abs(Date.parse(slot)-target) < Math.abs(Date.parse(best)-target) ? slot : best, slots[0]) : null;
  return `<div class="live-replay event-replay incident-analytical-timeline"><div class="live-replay-head"><div><span>ANALYTICAL TIMELINE · ${escapeHtml(event.id)}</span><strong>${escapeHtml(entry?.label??'Evidence clock unavailable')}</strong></div>${controls}</div>${analysisInstrument(event,state)}${incidentTimelineLanes(state,event,index)}${timeline.length>1?`<input type="range" min="0" max="${timeline.length-1}" value="${index}" step="1" data-live-range aria-label="Incident evidence clock"><div class="live-replay-labels ${index === 0 || index === timeline.length-1 ? 'edge-selected' : ''}"><span>FIRST · ${dateTime(timeline[0].at)}</span>${index>0&&index<timeline.length-1?`<strong>SELECTED · ${dateTime(entry.at)}</strong>`:''}<span>LATEST · ${dateTime(timeline.at(-1).at)}</span></div>`:`<div class="single-replay-state"><b>${escapeHtml(entry?dateTime(entry.at):'No timestamp')}</b><span>One attributable event step is available.</span></div>`}${nearest&&enabled?`<small>Nearest geostationary raster: ${escapeHtml(dateTime(nearest))}. Context remains independent from point evidence.</small>`:''}</div>`;
}

function incidentTimelineLanes(state,event,selectedIndex){
  const timeline=event.timeline??[],observations=event.observations??[];
  const projection=state.incidentOperations?.incident?.id===event.id?state.incidentOperations:null;
  const times=timeline.map((item)=>item.at).filter((at)=>Number.isFinite(Date.parse(at)));
  const start=Math.min(...times.map(Date.parse)),end=Math.max(...times.map(Date.parse)),span=Math.max(1,end-start);
  const position=(at)=>Number.isFinite(Date.parse(at))?Math.max(1,Math.min(99,((Date.parse(at)-start)/span)*100)):50;
  const nearestIndex=(at)=>timeline.length?timeline.reduce((best,item,index)=>Math.abs(Date.parse(item.at)-Date.parse(at))<Math.abs(Date.parse(timeline[best]?.at)-Date.parse(at))?index:best,0):0;
  const mark=(item,kind,label)=>`<button type="button" class="incident-timeline-mark is-${kind} ${nearestIndex(item.at)===selectedIndex?'is-selected':''}" style="--x:${position(item.at)}%" data-action="event-timeline-select" data-index="${nearestIndex(item.at)}" aria-label="${escapeHtml(label)} · ${escapeHtml(dateTime(item.at))}" title="${escapeHtml(label)} · ${escapeHtml(dateTime(item.at))}"><i></i></button>`;
  const family=(matcher)=>observations.filter((item)=>item.type==='thermal'&&matcher(item)).map((item)=>({...item,at:item.at??item.observedAt}));
  const viirs=family((item)=>item.sourceFamily==='viirs'||/viirs/i.test(`${item.instrument??''} ${item.source??''}`));
  const sentinel=family((item)=>item.sourceFamily==='sentinel3_slstr'||/sentinel.?3|slstr/i.test(`${item.instrument??''} ${item.source??''}`));
  const reports=observations.filter((item)=>item.type==='report').map((item)=>({...item,at:item.at??item.observedAt}));
  const frp=[...viirs,...sentinel].filter((item)=>Number.isFinite(Number(item.frpMw)));
  const alerts=(projection?.alerts??[]).map((item)=>({...item,at:item.openedAt}));
  const acknowledgements=(projection?.alerts??[]).filter((item)=>item.acknowledgedAt).map((item)=>({...item,at:item.acknowledgedAt}));
  const opportunities=(projection?.observationOpportunities??[]).filter((item)=>item.windowStart).map((item)=>({...item,at:item.windowStart}));
  const request=activeEventRequest(state,event),work=request?[{...request,at:request.createdAt??request.acknowledgedAt??request.dueAt}]:[];
  const lanes=[
    ['VIIRS',viirs,'viirs','VIIRS physical observation'],['SENTINEL-3',sentinel,'sentinel','Sentinel-3 / SLSTR physical observation'],['PUBLIC REPORT',reports,'report','Public report'],['FRP SUPPORT',frp,'frp','FRP measurement'],['ALERT',alerts,'alert','Operational alert'],['ACKNOWLEDGEMENT',acknowledgements,'ack','Alert acknowledgement'],['OPPORTUNITY',opportunities,'opportunity','Observation opportunity'],['EVIDENCE WORK',work,'work','Evidence work']
  ];
  const unavailable=!projection&&state.incidentOperationsError;
  return `<div class="incident-timeline-lanes" aria-label="Incident evidence lanes">${lanes.map(([label,items,kind,title])=>`<div class="incident-timeline-lane"><span>${label}</span><b>${items.map((item)=>mark(item,kind,title)).join('')}${!items.length?`<em>${unavailable&&['ALERT','ACKNOWLEDGEMENT','OPPORTUNITY'].includes(label)?'UNAVAILABLE':'—'}</em>`:''}</b></div>`).join('')}</div>`;
}
