import { summaryHero } from '../components/primitives.js';
import { escapeHtml } from '../utils/html.js';
import { dateTime, place, statusLabel } from '../utils/format.js';
import { preventionDisposition } from './prevention-connectivity.js';

const CLOSED_REQUEST_STATES = new Set(['accepted','rejected','cancelled']);
const TERMINAL_NEED_STATES = new Set(['RESOLVED']);

function openRequests(state) {
  return state.bootstrap.operations.evidenceRequests.filter((item) => !CLOSED_REQUEST_STATES.has(item.state));
}
function requestForNeed(state, need) {
  return state.bootstrap.operations.evidenceRequests.find((item) => item.id === need.evidenceRequestId)
    ?? state.bootstrap.operations.evidenceRequests.find((item) => item.evidenceNeedId === need.id)
    ?? null;
}
function eventForNeed(state, need) {
  return (state.live?.events ?? []).find((item) => String(item.id) === String(need.subjectId)) ?? null;
}
function findingForNeed(state,need){return(state.bootstrap?.prevention?.findings??[]).find((item)=>String(item.findingId)===String(need.subjectId))??null;}
function actorName(state, id) {
  return state.bootstrap.control.actors.find((item) => item.id === id)?.name ?? null;
}
function acquisitionState(need, request) {
  const disposition=request?.actionDisposition?.class;
  if(disposition==='INTERNALLY_CLOSABLE_NOW')return{label:'Internally closable now',tone:'active',group:'internal'};
  if(disposition==='WAITING_REMOTE_SENSOR')return{label:'Waiting remote sensor',tone:'wait',group:'sensor'};
  if(disposition==='WAITING_EXPERT_REVIEW')return{label:'Waiting expert review',tone:'active',group:'review'};
  if(disposition==='ASSOCIATION_CLOSABLE')return{label:'Association closable',tone:'wait',group:'association'};
  if(disposition==='EXTERNALLY_BLOCKED')return{label:'Externally blocked',tone:'wait',group:'unavailable'};
  if(disposition==='UNRESOLVABLE')return{label:'Unresolvable',tone:'bad',group:'unavailable'};
  if (need.state === 'RESOLVED') return { label:'Resolved', tone:'active', group:'resolved' };
  if (need.state === 'MANUAL_ESCALATION_REQUIRED') return { label:'Overdue', tone:'bad', group:'overdue' };
  if (need.state === 'FIELD_CAPACITY_NOT_CONFIGURED') return { label:'No available observation', tone:'wait', group:'unavailable' };
  if (need.state === 'WAITING_FOR_SCHEDULED_OBSERVATION' || need.state === 'WAITING_FOR_OBSERVATION') return { label:'Waiting on sensor', tone:'wait', group:'sensor' };
  if (need.state === 'NO_AVAILABLE_OBSERVATION') return { label:'No available observation', tone:'wait', group:'unavailable' };
  if (need.state === 'REQUEST_ACTIVE'&&need.missingQuantity==='human_review_of_fuel_continuity_change') return { label:request ? 'Expert scene review' : 'Needs owner', tone:'active', group:request ? 'review' : 'owner' };
  if (need.state === 'REQUEST_ACTIVE') return { label:request ? 'Field verification' : 'Needs owner', tone:'active', group:request ? 'field' : 'owner' };
  return { label:statusLabel(need.state), tone:'wait', group:'sensor' };
}
function bestMethod(need) {
  const methods = need.candidateMethods ?? [];
  const selected = methods.find((item) => item.id === need.selectedMethodId)
    ?? methods.find((item) => ['AVAILABLE_NOW','MANUAL_REQUEST','SCHEDULED_CONFIRMED'].includes(item.availability))
    ?? methods[0];
  if (selected?.label) return selected.label;
  if (need.state === 'FIELD_CAPACITY_NOT_CONFIGURED') return 'Configure field observer capacity';
  if (need.state === 'NO_AVAILABLE_OBSERVATION') return 'No feasible source currently known';
  return 'Await next attributable observation';
}
function dueAt(need, request) {
  return request?.dueAt ?? need.serviceLevel?.acknowledgementDueAt ?? need.nextObservationAt ?? null;
}
function measured(value,suffix=''){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?`${Number(value).toLocaleString()}${suffix}`:'UNMEASURED';}
function actionRows(state, { includeResolved = false } = {}) {
  const allNeeds=state.bootstrap.operations.evidenceNeeds ?? [];
  const source=includeResolved ? allNeeds : allNeeds.filter((need)=>!TERMINAL_NEED_STATES.has(need.state)||Boolean(requestForNeed(state,need)&&!CLOSED_REQUEST_STATES.has(requestForNeed(state,need).state)));
  return source.map((need) => {
    const event = eventForNeed(state, need);
    const finding = findingForNeed(state,need);
    const request = requestForNeed(state, need);
    let stateView = event?.actionNeed?.kind === 'resolve_evidence_conflict'
      ? { label:'Evidence conflict', tone:'bad', group:'conflict' }
      : event?.actionNeed?.kind === 'review_association'
      ? { label:'Association review', tone:'wait', group:'association' }
      : acquisitionState(need, request);
    const preventionState=finding?preventionDisposition(finding):null;
    if(preventionState?.kind==='measurement')stateView={label:'Measurement required',tone:'wait',group:'measurement'};
    else if(preventionState?.kind==='external_validation')stateView={label:'External validation required',tone:'active',group:'review'};
    const due=dueAt(need,request);if(request&&!CLOSED_REQUEST_STATES.has(request.state)&&Number.isFinite(Date.parse(due))&&Date.parse(due)<Date.now())stateView={label:'Overdue',tone:'bad',group:'overdue'};
    return {
      need,
      request,
      event,
      finding,
      stateView,
      eventName:finding?`Fuel continuity · ${finding.place}`:event?.label ?? event?.municipality ?? need.subjectLabel ?? need.subjectId ?? 'Unresolved physical signal',
      place:finding?'Pre-ignition screening candidate':event ? place(event) : null,
      owner:actorName(state, request?.ownerId ?? need.ownerId) ?? ((request?.ownerId ?? need.ownerId) ? 'Assigned operator' : null),
      due,
      nextStep:preventionState?.nextAction??bestMethod(need)
    };
  }).sort((a,b) => {
    const order = { overdue:0, internal:1, conflict:2, owner:3, measurement:4, sensor:5, review:6, field:7, association:8, unavailable:9, resolved:10 };
    return (order[a.stateView.group] ?? 9) - (order[b.stateView.group] ?? 9)
      || String(a.due ?? '9999').localeCompare(String(b.due ?? '9999'));
  });
}

