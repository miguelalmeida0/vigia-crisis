import { createPipelineTask, transitionPipelineTask } from '../../../../../packages/domain/src/data-foundry/index.mjs';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { authorizeFoundryWorker, foundryWorkerGrants } from '../data-foundry/authority.mjs';
import { DataFoundryStore } from '../data-foundry/foundry-store.mjs';
import { dataFoundryPaths } from '../data-foundry/foundry-paths.mjs';
import { compileAndPersistDecisionPacket } from './compiler-service.mjs';

export async function reconcileDecisionFoundryOnce({ projectRoot = process.cwd(), incidentId = '2025-AZGCP-000597', now = '2026-08-24T00:00:00.000Z', packet = null } = {}) {
  const compiled = packet ? { packet } : await compileAndPersistDecisionPacket({ projectRoot, incidentId }), decisionPacket = compiled.packet;
  const selected = decisionPacket.acquisitionPlan.items.filter((item) => item.state === 'SELECTED'), paths = dataFoundryPaths(projectRoot), store = new DataFoundryStore({ filePath: paths.state, clock: () => new Date(now) }), state = await store.read();
  const active = new Map(state.tasks.filter((item) => !['FAILED', 'CANCELLED', 'SUPERSEDED'].includes(item.state)).map((item) => [item.inputFingerprint, item])), grants = foundryWorkerGrants({ incidentIds: [incidentId] }), created = [], reused = [];
  for (const item of selected) {
    if (active.has(item.candidateId)) { reused.push(active.get(item.candidateId)); continue; }
    const ranked = decisionPacket.rankedAcquisitions.find((candidate) => candidate.candidateId === item.candidateId);
    if (!ranked || ranked.rights !== 'READY' || ranked.components.coverageReady !== 1 || ranked.components.sourceAvailable !== 1 || ranked.components.sourceHealthy !== 1 || ranked.blockingConditions.length) throw new Error('decision_reconciliation_candidate_not_safe');
    const capability = 'ACQUIRE_PROVIDER_DATA', authority = authorizeFoundryWorker(grants, { capability, incidentId, resourceId: ranked.gapId ?? ranked.candidateId, at: now });
    if (!authority.allowed) throw new Error(`decision_reconciliation_unauthorized:${authority.reasons.join(',')}`);
    let task = createPipelineTask({ definitionId: 'vigia.decision-relevant-acquisition.v1', operation: `${capability}:${ranked.provider}:${ranked.requirement}`, inputFingerprint: ranked.candidateId, scope: { incidentId, gapId: ranked.gapId, provider: ranked.provider, decisionIds: ranked.decisionsAffected }, maxAttempts: Math.max(1, Math.min(3, decisionPacket.acquisitionPlan.budgets.maxProviderRetries)), executionBudget: { maxRuntimeMs: 60_000, maxBytes: Math.max(1, Math.min(ranked.cost.expectedBytes, decisionPacket.acquisitionPlan.budgets.maxBytesPerIncident)), maxRequests: decisionPacket.acquisitionPlan.budgets.maxRequestsPerProvider }, createdAt: now });
    task = transitionPipelineTask(task, 'READY', { at: now, reason: 'DECISION_VALUE_SELECTED_AND_CAPABILITY_AUTHORIZED' });
    await store.putTask(task); created.push(task);
    await store.recordEvent('DECISION_RELEVANT_ACQUISITION_SCHEDULED', { taskId: task.taskId, incidentId, candidateId: ranked.candidateId, decisionsAffected: ranked.decisionsAffected, packetFingerprint: decisionPacket.replayFingerprint }, now);
  }
  const next = await store.read(), blocked = decisionPacket.acquisitionPlan.items.filter((item) => item.state !== 'SELECTED' && item.state !== 'COMPLETED').map((item) => ({ candidateId: item.candidateId, state: item.state, blockers: item.failureModes }));
  const core = { schemaVersion: 'vigia.decision-foundry-reconciliation.v1', incidentId, packetFingerprint: decisionPacket.replayFingerprint, tasksCreated: created, tasksReused: reused.map((item) => item.taskId), blocked, unsafeActionsExecuted: 0, eventChainValid: DataFoundryStore.verifyEventChain(next) };
  return { ...core, fingerprint: semanticHash('decision-foundry-reconciliation', core) };
}
