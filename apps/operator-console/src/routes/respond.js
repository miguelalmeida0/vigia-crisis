import { shell, badge, button, decisionFrame, esc } from '../components.js?v=2.1.0';
import { icon } from '../icons.js?v=2.1.0';
import { tileMap } from '../map.js?v=2.1.0';
import {
  selectedEventSummary,
  selectedEventDetail,
  selectedOperationsIncident,
  eventStatus,
  eventTone,
  ageLabel,
  formatCoordinate,
  sourceRows
} from '../viewModel.js?v=2.1.0';
import { formatMeasuredNumber } from '../truth.js?v=2.1.0';

function commandReadiness(state, ops, imported = null) {
  const fieldnet = state.runtime?.fieldnet;
  const linked = Boolean(ops?.incidentId ?? ops?.id);
  const count=value=>Array.isArray(value)?value.length:value&&typeof value==='object'?Object.keys(value).length:0,manual=Boolean(imported),importedPeople=count(imported?.persons),importedResources=count(imported?.resources);
  const rows = [
    ['Objective', linked && count(ops?.objectives) ? `${count(ops.objectives)} active` : 'Not configured', linked && count(ops?.objectives) ? 'green' : 'warning'],
    ['Assignments', linked && count(ops?.assignments) ? `${count(ops.assignments)} active` : 'Not configured', linked && count(ops?.assignments) ? 'green' : 'warning'],
    ['Accountability', manual&&importedPeople?`${importedPeople} imported identity rows · availability unknown`:linked && ops?.accountability ? 'Connected' : 'Not configured', linked && ops?.accountability&&!manual ? 'green' : 'warning'],
    ['Mayday', linked && ops?.mayday ? String(ops.mayday.state ?? 'Connected') : 'Unavailable', linked && ops?.mayday ? 'critical' : 'warning'],
    ['Resource readiness', manual&&importedResources?`${importedResources} imported · readiness unknown`:linked && count(ops?.resources) ? `${count(ops.resources)} linked` : 'Not configured', linked && count(ops?.resources)&&!manual ? 'green' : 'warning'],
    ['FieldNet', fieldnet?.state === 'ready' ? 'Central ledger ready' : 'Unavailable', fieldnet?.state === 'ready' ? 'green' : 'warning']
  ];
  return `<div class="command-readiness">${rows.map(([label, value, tone]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong>${badge(value, tone, true)}</div>`).join('')}</div>`;
}

export function renderRespond(state) {
  const summary = selectedEventSummary(state);
  const event = selectedEventDetail(state) ?? summary;
  const imported=event?state.runtime?.commandIncidents?.[`manual:${event.id}`]??null:null,canonicalOps=selectedOperationsIncident(state);
  const ops = canonicalOps??imported,manualImport=Boolean(imported);
  if (!event) return shell('respond', `<div class="truth-empty"><span class="eyebrow">Respond · canonical</span><h2>No Portugal event selected</h2><p>Select a canonical Portugal event in Detect. VIGIA does not substitute an exercise incident.</p>${button('Open Detect', { tone:'primary', action:'review-incident' })}</div>`);

  const alerts = ops?.alerts ?? [];
  const needs = ops?.evidenceNeeds ?? [];
  const opportunities = ops?.observationOpportunities ?? [];
  const assets = ops?.territoryContext?.assets ?? [];
  const groups = event?.physicalSourceProfile?.families ?? [];
  const actionable = alerts.filter(alert => !['RESOLVED', 'SUPPRESSED'].includes(String(alert.lifecycleState ?? alert.state))).slice(0, 5);
  const physicalCurrent = event.physicalState?.freshness === 'current';
  const gap = needs[0]?.missingQuantity ?? needs[0]?.kind ?? event.evidenceNeed?.missingQuantity ?? null;
  const next = gap ? `Acquire ${String(gap).replaceAll('_', ' ').toLowerCase()}` : actionable[0]?.title ?? actionable[0]?.reasonCode ?? 'Monitor for new attributable evidence';
  const why = event.candidateAssessment?.conclusion ?? `${groups.length} physical source ${groups.length === 1 ? 'family is' : 'families are'} linked to this event.`;
  const decision = decisionFrame({
    now:eventStatus(event),
    next,
    why,
    nowMeta:`${ageLabel(event.lastSeenAt)} · ${event.evidenceState ?? 'evidence state unreported'}`,
    nextMeta:gap ? 'The missing evidence need is explicit.' : 'No speculative command is issued.',
    whyMeta:'Current truth and command readiness remain separate.',
    className:'decision-frame--stack'
  });
  const alertWork = actionable.length ? actionable.map((alert, index) => `<button data-action="acknowledge-alert:${esc(alert.id)}"><b>${index + 1}</b><span>${esc(alert.title ?? alert.reasonCode ?? alert.alertType ?? 'Operational alert')}<small>${esc(alert.lifecycleState ?? alert.state ?? 'open')} · ${esc(ageLabel(alert.createdAt ?? alert.detectedAt))}</small></span>${icon('chevron', 16)}</button>`).join('') : '<div class="empty-note">No active canonical alert is attached to this event.</div>';
  const left = `<aside class="command-left">
    <section class="panel command-decision"><header><span class="eyebrow">Incident decision frame</span>${badge(physicalCurrent ? 'Current physical' : 'Retained', physicalCurrent ? 'critical' : 'warning', true)}</header>${decision}</section>
    <section class="panel command-section actions-now"><span class="eyebrow">Operator work</span>${alertWork}</section>
  </aside>`;
  const map = `<section class="command-map panel"><header><div><span class="eyebrow">Incident location</span><h2>${esc(formatCoordinate(event.coordinate))}</h2></div>${badge(eventStatus(event), eventTone(event))}</header><div class="command-map__stage">${tileMap({ coordinate:event.coordinate, zoom:10, thermal:physicalCurrent, time:'latest', markers:[{ coordinate:event.coordinate, label:event.label ?? event.id, tone:eventTone(event), short:'EVENT' }], label:`Real satellite context for ${event.label ?? event.id}`, enabled:state.runtime?.session?.authenticated===true })}</div></section>`;
  const sourceList = sourceRows(state).filter(source => ['firms', 'sentinel3Pixels', 'thermal', 'fires'].includes(source.key)).slice(0, 4);
  const right = `<aside class="command-right">
    <section class="panel command-section"><header><span class="eyebrow">Command readiness</span>${badge(manualImport?(canonicalOps?'MANUAL IMPORT + CANONICAL':'MANUAL IMPORT'):ops ? 'Linked projection' : 'Not linked', manualImport?'warning':ops ? 'teal' : 'warning')}</header>${commandReadiness(state, ops, imported)}<p class="truth-note">${manualImport?`Imported roster/resource identity is provenance-bound to ${esc(imported.incident?.importHash??'an unavailable hash')}. Presence, location, readiness and availability remain UNKNOWN.`:'Unavailable integrations remain unavailable; no exercise state is substituted.'}</p></section>
    <section class="panel command-section"><header><span class="eyebrow">Physical sensing</span><strong>${groups.length} ${groups.length === 1 ? 'family' : 'families'}</strong></header>${sourceList.map(source => `<div class="comms-row"><span>${esc(source.name)}</span><strong>${esc(source.state)}</strong>${badge(source.state, source.state === 'current' || source.state === 'ready' ? 'green' : 'warning', true)}</div>`).join('') || '<p class="empty-note">No source status returned.</p>'}</section>
    <section class="panel command-section"><header><span class="eyebrow">Monitored context</span><strong>${assets.length}</strong></header>${assets.length ? assets.slice(0, 4).map(asset => `<div class="account-mini"><span class="status-dot status-dot--${asset.criticality === 'HIGH' ? 'critical' : 'warning'}"></span><strong>${esc(asset.name)}</strong>${badge(formatMeasuredNumber(asset.distanceMeters, { suffix:' m', missing:'Unmeasured' }), asset.criticality === 'HIGH' ? 'critical' : 'warning', true)}</div>`).join('') : '<p class="empty-note">No monitored context asset lies inside the configured alert radius.</p>'}<small class="truth-note">Reference proximity is not connected-device telemetry.</small></section>
  </aside>`;
  const statusBar = `<div class="incident-status-bar">${icon(physicalCurrent ? 'flame' : 'evidence', 18)}<span><small>${physicalCurrent ? 'Current physical event' : 'Retained event · not current'}</small><strong>Event ${esc(event.id)}</strong></span>${badge(eventStatus(event), physicalCurrent ? 'critical' : 'warning')}</div>`;
  const footer = `<div class="command-footer">${button('Refresh event', { tone:'secondary', iconName:'sync', action:'refresh-runtime' })}${button('Open evidence', { tone:'ghost', iconName:'evidence', action:'auto:open-evidence' })}${button('Resources boundary', { tone:'ghost', iconName:'resources', action:'auto:water-resources' })}${button('Print current view', { tone:'ghost', iconName:'evidence', action:'auto:open-print-fallback' })}</div>`;
  return shell('respond', `<div class="respond-route respond-route--coherent">
    <div class="respond-heading"><div><span class="eyebrow">Respond · incident command view</span><h2>${esc(event.label ?? event.id)}</h2></div><div class="respond-kpis"><span>Alerts<strong>${actionable.length}</strong></span><span>Evidence needs<strong>${needs.length}</strong></span><span>Next observations<strong>${opportunities.length}</strong></span><span>Containment<strong>Unmeasured</strong></span></div></div>
    ${statusBar}<div class="command-grid">${left}${map}${right}</div>${footer}
  </div>`, { fullBleed:true });
}