export function commandSummary(state) {
  if (!state.bootstrap.actor?.authentication?.authenticated) return summaryHero(0,'operator actions visible','Sign in to assign evidence work or change operational state.',[
    { value:'PUBLIC', label:'evidence remains visible' },
    { value:'SIGNED', label:'changes are attributable' }
  ]);
  const rows = actionRows(state);
  const owned = openRequests(state).length;
  const ownerMissing = rows.filter((item) => item.stateView.group === 'owner').length;
  const overdue = rows.filter((item) => item.stateView.group === 'overdue').length;
  const waiting = rows.filter((item) => item.stateView.group === 'sensor').length;
  const unavailable = rows.filter((item) => item.stateView.group === 'unavailable').length;
  return summaryHero(rows.length,'open evidence work',`${owned} owned request${owned===1?'':'s'}; resolved gaps remain visible until their request is reconciled.`,[
    { value:ownerMissing, label:'need owner' },
    { value:waiting, label:'waiting on observation' },
    { value:unavailable, label:'no available observation' },
    { value:overdue, label:'overdue' }
  ]);
}

export function commandIntro() { return ''; }

function effectivenessStrip(effectiveness={}){
  return `<section class="action-effectiveness" aria-label="Action effectiveness"><header><span>ACTION EFFECTIVENESS</span><strong>Does evidence work close uncertainty?</strong><small>${escapeHtml(effectiveness.measurementBasis??'Metrics appear when persisted request lifecycle timestamps are available.')}</small></header><div><article><b>${measured(effectiveness.internallyActionableRequests)}</b><span>internally actionable</span></article><article><b>${measured(effectiveness.requestsProducingNewEvidence)}</b><span>evidence-producing</span></article><article><b>${measured(effectiveness.unknownsClosedWithEvidence)}</b><span>unknowns closed with evidence</span></article><article><b>${measured(effectiveness.blockedRequests)}</b><span>blocked / human-dependent</span></article><article><b>${measured(effectiveness.waitingExpertReview)}</b><span>waiting expert review</span></article><article><b>${measured(effectiveness.actionableEvidenceYieldPercent,'%')}</b><span>completed action yield</span></article><article><b>${measured(effectiveness.evidenceYieldPercent,'%')}</b><span>all-history yield</span></article><article><b>${escapeHtml(effectiveness.requestCreationState??'UNMEASURED')}</b><span>auto request creation</span></article></div></section>`;
}
function systemActionStrip(operations={}){
  const system=operations.systemActionability??{},effectiveness=operations.effectiveness??{},rows=system.rows??[];
  const cards=rows.length?rows.map((item)=>`<article class="system-action-row"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(statusLabel(item.state))}</strong><small>${item.evidenceProduced?'New diagnostic or physical evidence produced':'Executed · no new evidence this cycle'}${item.unknownsClosed?` · ${item.unknownsClosed} unknowns closed`:''}</small></article>`).join(''):'<article class="system-action-row is-loading"><span>AUTOMATIC CYCLE</span><strong>SCHEDULED</strong><small>Source re-check, association, provenance and remote matching will execute without field capacity.</small></article>';
  return `<section class="system-action-workbench" aria-label="System-actionable evidence work"><header><div><span>SYSTEM-ACTIONABLE</span><h2>VIGIA executes what does not require a person.</h2></div><p>${escapeHtml(system.measurementBasis??'Automatic evidence work is measured separately from human and field operations.')}</p></header><div class="system-action-metrics"><article><b>${measured(system.systemActionable)}</b><span>system-actionable</span></article><article><b>${measured(system.systemCompleted)}</b><span>system-completed</span></article><article><b>${measured(system.evidenceProducing)}</b><span>evidence-producing</span></article><article><b>${measured(system.unknownsClosed)}</b><span>unknowns closed</span></article><article><b>${measured(system.yieldPercent,'%')}</b><span>cycle evidence yield</span></article></div><div class="system-action-ledger">${cards}</div><footer><span>HUMAN-REVIEW-ACTIONABLE <b>${measured(effectiveness.waitingExpertReview)}</b></span><span>FIELD-BLOCKED <b>${measured(effectiveness.unownedWork)}</b></span><span>EXTERNALLY-BLOCKED <b>${measured(effectiveness.blockedRequests)}</b></span></footer></section>`;
}

