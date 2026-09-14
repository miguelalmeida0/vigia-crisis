import { can, canonicalIncidentId, incidentInScope } from '../authorization.mjs';
import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { materialChange } from './material-changes.mjs';
import { operationalConsequences } from './consequences.mjs';

const rows = value => Array.isArray(value) ? value : [];
const key = canonicalIncidentId;
const unique = values => [...new Set(values.filter(Boolean))].sort();
const active = item => !['COMPLETED','RESOLVED','SATISFIED','CANCELLED','CLOSED','SUPERSEDED'].includes(item.state ?? item.status);
const sourceIds = item => unique([...rows(item.sourceIds), ...rows(item.dependsOnSourceIds),
  typeof item.sourceId === 'string' ? item.sourceId : null, typeof item.source === 'string' ? item.source : item.source?.sourceId]);
const workId = item => item.id ?? item.taskId ?? item.attentionId ?? item.decisionId;
const uniqueWork = items => [...new Map(items.filter(item=>workId(item)).map(item=>[workId(item),item])).values()];

function workChanges(items) {
  return items.flatMap(item => rows(item.history).filter(h => h.at && h.state).map(h => materialChange({
    type: ['COMPLETED','RESOLVED','SATISFIED'].includes(h.state) ? 'task_completed' : h.state === 'BLOCKED' ? 'task_blocked' : h.action === 'CREATE' ? 'task_created' : 'decision_changed',
    entity: item.incidentId, at: h.at, before: h.beforeState ?? null, after: h.state,
    summary: h.action === 'ASSUME_OWNERSHIP' ? 'Operator assumed ownership.' : 'Governed work state changed.',
    whyItMatters: 'This records work lifecycle, not successful collection or an outcome.', evidenceIds: rows(item.evidenceIds),
  })));
}

export function sourceBlastRadius({ incidents, sources, tasks, decisions, asOf }) {
  return sources.filter(source => ['DEGRADED','STALE','UNAVAILABLE','QUARANTINED','COMPROMISED'].includes(source.status)).map(source => {
    const dependentTasks = tasks.filter(item => active(item) && sourceIds(item).includes(source.sourceId));
    const dependentDecisions = decisions.filter(item => active(item) && sourceIds(item).includes(source.sourceId));
    const incidentIds = unique([...incidents.filter(item => rows(item.evidenceGraph?.sources).some(s => s.id === source.sourceId)).map(item => item.incident.id),
      ...dependentTasks.map(item => item.incidentId), ...dependentDecisions.map(item => item.incidentId)].map(key)).map(id => `incident:${id}`);
    const lastHealthyAt = source.lastSuccessAt ?? null;
    return { sourceId: source.sourceId, label: source.label ?? source.sourceId, state: source.status,
      incidentIds, assessmentIds: incidentIds, taskIds: unique(dependentTasks.map(workId)), decisionIds: unique(dependentDecisions.map(workId)),
      layers: unique([...dependentTasks, ...dependentDecisions].flatMap(item => rows(item.layerIds))),
      lastHealthyAt, elapsedSinceHealthyMs: lastHealthyAt && Date.parse(lastHealthyAt) <= Date.parse(asOf) ? Date.parse(asOf) - Date.parse(lastHealthyAt) : null,
      evidenceIds: source.lastHealthEventId ? [source.lastHealthEventId] : [],
      summary: `${source.label ?? source.sourceId} source degradation affects ${incidentIds.length} incidents and ${dependentTasks.length} active tasks.`,
      boundary: 'Only explicit source dependencies and recorded evidence associations are counted. Unidentified dependencies are not inferred.' };
  });
}

