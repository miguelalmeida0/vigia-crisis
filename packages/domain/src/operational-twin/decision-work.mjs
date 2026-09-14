import { canonicalIncidentId, incidentInScope } from '../authorization.mjs';

export const rows = value => Array.isArray(value) ? value : [];
export const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value))].sort();
export const workId = item => item.id ?? item.taskId ?? item.attentionId ?? item.decisionId;
export const activeWork = item => !['COMPLETED','RESOLVED','SATISFIED','CANCELLED','CLOSED','SUPERSEDED','TERMINAL_UNAVAILABLE','REJECTED'].includes(item.state ?? item.status);
export const sourceRefs = item => unique([...rows(item.sourceIds), ...rows(item.dependsOnSourceIds), item.sourceId, typeof item.source === 'string' ? item.source : item.source?.sourceId]);
const dedup = items => [...new Map(items.filter(workId).map(item => [workId(item),item])).values()];

export function decisionWork(twin, actor, incidentId = null) {
  const scoped = item => incidentInScope(actor,item.incidentId) && (!incidentId || canonicalIncidentId(item.incidentId) === canonicalIncidentId(incidentId));
  const requirements = dedup([...rows(twin.informationCollection?.requirements), ...rows(twin.crisisAutopilotCoordination?.informationRequirements)].filter(scoped));
  const sources = rows(twin.sourceHealth?.sources), known = new Set(sources.map(source => source.sourceId));
  const tasks = dedup([...requirements.flatMap(requirement => rows(requirement.collectionTasks).map(task => ({...task,incidentId:requirement.incidentId,requirementId:requirement.id,
    deadline:task.deadline ?? requirement.deadline ?? null,owner:task.owner ?? requirement.ownerPolicy?.automationOwner ?? null,
    sourceIds:unique([...sourceRefs(task),known.has(task.provider?.id) ? task.provider.id : null]),
    providerId:task.provider?.id ?? task.providerId ?? null}))), ...rows(twin.crisisAutopilotCoordination?.collectionTasks).filter(scoped)]);
  const decisions = dedup([...rows(twin.humanAttention?.items), ...rows(twin.decisions)].filter(scoped));
  return {requirements,tasks,decisions,sources,scoped};
}
