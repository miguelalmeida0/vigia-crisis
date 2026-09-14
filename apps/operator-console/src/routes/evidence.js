import { shell, badge, button, decisionFrame, whatChangedPanel, esc } from '../components.js?v=2.1.0';
import { icon } from '../icons.js?v=2.1.0';
import {
  selectedEventSummary,
  selectedEventDetail,
  physicalEvidenceGroups,
  openEvidenceNeeds,
  ageLabel,
  eventStatus,
  eventTone,
  formatMw
} from '../viewModel.js?v=2.1.0';
import { tileMap } from '../map.js?v=2.1.0';
import { evidenceIntelligence } from '../intelligenceView.js?v=2.1.0';

function value(value, fallback = 'Unmeasured') {
  return value === null || value === undefined || value === '' ? fallback : String(value).replaceAll('_', ' ');
}

function contradictionState(event) {
  const rows = event?.contradictions ?? event?.evidenceContradictions ?? [];
  if (Array.isArray(rows) && rows.length) return { label:`${rows.length} present`, tone:'warning' };
  if (event?.candidateAssessment?.contradicted === true) return { label:'Present', tone:'warning' };
  return { label:'None returned', tone:'green' };
}

function missingEvidence(event, familyCount) {
  const missing = event?.evidenceNeed?.missingQuantity ?? event?.actionNeed?.missingQuantity;
  if (missing) return value(missing);
  if (familyCount < 2) return 'Independent corroboration';
  return 'No routed gap';
}

function confidenceStack(event, groups) {
  const familyCount = event?.physicalSourceProfile?.familyCount ?? groups.length;
  const report = event?.reportState?.sourceActivity ?? 'No report';
  const latest = groups.map(group => group.latest?.at ?? group.latest?.observedAt).filter(Boolean).sort().at(-1) ?? event?.lastSeenAt;
  const association = event?.association?.state ?? event?.fireEvidenceState?.state ?? 'Unmeasured';
  const contradictions = contradictionState(event);
  const missing = missingEvidence(event, familyCount);
  const items = [
    ['Public report', value(report), report === 'current' ? 'green' : 'teal', 'Report state is independent from physical sensing.'],
    ['Physical observation', groups.length ? `${groups.reduce((sum, group) => sum + group.rows.length, 0)} attributable` : 'None returned', groups.length ? 'green' : 'warning', 'Only returned observations are counted.'],
    ['Source family', `${familyCount} ${familyCount === 1 ? 'family' : 'families'}`, familyCount > 1 ? 'green' : 'warning', groups.map(group => group.label).join(' · ') || 'No physical family returned.'],
    ['Freshness', latest ? ageLabel(latest) : 'Unmeasured', event?.physicalState?.freshness === 'current' ? 'green' : 'warning', value(event?.physicalState?.freshness, 'Physical freshness unavailable')],
    ['Association', value(association), String(association).toLowerCase().includes('not_applicable') ? 'teal' : 'green', 'Association is reported separately from detection.'],
    ['Independent corroboration', familyCount > 1 ? 'Present' : 'Not present', familyCount > 1 ? 'green' : 'warning', 'Multiple physical families are required for independent corroboration.'],
    ['Contradictions', contradictions.label, contradictions.tone, 'Contradictory evidence is never hidden by an aggregate score.'],
    ['Missing evidence', missing, missing === 'No routed gap' ? 'green' : 'warning', 'This is the highest-value evidence gap currently returned.']
  ];
  return `<div class="confidence-stack">${items.map(([label, status, tone, note]) => `<article class="confidence-stack__item confidence-stack__item--${tone}">
    <span class="confidence-stack__signal">${icon(tone === 'green' ? 'check' : tone === 'warning' ? 'warning' : 'evidence', 16)}</span>
    <span><small>${esc(label)}</small><strong>${esc(status)}</strong><em>${esc(note)}</em></span>
  </article>`).join('')}</div>`;
}