function nextActions(item, tasks, actor, outage, sources) {
  const assessment = item.assessment;
  if (!assessment) return [];
  const definitions = [];
  const support = assessment.evidenceIds;
  const recordedEvidence = rows(item.evidenceGraph?.evidence).map(e => e.id);
  if (assessment.conflictState === 'UNRESOLVED') definitions.push(['REVIEW_CONFLICT','Resolve conflicting evidence','Resolve or supersede each blocking contradiction with attributable evidence.',assessment.conflictingEvidenceIds]);
  if (recordedEvidence.length && assessment.officialState === 'NO_CURRENT_CONFIRMATION') definitions.push(['REQUEST_OFFICIAL','Request official confirmation','Admit current qualifying official evidence; a successful provider request alone is insufficient.',support.length ? support : recordedEvidence]);
  if (support.length && assessment.sourceCoverage.independentPhysicalFamilies < 2) definitions.push(['ACQUIRE_INDEPENDENT','Acquire independent observation','Admit current evidence from a second independent physical family.',support]);
  if (assessment.freshnessState === 'STALE') definitions.push(['RECHECK_STALE','Recheck stale evidence','Acquire attributable fresh evidence satisfying the existing contract.',rows(item.evaluation?.excludedEvidence).filter(e=>e.classification==='STALE').map(e=>e.evidenceId)]);
  return definitions.map(([ruleId,what,unlockCondition,evidenceIds]) => {
    const backing = tasks.filter(task => active(task) && (
      ruleId === 'REQUEST_OFFICIAL' ? sources.some(source => source.familyClass === 'OFFICIAL' && sourceIds(task).includes(source.sourceId))
        : ruleId === 'ACQUIRE_INDEPENDENT' ? sources.some(source => source.familyClass === 'PHYSICAL' && sourceIds(task).includes(source.sourceId))
          : rows(task.evidenceIds).some(id => evidenceIds.includes(id))));
    const reasons = [...assessment.reasons, ...(outage.length ? ['A recorded source dependency is degraded.'] : [])];
    return { id: semanticHash('operator-recommendation', { incidentId: item.incident.id, ruleId, evidenceIds }), incidentId: item.incident.id,
      what, why: reasons.join(' '), evidenceIds, unlockCondition, requiredCapability: 'command:incident',
      allowed: can(actor,'command:incident') && incidentInScope(actor,item.incident.id), requiresHumanApproval: true,
      workflow: 'SOURCE_RESOLUTION_REVIEW', backingWorkIds: unique(backing.map(workId)),
      owner: backing.find(t=>t.owner)?.owner ?? null, nextCheckAt: backing.map(t=>t.nextCheckAt ?? t.nextAttempt).filter(Boolean).sort()[0] ?? null,
      explanation: { output: what, reasons, evidenceIds, ruleIds: [ruleId], generatedAt: assessment.generatedAt },
      truthEffect: 'RECOMMENDATION_ONLY_NO_ASSIGNMENT_OR_DISPATCH' };
  });
}