export function commandWorkbench(state) {
  if (!state.bootstrap.actor?.authentication?.authenticated) return `<div class="action-workbench public-action-proof"><header class="action-workbench-head"><div><span>ACTION · MEASURED EVIDENCE CLOSURE</span><h2>What uncertainty did the work actually close?</h2></div><p>Automatic system work remains visible. Request identity and human mutation remain behind attributable operator authentication.</p></header>${systemActionStrip(state.bootstrap.operations??{})}${effectivenessStrip(state.bootstrap.operations?.effectiveness??{})}<div class="action-auth-workbench"><span>HUMAN / FIELD ACTION CONTROL</span><h2>Operator sign-in required</h2><p>Assignments and operational changes require an attributable operator identity. Automatic source, association and provenance work continues without field capacity.</p><button type="button" class="primary-action" data-action="authenticate">Sign in</button></div></div>`;
  const allRows = actionRows(state,{includeResolved:state.filter==='resolved'});
  const rows = state.filter==='resolved' ? allRows.filter((item)=>item.stateView.group==='resolved')
    : state.filter==='all' ? allRows
    : allRows.filter((item)=>item.stateView.group===state.filter);
  const body = rows.map(({ need, request, event, finding, eventName, place:location, owner, due, stateView, nextStep }) => {
    const kind = event ? 'event' : finding&&!request ? 'finding' : request ? 'operation' : null;
    const id = event?.id ?? request?.id ?? finding?.findingId;
    const attributes = kind && id ? ` data-select-kind="${kind}" data-select-id="${escapeHtml(id)}"` : '';
    return `<button type="button" class="action-ledger-row"${attributes}>
      <span class="action-event"><strong>${escapeHtml(eventName)}</strong><small>${escapeHtml(location ?? need.kind ?? 'Physical-evidence gap')}</small></span>
      <span><b>${need.state==='RESOLVED'?'Reconciliation':'Missing knowledge'}</b>${escapeHtml(need.state==='RESOLVED'?'Evidence gap resolved; request closure pending.':need.missingQuantity ?? need.reason ?? 'Physical confirmation')}</span>
      <span><b>Best next step</b>${escapeHtml(need.state==='RESOLVED'?'Review and close the open request':nextStep)}</span>
      <span><b>Owner</b>${escapeHtml(owner ?? 'Not assigned')}</span>
      <span><b>Due</b>${due ? escapeHtml(dateTime(due)) : 'Not scheduled'}</span>
      <span><i class="action-state is-${stateView.tone}"></i>${escapeHtml(stateView.label)}</span>
    </button>`;
  }).join('');
  const ownerMissing = rows.filter((item) => item.stateView.group === 'owner').length;
  const waiting = rows.filter((item) => item.stateView.group === 'sensor').length;
  const unavailable = rows.filter((item) => item.stateView.group === 'unavailable').length;
  const review = rows.filter((item) => item.stateView.group === 'review').length;
  const field = rows.filter((item) => item.stateView.group === 'field').length;
  const overdue = rows.filter((item) => item.stateView.group === 'overdue').length;
  const association = rows.filter((item) => item.stateView.group === 'association').length;
  const conflict = rows.filter((item) => item.stateView.group === 'conflict').length;
  const measurement = rows.filter((item) => item.stateView.group === 'measurement').length;
  const resolved = rows.filter((item) => item.stateView.group === 'resolved').length;
  const effectiveness=state.bootstrap.operations.effectiveness??{};
  const effectivenessHtml=effectivenessStrip(effectiveness);
  return `<div class="action-workbench">
    <header class="action-workbench-head"><div><span>ACTION · ACCOUNTABLE EVIDENCE WORK</span><h2>What must happen next?</h2></div><p>Every row binds one real unknown to the best defensible observation path, owner and due time. Missing capacity stays visible.</p></header>
    ${systemActionStrip(state.bootstrap.operations??{})}${effectivenessHtml}
    <div class="action-state-strip"><span><i class="action-state is-bad"></i>${overdue} overdue</span><span><i class="action-state is-bad"></i>${conflict} evidence conflict</span><span><i class="action-state is-bad"></i>${ownerMissing} need owner</span><span><i class="action-state is-wait"></i>${measurement} PREVENT measurements</span><span><i class="action-state is-wait"></i>${waiting} waiting on sensor</span><span><i class="action-state is-active"></i>${review} external validation</span><span><i class="action-state is-active"></i>${field} field verification</span><span><i class="action-state is-wait"></i>${association} association review</span><span><i class="action-state is-wait"></i>${unavailable} no available path</span><span><i class="action-state is-active"></i>${resolved} resolved · reconcile</span></div>
    <div class="action-ledger-head"><span>Event</span><span>Unknown / reconciliation</span><span>Best next step</span><span>Owner</span><span>Due</span><span>State</span></div>
    <div class="action-ledger">${body || '<div class="action-ledger-empty"><strong>No unresolved evidence gaps.</strong><p>The acquisition ledger has no active work at this governed clock.</p></div>'}</div>
  </div>`;
}

