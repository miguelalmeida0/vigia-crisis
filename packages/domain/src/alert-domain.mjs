import { createHash } from 'node:crypto';

export const ALERT_LIFECYCLE_STATES = Object.freeze([
  'CANDIDATE', 'OPEN', 'ACKNOWLEDGED', 'OWNED', 'ESCALATED', 'SUPPRESSED', 'RESOLVED', 'FAILED'
]);
export const DELIVERY_STATES = Object.freeze(['PENDING', 'ATTEMPTING', 'DELIVERED', 'RETRY_WAIT', 'FAILED', 'CONFIGURED_OFF']);
export const ACKNOWLEDGEMENT_STATES = Object.freeze(['UNACKNOWLEDGED', 'ACKNOWLEDGED', 'OWNED', 'REASSIGNED']);
export const ESCALATION_STATES = Object.freeze(['NOT_DUE', 'DUE', 'ESCALATED', 'EXHAUSTED']);

export const SHADOW_ALERT_POLICIES = Object.freeze([
  Object.freeze({ id: 'evidence-conflict', version: 1, type: 'EVIDENCE_CONFLICT', priority: 'HIGH', acknowledgeWithinMinutes: 5, escalateAfterMinutes: 10 }),
  Object.freeze({ id: 'current-multisource-physical', version: 1, type: 'MULTISOURCE_PHYSICAL', priority: 'HIGH', acknowledgeWithinMinutes: 5, escalateAfterMinutes: 10 }),
  Object.freeze({ id: 'physical-first-unreported', version: 1, type: 'PHYSICAL_FIRST_UNREPORTED', priority: 'HIGH', acknowledgeWithinMinutes: 5, escalateAfterMinutes: 10 }),
  Object.freeze({ id: 'new-physical-candidate', version: 1, type: 'NEW_PHYSICAL_CANDIDATE', priority: 'MODERATE', acknowledgeWithinMinutes: 10, escalateAfterMinutes: 20 }),
  Object.freeze({ id: 'current-physical-fire', version: 1, type: 'CURRENT_PHYSICAL_FIRE', priority: 'MODERATE', acknowledgeWithinMinutes: 10, escalateAfterMinutes: 20 }),
  Object.freeze({ id: 'prevention-review-due', version: 1, type: 'PREVENTION_REVIEW_DUE', priority: 'MODERATE', acknowledgeWithinMinutes: 60, escalateAfterMinutes: 240 }),
  Object.freeze({ id: 'source-coverage-loss', version: 1, type: 'SOURCE_COVERAGE_LOSS', priority: 'HIGH', acknowledgeWithinMinutes: 10, escalateAfterMinutes: 30 })
]);

function normalizedFamilies(event) {
  return [...new Set((event.physicalSourceProfile?.families ?? event.observations?.map((item) => item.sourceFamily) ?? [])
    .map((item) => String(item ?? '').toLowerCase()).filter(Boolean))].sort();
}
function conflict(event) {
  return event.associationState === 'ambiguous'
    || event.evidenceState === 'association-uncertain'
    || event.evidenceFusion?.ambiguities?.some((item) => ['conflicting_physical_observations', 'association_ambiguous'].includes(item.kind));
}
function reportPresent(event) {
  return Boolean(event.reportState?.firstAt || (event.observations ?? []).some((item) => item.type === 'report'));
}