function evidenceWork(state,event){
  const allRequests=state.runtime?.evidenceRequests?.requests??state.runtime?.command?.operations?.evidenceRequests??[],actor=state.runtime?.session?.actor,capabilities=new Set(actor?.capabilities??[]),mutationReady=state.runtime?.session?.mutationReady===true;
  const needs=openEvidenceNeeds(state,{eventId:event?.id}).slice(0,8);
  const rows=needs.map(need=>{const request=allRequests.find(item=>item.id===need.evidenceRequestId)||allRequests.find(item=>item.evidenceNeedId===need.id),method=need.candidateMethods?.find(item=>item.id===need.selectedMethodId)??need.candidateMethods?.[0],due=need.serviceLevel?.observationDueAt??need.serviceLevel?.acknowledgementDueAt??need.nextObservationAt,manual=method?.availability==='MANUAL_REQUEST'||method?.id==='manual-field-dispatch',automatic=['AVAILABLE_NOW','SCHEDULED_CONFIRMED'].includes(method?.availability),canCreate=mutationReady&&!request&&need.ownerId&&due&&capabilities.has('request:evidence'),canAck=mutationReady&&request?.state==='requested'&&request.ownerId===actor?.id&&capabilities.has('ack:evidence_request'),canCancel=mutationReady&&request&&['requested','acknowledged','in_progress'].includes(request.state)&&capabilities.has('request:evidence');return `<article class="evidence-work__item"><header><div><small>${esc(value(need.subjectType,'Evidence need'))}</small><strong>${esc(value(need.missingQuantity,'Required evidence'))}</strong></div>${badge(request?.state??need.state??'OPEN',request?.state==='accepted'?'green':'warning',true)}</header><dl><div><dt>Next evidence</dt><dd>${esc(value(method?.label??method?.id,'No method configured'))}</dd></div><div><dt>Acquisition</dt><dd>${automatic?'AUTOMATIC ACQUISITION ACTIVE':manual&&request?'REQUEST RECORDED / DELIVERY NOT CONFIGURED':manual?'MANUAL REQUEST AVAILABLE':esc(value(method?.availability,'UNAVAILABLE'))}</dd></div><div><dt>Owner</dt><dd>${esc(value(need.ownerId??request?.ownerId,'OWNER REQUIRED'))}</dd></div><div><dt>Deadline</dt><dd>${due?esc(new Date(due).toLocaleString()):'DEADLINE REQUIRED'}</dd></div></dl><p>${esc(value(need.reason,'No governed reason returned.'))}</p>${request?.escalation?`<div class="evidence-escalation"><strong>Escalated</strong><span>${esc(value(request.escalation.reason))}</span></div>`:''}<footer>${canCreate?button('Create governed request',{tone:'primary',action:`create-evidence-request:${need.id}`}):''}${canAck?button('Acknowledge request',{tone:'secondary',action:`ack-evidence-request:${request.id}`}):''}${canCancel?button('Mark unobtainable',{tone:'ghost',action:`mark-evidence-unobtainable:${request.id}`}):''}${automatic?badge('Duplicate request suppressed','green',true):''}${!mutationReady?badge('Secure mutation session unavailable','warning',true):''}</footer></article>`;}).join('');
  return `<section class="panel evidence-work"><header><div><span class="eyebrow">Evidence need → observation work</span><h3>Actionable acquisition lifecycle</h3></div>${badge(`${needs.length} open`,needs.length?'warning':'green')}</header><div class="evidence-work__grid">${rows||'<div class="empty-note">No unresolved evidence need is returned. VIGIA does not invent acquisition work.</div>'}</div></section>`;
}