export function projectOperatorIntelligence({ twin, actor, incidentId = null, asOf = twin?.asOf, since = null, previous = null }) {
  if (!Number.isFinite(Date.parse(asOf))) throw new Error('operator_intelligence_clock_required');
  const incidents = rows(twin?.incidents).filter(item => incidentInScope(actor,item.incident.id) && (!incidentId || key(item.incident.id) === key(incidentId)));
  const allowedIds = new Set(incidents.map(item=>key(item.incident.id)));
  const scoped = item => allowedIds.has(key(item.incidentId));
  const sources = rows(twin?.sourceHealth?.sources);
  const knownSources = new Set(sources.map(source=>source.sourceId));
  const jobs = rows(twin?.sourceResolution?.jobs).filter(scoped);
  const tasks = uniqueWork(rows(twin?.informationCollection?.requirements).filter(scoped).flatMap(requirement => rows(requirement.collectionTasks).map(task=>({
    ...task,incidentId:requirement.incidentId,requirementId:requirement.id,
    sourceIds:unique([...sourceIds(task), knownSources.has(task.provider?.id)?task.provider.id:null,
      ...jobs.filter(job=>job.requirementId===requirement.id).map(job=>job.selectedSourceId)]),
  }))));
  const decisions = uniqueWork(rows(twin?.humanAttention?.items).filter(scoped).map(item=>({...item,
    sourceIds:unique([...sourceIds(item),knownSources.has(item.providerId)?item.providerId:null,
      ...jobs.filter(job=>rows(item.resolverJobIds).includes(job.jobId)).map(job=>job.selectedSourceId)])})));
  const blastRadius = sourceBlastRadius({incidents,sources,tasks,decisions,asOf});
  const visibleSourceIds = new Set(incidents.flatMap(item=>rows(item.evidenceGraph?.sources).map(s=>s.id)).concat(tasks.flatMap(sourceIds),decisions.flatMap(sourceIds)));
  const visibleBlast = blastRadius.filter(item=>visibleSourceIds.has(item.sourceId));
  const changes = [...rows(twin?.materialChanges).filter(item=>allowedIds.has(key(item.entity)) || visibleSourceIds.has(item.entity)), ...workChanges([...tasks,...decisions])]
    .filter(item=>Date.parse(item.timestamp)<=Date.parse(asOf));
  const projections = incidents.map(item => {
    const work = tasks.filter(t=>key(t.incidentId)===key(item.incident.id));
    const failures = visibleBlast.filter(b=>b.incidentIds.some(id=>key(id)===key(item.incident.id)));
    const factors = [];
    if(item.assessment?.conflictState==='UNRESOLVED') factors.push('UNRESOLVED_EVIDENCE_CONFLICT');
    if(work.some(t=>active(t)&&Date.parse(t.deadline)<Date.parse(asOf))) factors.push('OVERDUE_GOVERNED_WORK');
    if(failures.length) factors.push('SOURCE_DEPENDENCY_DEGRADED');
    if(item.assessment?.officialState==='NO_CURRENT_CONFIRMATION') factors.push('OFFICIAL_CONFIRMATION_MISSING');
    const priority = { level: factors.some(f=>['UNRESOLVED_EVIDENCE_CONFLICT','OVERDUE_GOVERNED_WORK'].includes(f))?'HIGH':factors.length?'REVIEW':'MONITOR', factors, physicalHazardSeverity:null, boundary:'Operational attention priority, not physical danger.' };
    const associations = rows(twin.associations).filter(a=>a.incidentId===item.incident.id);
    return { incidentId:item.incident.id, assessment:item.assessment??null, priority,
      correlation:{incidentId:item.incident.id,evidenceIds:rows(item.evidenceGraph?.evidence).map(e=>e.id),correlationReasons:unique(associations.map(a=>a.method)),
        conflictingEvidenceIds:item.assessment?.conflictingEvidenceIds??[],possibleDuplicateIncidentIds:unique(rows(twin.failures).filter(f=>rows(f.incidentIds).includes(item.incident.id)).flatMap(f=>f.incidentIds).filter(id=>id!==item.incident.id&&allowedIds.has(key(id))))},
      recommendations:nextActions(item,[...work,...decisions.filter(d=>key(d.incidentId)===key(item.incident.id))],actor,failures,sources),work:work.map(t=>({id:workId(t),state:t.state,owner:t.owner??null,nextCheckAt:t.nextCheckAt??t.nextAttempt??null})),
      explanation:item.assessment?.explanation??null };
  });
  for(const item of projections){
    const prior=rows(previous?.incidents).find(p=>p.incidentId===item.incidentId);
    if(prior&&prior.priority.level!==item.priority.level)changes.push(materialChange({type:'priority_changed',entity:item.incidentId,before:prior.priority.level,after:item.priority.level,at:asOf,
      summary:`Operational priority changed from ${prior.priority.level} to ${item.priority.level}.`,whyItMatters:'Review the explicit workload/conflict factors; this is not a change in measured physical danger.',evidenceIds:item.assessment?.evidenceIds??[]}));
  }
  const retained=rows(previous?.changes).filter(c=>Date.parse(c.timestamp)<=Date.parse(asOf)&&(allowedIds.has(key(c.entity))||visibleSourceIds.has(c.entity)));
  const feed = [...new Map([...retained,...changes].filter(c=>c.type!=='new_observation').map(c=>[c.id,c])).values()].sort((a,b)=>b.timestamp.localeCompare(a.timestamp)||a.id.localeCompare(b.id));
  const unread = since && Number.isFinite(Date.parse(since)) ? feed.filter(c=>Date.parse(c.timestamp)>Date.parse(since)) : feed;
  return immutable({schemaVersion:'vigia.operator-intelligence.v1',generatedAt:asOf,incidents:projections,sourceBlastRadius:visibleBlast,
    changes:feed.slice(0,50),consequences:operationalConsequences(feed.slice(0,50),visibleBlast),attention:{total:feed.length,since,unreadCount:unread.length,items:unread.slice(0,20)},
    dependencyCoverage:{unidentifiedActiveTasks:tasks.filter(t=>active(t)&&!sourceIds(t).length).length},
    truthBoundary:'Canonical evaluation and persisted work only. Recommendations do not grant authority or execute life-safety actions.'});
}
