export function emptyModel() {
  return {
    phase:'loading', panel:'command', node:{ connectionState:'REGIONAL_DISCONNECTED' }, incident:null,
    observations:[], tasks:[], conflicts:[], devices:[], sensorGateway:null, release:null, truthGraph:null, freshness:null, map:null, replay:null,
    metrics:{}, syncQueue:{ items:[], pendingTotal:0 }, timings:{}, selected:null, message:null
  };
}

const take = (result) => result?.payload ?? result ?? null;
export async function loadFieldNet(client, incidentHint = null) {
  const loadStartedAt = performance.now();
  const proofPromise = fetch('/data/fieldnet-proof-summary.json', { cache:'no-store' }).then((response) => response.ok ? response.json() : null).catch(() => null);
  const sensorGatewayPromise = client.sensorGateway().catch(() => ({ payload:{ schemaVersion:'vigia.field-sensor-gateway-status.v1', hardware:{ status:'RUNTIME_UPGRADE_REQUIRED', supportedFamiliesDetected:[] }, adapters:{}, qualification:'The running Field Node predates the gateway route; local incident work remains available.' } }));
  const stateResult = await client.state();
  const incidentListResult = await client.incidents();
  const state = take(stateResult);
  const incidents = take(incidentListResult)?.incidents ?? [];
  const hinted = incidents.find((item) => item.incidentId === incidentHint);
  const incidentId = hinted?.incidentId ?? state.incidents?.find((item) => item.incidentId === incidentHint)?.incidentId ?? incidents[0]?.incidentId ?? state.incidents?.[0]?.incidentId;
  if (!incidentId) throw new Error('fieldnet_incident_not_available');
  const requests = await Promise.all([
    client.incident(incidentId), client.observations(incidentId), client.tasks(incidentId), client.conflicts(incidentId),
    client.devices(), client.truthGraph(incidentId), client.sourceFreshness(incidentId), client.offlineMap(incidentId),
    client.replay(incidentId), client.metrics(incidentId), client.syncQueue(), sensorGatewayPromise, client.release()
  ]);
  const [incident, observations, tasks, conflicts, devices, truthGraph, freshness, map, replay, metrics, syncQueue, sensorGateway, release] = requests.map(take), proof = await proofPromise;
  const timings = { workspaceLoadMs:Number((performance.now() - loadStartedAt).toFixed(1)), mapLoadMs:requests[7].durationMs };
  const mappedTasks = new Map((map?.layers?.tasks ?? []).map((task) => [task.taskId, task]));
  const mappedConflicts = new Map((map?.layers?.conflicts ?? []).map((conflict) => [conflict.conflictId, conflict]));
  return { phase:'ready', panel:'command', node:state, release, incident, incidentId, observations:observations.observations ?? [], tasks:(tasks.tasks ?? []).map((task) => ({ ...task, ...mappedTasks.get(task.taskId) })), conflicts:(conflicts.conflicts ?? []).map((conflict) => ({ ...conflict, ...mappedConflicts.get(conflict.conflictId) })), devices:devices.devices ?? [], sensorGateway, truthGraph, freshness, map, replay, metrics, syncQueue, proof, timings, selected:null, message:null };
}

export async function refreshFieldNet(client, model) {
  const fresh = await loadFieldNet(client, model.incidentId);
  return { ...fresh, panel:model.panel, selected:model.selected, replayIndex:model.replayIndex, timings:{ ...model.timings, ...fresh.timings }, message:model.message };
}

export function fieldNetSummary(model) {
  const synchronizedAt = [...(model.replay?.mutations ?? [])].reverse().find((item) => ['SYNC_ACKNOWLEDGED','CENTRAL_EVENT_SNAPSHOT','SYNC_COMPLETED'].includes(item.type))?.wallClockAt;
  return {
    connectionState:model.node?.connectionState ?? 'REGIONAL_DISCONNECTED',
    observations:model.observations.length,
    activeTasks:model.tasks.filter((item) => !['COMPLETED','CANCELLED'].includes(item.state)).length,
    conflicts:model.conflicts.filter((item) => item.state === 'OPEN').length,
    pending:Number(model.syncQueue?.pendingTotal ?? model.metrics?.pendingSync ?? 0),
    devices:model.devices.filter((item) => item.active !== false).length,
    lastSync:synchronizedAt ?? model.incident?.importedAt ?? model.node?.generatedAt,
    releaseId:model.release?.releaseId??model.node?.releaseId??'UNVERSIONED',
    releaseCompatibility:model.node?.releaseCompatibility?.state??'UNMEASURED'
  };
}