export function alertEvidenceVersion(event = {}) {
  const observations = (event.observations ?? []).map((item) => ({
    id: item.id ?? null, at: item.at ?? null, type: item.type ?? null, sourceFamily: item.sourceFamily ?? null,
    frpMw: Number.isFinite(Number(item.frpMw)) ? Number(item.frpMw) : null
  })).sort((a, b) => `${a.at}:${a.id}`.localeCompare(`${b.at}:${b.id}`));
  const material = {
    eventId: event.id ?? null, physicalOperationalState: event.physicalOperationalState ?? null,
    physicalFreshness: event.physicalState?.freshness ?? null, physicalLastAt: event.physicalState?.lastAt ?? null,
    reportActivity: event.reportState?.sourceActivity ?? null, reportFirstAt: event.reportState?.firstAt ?? null,
    evidenceState: event.evidenceState ?? null, associationState: event.associationState ?? null,
    families: normalizedFamilies(event), observations
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(material)).digest('hex')}`;
}

function policyMatch(policy, event) {
  if (['PREVENTION_REVIEW_DUE','SOURCE_COVERAGE_LOSS'].includes(policy.type)) return {matched:false,reasonCode:'SUBJECT_TYPE_NOT_APPLICABLE'};
  const current = event.physicalState?.freshness === 'current';
  if (!current) return { matched: false, reasonCode: event.physicalState?.freshness === 'delayed' ? 'DELAYED_PHYSICAL_NOT_ACTIONABLE' : 'NON_CURRENT_PHYSICAL_NOT_ACTIONABLE' };
  if (policy.type === 'EVIDENCE_CONFLICT') return { matched: conflict(event), reasonCode: conflict(event) ? 'CURRENT_EVIDENCE_CONFLICT' : 'NO_EVIDENCE_CONFLICT' };
  if (policy.type === 'MULTISOURCE_PHYSICAL') {
    const matched = event.physicalOperationalState === 'CURRENT_MULTISOURCE_PHYSICAL_FIRE' || normalizedFamilies(event).length >= 2;
    return { matched, reasonCode: matched ? 'CURRENT_INDEPENDENT_PHYSICAL_FAMILIES' : 'SINGLE_PHYSICAL_FAMILY' };
  }
  if (policy.type === 'PHYSICAL_FIRST_UNREPORTED') {
    const matched = event.physicalFirst === true && !reportPresent(event);
    return { matched, reasonCode: matched ? 'CURRENT_PHYSICAL_PRECEDES_REPORT' : 'NOT_PHYSICAL_FIRST_UNREPORTED' };
  }
  if (policy.type === 'NEW_PHYSICAL_CANDIDATE') {
    const matched = event.physicalOperationalState === 'NEW_PHYSICAL_CANDIDATE';
    return { matched, reasonCode: matched ? 'NEW_CURRENT_PHYSICAL_CANDIDATE' : 'NOT_NEW_PHYSICAL_CANDIDATE' };
  }
  if(policy.type==='CURRENT_PHYSICAL_FIRE'){const matched = event.physicalOperationalState === 'CURRENT_PHYSICAL_FIRE';return { matched, reasonCode: matched ? 'CURRENT_PHYSICAL_FIRE' : 'NOT_CURRENT_PHYSICAL_FIRE' };}
  return{matched:false,reasonCode:'POLICY_NOT_APPLICABLE'};
}

function subjectAlert({subjectType,subjectId,policy,title,reasonCode,evidence,payload,evaluatedAt}){
  const at=evaluatedAt instanceof Date?evaluatedAt:new Date(evaluatedAt),evidenceVersion=`sha256:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`;
  return{subjectType,subjectId,eventId:null,policyId:policy.id,policyVersion:policy.version,alertType:policy.type,priority:policy.priority,evidenceVersion,dedupeKey:`${subjectType}:${subjectId}:${policy.id}`,materialKey:`${subjectType}:${subjectId}:${policy.id}:${evidenceVersion}`,lifecycleState:'OPEN',openedAt:at.toISOString(),acknowledgeDueAt:new Date(at.getTime()+policy.acknowledgeWithinMinutes*60_000).toISOString(),escalateAt:new Date(at.getTime()+policy.escalateAfterMinutes*60_000).toISOString(),title,reasonCode,physicalState:null,freshness:null,payload};
}

export function evaluateSourceCoverage(sourceFamily,source={}, {evaluatedAt=new Date()}={}){
  const policy=SHADOW_ALERT_POLICIES.find((item)=>item.type==='SOURCE_COVERAGE_LOSS'),subjectId=`source:${sourceFamily}`,state=String(source.state??'unknown').toLowerCase(),configured=source.configured!==false&&source.configurationState!=='not_configured',failed=configured&&['unavailable','failed','error','degraded'].includes(state);
  const evidence={sourceFamily,state,configured,latestPollAt:source.latestPollAt??source.lastPollAt??null,latestSuccessAt:source.latestSuccessAt??null,errorPresent:Boolean(source.error)};
  const evidenceVersion=`sha256:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`,reasonCode=failed?'CONFIGURED_SOURCE_COVERAGE_UNAVAILABLE':state==='stale'?'STALE_OBSERVATION_SOURCE_REACHABLE':'SOURCE_NOT_IN_FAILURE_STATE';
  const decision={eventId:subjectId,policyId:policy.id,policyVersion:policy.version,evidenceVersion,evaluatedAt:(evaluatedAt instanceof Date?evaluatedAt:new Date(evaluatedAt)).toISOString(),fired:failed,reasonCode};
  return{decision,alert:failed?subjectAlert({subjectType:'PHYSICAL_SOURCE',subjectId,policy,title:`${sourceFamily} physical coverage unavailable`,reasonCode,evidence,payload:{sourceFamily,state,latestPollAt:evidence.latestPollAt,latestSuccessAt:evidence.latestSuccessAt,errorPresent:evidence.errorPresent},evaluatedAt}):null};
}

export function evaluatePreventionReviewQueue(requests=[], {evaluatedAt=new Date(),territoryId='territory:portugal-shadow'}={}){
  const at=evaluatedAt instanceof Date?evaluatedAt:new Date(evaluatedAt),active=new Set(['requested','acknowledged','in_progress','submitted']),due=requests.filter((item)=>item.targetType==='prevention_finding'&&active.has(item.state)&&Number.isFinite(Date.parse(item.dueAt??''))&&Date.parse(item.dueAt)<=at.getTime()).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
  const policy=SHADOW_ALERT_POLICIES.find((item)=>item.type==='PREVENTION_REVIEW_DUE'),subjectId=`prevention-review-queue:${territoryId}`,evidence={count:due.length,oldestDueAt:due[0]?.dueAt??null,requestVersions:due.map((item)=>`${item.id}:${item.findingVersion??'unversioned'}`).sort()};
  const evidenceVersion=`sha256:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`,reasonCode=due.length?'PREVENTION_REVIEW_DEADLINE_DUE':'NO_PREVENTION_REVIEW_DUE';
  const decision={eventId:subjectId,policyId:policy.id,policyVersion:policy.version,evidenceVersion,evaluatedAt:at.toISOString(),fired:due.length>0,reasonCode};
  return{decision,alert:due.length?subjectAlert({subjectType:'PREVENTION_REVIEW_QUEUE',subjectId,policy,title:`${due.length} prevention review${due.length===1?'':'s'} due`,reasonCode,evidence,payload:{territoryId,dueCount:due.length,oldestDueAt:due[0].dueAt,requestIds:due.slice(0,25).map((item)=>item.id),truncated:due.length>25},evaluatedAt:at}):null};
}

export function evaluateAlertPolicies(event, { policies = SHADOW_ALERT_POLICIES, evaluatedAt = new Date() } = {}) {
  const at = evaluatedAt instanceof Date ? evaluatedAt : new Date(evaluatedAt);
  const evidenceVersion = alertEvidenceVersion(event);
  const evaluations = policies.map((policy) => ({ policy, ...policyMatch(policy, event) }));
  const winner = evaluations.find((item) => item.matched) ?? null;
  const decisions = evaluations.map((item) => ({
    eventId: event.id, policyId: item.policy.id, policyVersion: item.policy.version,
    evidenceVersion, evaluatedAt: at.toISOString(), fired: item === winner,
    reasonCode: item === winner ? item.reasonCode : item.matched ? 'SUPPRESSED_BY_HIGHER_PRECEDENCE_POLICY' : item.reasonCode
  }));
  if (!winner) return { alert: null, decisions };
  const policy = winner.policy;
  const dueAt = new Date(at.getTime() + policy.acknowledgeWithinMinutes * 60_000).toISOString();
  return {
    decisions,
    alert: {
      subjectType: 'FIRE_EVENT', subjectId: String(event.id), eventId: String(event.id),
      policyId: policy.id, policyVersion: policy.version, alertType: policy.type, priority: policy.priority,
      evidenceVersion, dedupeKey: `${event.id}:${policy.id}`,
      materialKey: `${event.id}:${policy.id}:${evidenceVersion}`,
      lifecycleState: 'OPEN', openedAt: at.toISOString(), acknowledgeDueAt: dueAt,
      escalateAt: new Date(at.getTime() + policy.escalateAfterMinutes * 60_000).toISOString(),
      title: String(event.label ?? `Physical event ${event.id}`), reasonCode: winner.reasonCode,
      physicalState: event.physicalOperationalState ?? 'CURRENT_PHYSICAL_FIRE', freshness: 'current',
      payload: {
        sourceEventId: event.sourceEventId ?? event.id, controlledReplay: event.controlledReplay === true,
        coordinate: Array.isArray(event.coordinate) ? event.coordinate : null,
        sourceFamilies: normalizedFamilies(event), evidenceState: event.evidenceState ?? null,
        reportState: event.reportState?.sourceActivity ?? null, physicalLastAt: event.physicalState?.lastAt ?? event.lastSeenAt ?? null
      }
    }
  };
}

export function assertAlertTransition(from, to) {
  const allowed = {
    CANDIDATE: new Set(['OPEN', 'FAILED']), OPEN: new Set(['ACKNOWLEDGED', 'OWNED', 'ESCALATED', 'SUPPRESSED', 'RESOLVED', 'FAILED']),
    ACKNOWLEDGED: new Set(['OWNED', 'ESCALATED', 'SUPPRESSED', 'RESOLVED']), OWNED: new Set(['ACKNOWLEDGED', 'ESCALATED', 'SUPPRESSED', 'RESOLVED']),
    ESCALATED: new Set(['ACKNOWLEDGED', 'OWNED', 'SUPPRESSED', 'RESOLVED']), SUPPRESSED: new Set(['OPEN', 'RESOLVED']),
    RESOLVED: new Set(['OPEN']), FAILED: new Set(['OPEN', 'RESOLVED'])
  };
  if (!allowed[from]?.has(to)) throw new Error('invalid_alert_state_transition');
  return true;
}
