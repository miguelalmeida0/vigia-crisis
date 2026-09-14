import { shell, badge, button, decisionFrame, whatChangedPanel, esc } from '../components.js?v=2.1.0';
import { tileMap } from '../map.js?v=2.1.0';
import { activeOperationalEvents, selectedEventSummary, preventionFindings, sourceRows, sourceTone, ageLabel, eventStatus, eventTone, openEvidenceNeeds } from '../viewModel.js?v=2.1.0';
import { finiteNumberOrNull } from '../truth.js?v=2.1.0';
import { handoffIntelligence } from '../intelligenceView.js?v=2.1.0';

export function renderShiftHandoff(state) {
  const events = activeOperationalEvents(state);
  const event = selectedEventSummary(state);
  const findings = preventionFindings(state);
  const needs = openEvidenceNeeds(state);
  const requests = state.runtime?.evidenceRequests?.requests ?? state.runtime?.command?.operations?.evidenceRequests ?? [];
  const selectedOps=state.runtime?.operationsIncidents?.[event?.id]??null,fieldnet=state.runtime?.fieldnetIncidents?.[event?.id]??state.runtime?.fieldnet??null,lastSnapshot=state.handoffSnapshots?.[0]??null;
  const degraded = sourceRows(state).filter(source => sourceTone(source.state) !== 'green');
  const alerts = state.runtime?.alerts?.alerts ?? [];
  const activeAlerts = alerts.filter(alert => !['RESOLVED', 'SUPPRESSED'].includes(String(alert.lifecycleState ?? alert.state)));
  const measurementOpen = findings.filter(finding => finiteNumberOrNull(finding.reviewSummary?.count) === 0);
  const unacknowledged=requests.filter(request=>request.state==='requested'),escalated=requests.filter(request=>request.escalation),openCount = needs.length + activeAlerts.length + degraded.length + unacknowledged.length;
  const openWork = [
    ...activeAlerts.slice(0, 3).map(alert => ({ type:'Alert', label:alert.title ?? alert.reasonCode ?? alert.alertType ?? 'Operational alert', state:alert.lifecycleState ?? alert.state ?? 'Open', tone:'warning' })),
    ...needs.slice(0, 8).map(need => ({ type:'Evidence', label:need.subjectLabel ?? need.missingQuantity ?? need.kind ?? 'Evidence need', state:need.state ?? 'Open', tone:'teal' })),
    ...degraded.slice(0, 8).map(source => ({ type:'Source', label:source.name, state:String(source.state).replaceAll('_', ' '), tone:sourceTone(source.state) }))
  ].slice(0,20);
  const next = needs[0]?.missingQuantity ?? activeAlerts[0]?.title ?? (degraded[0] ? `Review ${degraded[0].name}` : 'No governed follow-up returned');
  const decision = event ? decisionFrame({
    now:eventStatus(event),
    next:String(next).replaceAll('_', ' '),
    why:event.candidateAssessment?.conclusion ?? `${event.physicalSourceProfile?.familyCount ?? 0} attributable physical source families are linked.`,
    nowMeta:`Selected event · ${ageLabel(event.lastSeenAt)}`,
    nextMeta:needs.length || activeAlerts.length || degraded.length ? 'Highest-priority returned work.' : 'No speculative task is created.',
    whyMeta:'Incoming operators can open the full evidence chain.'
  }) : '';
  const content = `<div class="handoff-route handoff-route--operator">
    <header class="route-heading"><div><span class="eyebrow">Shift handoff 2.0 · operational transfer</span><h2>What the next operator inherits</h2><p>Generated ${new Date(state.runtime?.loadedAt ?? Date.now()).toLocaleString()} from canonical VIGIA. No narrative, containment, owner or availability is invented.</p></div><div class="route-actions">${badge(`${openCount} follow-up ${openCount === 1 ? 'item' : 'items'}`, openCount ? 'warning' : 'green')}${button('Create snapshot',{tone:'primary',action:'create-handoff-snapshot'})}${button('Export snapshot',{tone:'ghost',action:'export-handoff',disabled:!lastSnapshot})}</div></header>
    <div class="handoff-grid">
      <section class="panel handoff-summary"><header><div><span class="eyebrow">Operational summary</span><h2>Structured truth first</h2></div>${badge('Live snapshot', 'teal')}</header>
        <div class="handoff-kpis"><article><strong>${activeAlerts.length}</strong><span>Active alerts</span><small>Canonical operations</small></article><article><strong>${needs.length}</strong><span>Evidence needs</span><small>Unresolved</small></article><article><strong>${degraded.length}</strong><span>Source issues</span><small>Stale or unavailable</small></article><article><strong>${measurementOpen.length}</strong><span>Measurements</span><small>Still required</small></article></div>
        <div class="handoff-decision">${decision || '<div class="empty-state"><strong>No selected event</strong><p>Select a canonical Portugal event before handoff.</p></div>'}</div>
        <div class="handoff-work"><header><span class="eyebrow">Follow-up queue</span><strong>${openWork.length} shown</strong></header>${openWork.map(item => `<article><span><small>${esc(item.type)}</small><strong>${esc(item.label)}</strong></span>${badge(item.state, item.tone, true)}</article>`).join('') || '<div class="empty-state"><strong>No governed follow-up</strong><p>No active alert, evidence need or degraded source is currently returned.</p></div>'}<p class="handoff-boundary">Operations projection: ${selectedOps?'linked to the selected event':'NOT LINKED'}. A linked projection does not prove incident command, accountability, or personnel availability.</p></div>
      </section>
      <section class="panel handoff-map"><header><div><span class="eyebrow">Selected incident</span><h3>${esc(event?.label ?? 'No event selected')}</h3></div>${event ? badge(eventStatus(event), eventTone(event)) : badge('None', 'warning')}</header><div class="handoff-map__stage">${event ? tileMap({ coordinate:event.coordinate, zoom:9, thermal:false, markers:[{ coordinate:event.coordinate, label:event.label, tone:eventTone(event), short:'EVENT' }], label:'Real handoff map context', enabled:state.runtime?.session?.authenticated===true }) : '<div class="empty-state"><strong>No event selected</strong><p>No map fixture is substituted.</p></div>'}</div>${button('Open live event', { tone:'primary', iconName:'detect', action:'review-incident' })}</section>
    </div>
    ${handoffIntelligence(state)}
    <section class="panel handoff-transfer"><header><div><span class="eyebrow">Transfer surface</span><h3>Operational state by responsibility</h3></div>${lastSnapshot?badge('Integrity snapshot ready','green'):badge('Snapshot not created','warning')}</header><div class="handoff-transfer__grid"><article><span>Active incidents</span><strong>${events.length}</strong><small>${esc(events.slice(0,3).map(item=>item.label??item.id).join(' · ')||'None returned')}</small></article><article><span>Evidence work</span><strong>${needs.length}</strong><small>${unacknowledged.length} awaiting acknowledgement · ${escalated.length} escalated</small></article><article><span>Command / accountability</span><strong>${selectedOps?'LINKED':'NOT CONFIGURED'}</strong><small>${selectedOps?.accountability?'Accountability returned':'No accountable roster is inferred'}</small></article><article><span>FieldNet continuity</span><strong>${esc(fieldnet?.state??(fieldnet?.schemaVersion?'CENTRAL SNAPSHOT':'UNAVAILABLE'))}</strong><small>${esc(fieldnet?.conflicts?.length??'Unmeasured')} conflicts · unsynced local work unavailable centrally</small></article><article><span>PREVENT review</span><strong>${measurementOpen.length} required</strong><small>Screening only · no intervention authority</small></article><article><span>Snapshot integrity</span><strong>${esc(lastSnapshot?.integrityHash??'NOT CREATED')}</strong><small>${esc(lastSnapshot?.createdAt??'Create only from current clean runtime state')}</small></article></div><footer>${button('Copy incident brief',{tone:'secondary',action:'copy-incident-brief'})}${button('Export incident brief',{tone:'ghost',action:'export-incident-brief'})}</footer></section>
    ${whatChangedPanel(state.decisionChanges??[],{title:'Decision delta for incoming operator',limit:8})}
  </div>`;
  return shell('shift-handoff', content);
}