export function renderEvidence(state) {
  const event = selectedEventDetail(state) ?? selectedEventSummary(state);
  const groups = physicalEvidenceGroups(event);
  const index = Math.min(state.selectedEvidence, Math.max(0, groups.length - 1));
  const selected = groups[index] ?? null;
  const selectedObs = selected?.latest;
  const familyCount = event?.physicalSourceProfile?.familyCount ?? groups.length;
  const currentPhysical = event?.physicalState?.freshness === 'current';
  const gap = missingEvidence(event, familyCount);
  const sources = groups.length ? groups.map((group, groupIndex) => `<button class="source-item ${index === groupIndex ? 'is-active' : ''}" data-action="select-evidence:${groupIndex}">
    <span class="source-icon">${icon(group.latest?.type === 'thermal' ? 'detect' : 'evidence', 17)}</span>
    <span><strong>${esc(group.label)}</strong><small>${group.rows.length} observation${group.rows.length === 1 ? '' : 's'} · ${esc(ageLabel(group.latest?.at ?? group.latest?.observedAt))}</small></span>
    ${badge(group.latest?.type ?? group.latest?.sourceFamily ?? 'physical', 'teal', true)}${icon('chevron', 14)}
  </button>`).join('') : '<div class="empty-state"><strong>No physical evidence detail</strong><p>The selected canonical event exposes no attributable observation in this session.</p></div>';
  const now = event?.physicalOperationalState ?? event?.knowledgeState ?? eventStatus(event);
  const next = gap === 'No routed gap' ? 'Monitor for a material state change' : `Acquire ${gap.toLowerCase()}`;
  const why = event?.candidateAssessment?.conclusion ?? `${familyCount} attributable physical source ${familyCount === 1 ? 'family is' : 'families are'} returned.`;
  const history = (event?.timeline ?? []).slice(-6).reverse();
  const content = `<div class="evidence-route evidence-route--confidence">
    <header class="route-heading evidence-heading">
      <div><span class="eyebrow">Evidence · trust view</span><h2>${esc(event?.label ?? 'No selected event')}</h2><p>Trust is shown as attributable evidence, freshness, corroboration, contradictions and gaps—not a synthetic confidence score.</p>${event?.id ? `<small class="incident-identity">Event ${esc(event.id)}</small>` : ''}</div>
      <div class="route-actions">${event ? badge(eventStatus(event), eventTone(event)) : badge('No event', 'warning')}${event?button('Copy brief',{tone:'ghost',action:'copy-incident-brief'}):''}${event?button('Export brief',{tone:'secondary',action:'export-incident-brief'}):''}</div>
    </header>
    ${evidenceIntelligence(state,event)}
    ${event ? decisionFrame({ now, next, why, nowMeta:`Evidence state: ${value(event.evidenceState, 'unknown')}`, nextMeta:gap === 'No routed gap' ? 'No unresolved evidence need is currently routed.' : 'Missing evidence remains explicit.', whyMeta:'Every supporting observation remains attributable.' }) : ''}
    <div class="evidence-confidence-grid">
      <section class="panel evidence-confidence">
        <header><div><span class="eyebrow">Evidence confidence stack</span><h3>Why this state is defensible</h3></div><strong>${familyCount} ${familyCount === 1 ? 'family' : 'families'}</strong></header>
        ${confidenceStack(event, groups)}
      </section>
      <section class="panel evidence-context">
        <header><div><span class="eyebrow">Attributable source context</span><h3>${esc(selected?.label ?? 'No source selected')}</h3></div>${selected ? badge('Real source', 'green', true) : ''}</header>
        <div class="evidence-context__map">${event ? tileMap({ coordinate:event.coordinate, zoom:10, thermal:currentPhysical, time:'latest', markers:[{ coordinate:event.coordinate, label:event.label, tone:eventTone(event), short:'EVENT' }], label:'Real source context for selected event', enabled:state.runtime?.session?.authenticated===true }) : '<div class="map-loading-state"><strong>No event selected</strong></div>'}</div>
        <dl class="evidence-context__facts"><div><dt>Observation time</dt><dd>${selectedObs ? esc(ageLabel(selectedObs.at ?? selectedObs.observedAt)) : 'Unavailable'}</dd></div><div><dt>Source family</dt><dd>${esc(value(selectedObs?.sourceFamily ?? selectedObs?.source, 'Unavailable'))}</dd></div><div><dt>Instrument</dt><dd>${esc(value(selectedObs?.instrument ?? selectedObs?.satellite, 'Unavailable'))}</dd></div><div><dt>FRP</dt><dd>${esc(formatMw(selectedObs?.frpMw ?? selectedObs?.measurement?.frpMw))}</dd></div></dl>
        <div class="evidence-context__actions">${button('Open detection detail', { tone:'secondary', iconName:'external', action:'detect-view:detail' })}</div>
      </section>
    </div>
    ${evidenceWork(state,event)}
    ${whatChangedPanel(state.decisionChanges??[],{title:'What changed since the prior canonical view'})}
    <section class="panel evidence-provenance">
      <header><div><span class="eyebrow">Deeper provenance</span><h3>Sources and event chronology</h3></div><strong>${history.length} recent steps</strong></header>
      <div class="evidence-provenance__body"><div class="source-chain-compact">${sources}</div><div class="audit-trail-compact">${history.map(item => `<article><span class="status-dot status-dot--teal"></span><span><strong>${esc(item.source ?? item.type ?? 'Event step')}</strong><small>${item.at ? esc(new Date(item.at).toLocaleString()) : 'Timestamp unavailable'}</small></span></article>`).join('') || '<p class="empty-note">No event timeline returned.</p>'}</div></div>
    </section>
  </div>`;
  return shell('evidence', content);
}