export function workDrawerHtml(state){
  const operations=state.bootstrap?.operations??{},effectiveness=operations.effectiveness??{},rows=actionRows(state).slice(0,16),alerts=(state.persistentAlerts??[]).filter((item)=>!item.acknowledgedAt&&!['RESOLVED','SUPPRESSED'].includes(item.lifecycleState)),handoff=state.bootstrap?.operationsHandoff??{},proof=handoff.measuredProof??{},liveMetrics=state.operationsMetrics??{};
  const closedWithEvidence=effectiveness.unknownsClosedWithEvidence??0,producing=effectiveness.requestsProducingNewEvidence??0,overdue=effectiveness.overdue??rows.filter((item)=>item.stateView.group==='overdue').length;
  const cards=rows.map(({need,request,event,finding,eventName,owner,due,stateView,nextStep})=>{const kind=event?'event':finding&&!request?'finding':'operation',id=event?.id??finding?.findingId??request?.id;return`<button type="button" class="work-drawer-row" data-select-kind="${kind}" data-select-id="${escapeHtml(id??'')}"><span class="work-state is-${stateView.tone}">${escapeHtml(stateView.label)}</span><strong>${escapeHtml(eventName)}</strong><small>${escapeHtml(finding?nextStep:(need.missingQuantity??need.reason??'Evidence gap'))}</small><footer><span>${escapeHtml(owner??'Unassigned')}</span><span>${due?escapeHtml(dateTime(due)):'No due time'}</span></footer></button>`;}).join('');
  const alertLabel=state.operationsError?'Live Alert Inbox unavailable':`${alerts.length} unacknowledged operational alert${alerts.length===1?'':'s'}`;
  const opportunityCount=liveMetrics.observationOpportunities?.total??proof.opportunities,opportunityResults=liveMetrics.observationOpportunities?.results??proof.opportunityResults;
  const categories=[
    ['HUMAN ACTION',rows.filter((item)=>['owner','review','association'].includes(item.stateView.group)).length,'Attributable review, ownership or association decision'],
    ['PREVENT MEASUREMENT',rows.filter((item)=>item.stateView.group==='measurement').length,'Physical change whose intervention geometry remains unstable or no-zone'],
    ['AUTOMATIC / SYSTEM',operations.systemActionability?.systemActionable,'Source re-check, provenance and bounded association'],
    ['WAITING SENSOR',rows.filter((item)=>item.stateView.group==='sensor').length,'A real observation path exists but has not completed'],
    ['FIELD BLOCKED',rows.filter((item)=>['field','unavailable'].includes(item.stateView.group)).length,'Human capacity or feasible observation path is missing'],
    ['EVIDENCE CONFLICT',rows.filter((item)=>item.stateView.group==='conflict').length,'Contradictory physical evidence needs explicit resolution']
  ];
  return `<div class="work-drawer"><section class="work-category-grid" aria-label="Work categories">${categories.map(([label,value,detail])=>`<article><span>${label}</span><b>${measured(value)}</b><p>${escapeHtml(detail)}</p></article>`).join('')}</section><section class="work-effectiveness"><article><b>${rows.length}</b><span>Open</span></article><article><b>${overdue}</b><span>Overdue</span></article><article><b>${producing}</b><span>Evidence-producing</span></article><article><b>${closedWithEvidence}</b><span>Closed with evidence</span></article></section><button type="button" class="drawer-alert-link ${state.operationsError?'is-unavailable':''}" data-action="alerts"><b>${state.operationsError?'—':alerts.length}</b><span>${escapeHtml(alertLabel)}</span></button>${state.operationsError?'<button type="button" class="drawer-retry" data-action="retry-operations">Retry operations dependency</button>':''}<section class="observation-opportunity-summary"><span>OBSERVATION OPPORTUNITY</span><strong>${measured(opportunityCount)} governed opportunities · ${measured(opportunityResults)} attributable results</strong><p>${state.operationsError?'Live opportunity state is unavailable while PostGIS is offline. ':''}${proof.mode==='CONTROLLED_REPLAY_OF_REAL_PHYSICAL_OBSERVATIONS'?'The visible denominator is controlled proof from real observations; it is not injected into the production event graph.':'Live persisted opportunity state.'}</p></section><section class="operations-proof-summary"><span>OPERATIONS ENGINE</span><strong>${escapeHtml(statusLabel(handoff.status??'not handed off'))}</strong><p>${measured(proof.alertCount)} controlled-proof alerts · ${measured(proof.acknowledgements)} acknowledgements · ${measured(proof.escalations)} escalations · ${measured(proof.resolutions)} resolutions. Controlled proof is never presented as current production state.</p></section><div class="work-drawer-list">${cards||'<div class="drawer-empty"><strong>No open evidence work.</strong><p>Automatic and human work will appear here when a persisted evidence need exists.</p></div>'}</div><p class="work-drawer-note">Work volume is not effectiveness. Evidence yield and uncertainty closure are measured separately.</p></div>`;
}

export const commandFilters = [['all','All open'],['overdue','Overdue'],['conflict','Evidence conflict'],['owner','Needs owner'],['measurement','PREVENT measurement'],['sensor','Waiting sensor'],['review','External validation'],['field','Field verification'],['association','Association review'],['unavailable','No available path'],['resolved','Resolved']];
