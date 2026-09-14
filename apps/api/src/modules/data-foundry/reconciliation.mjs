import { createPipelineTask, transitionPipelineTask } from '../../../../../packages/domain/src/data-foundry/index.mjs';
import { buildDataFoundryCatalog } from './catalog-builder.mjs';
import { authorizeFoundryWorker, foundryWorkerGrants } from './authority.mjs';
import { dataFoundryPaths } from './foundry-paths.mjs';
import { DataFoundryStore } from './foundry-store.mjs';

const capabilityFor = (requirement) => requirement === 'DECODED_WEATHER' ? 'MATERIALIZE_SILVER' : 'ACQUIRE_PROVIDER_DATA';
export async function reconcileDataFoundryOnce({ projectRoot = process.cwd(), maximumTasks = 2, now = new Date().toISOString() } = {}) {
  const paths = dataFoundryPaths(projectRoot), store = new DataFoundryStore({ filePath: paths.state, clock: () => new Date(now) }), catalog = await buildDataFoundryCatalog({ projectRoot }), state = await store.read(), active = new Set(state.tasks.filter((item) => !['COMPLETED', 'FAILED', 'CANCELLED', 'SUPERSEDED', 'BLOCKED'].includes(item.state)).map((item) => item.inputFingerprint)), selected = catalog.plan.actions.filter((item) => item.eligible && !active.has(item.id)).slice(0, maximumTasks), grants = foundryWorkerGrants({ incidentIds: uniqueIncidents(catalog.gold.incidents) }), created = [];
  for (const action of selected) {
    const capability = capabilityFor(action.requirement), authority = authorizeFoundryWorker(grants, { capability, incidentId: action.incidentId, resourceId: action.gapId, at: now }); if (!authority.allowed) throw new Error(`foundry_worker_unauthorized:${authority.reasons.join(',')}`);
    let task = createPipelineTask({ definitionId: 'vigia.data-gap-reconciliation.v1', operation: `${capability}:${action.provider}:${action.requirement}`, inputFingerprint: action.id, scope: { incidentId: action.incidentId, gapId: action.gapId, provider: action.provider }, maxAttempts: 3, executionBudget: { maxRuntimeMs: 60_000, maxBytes: Math.max(1, action.factors.expectedBytes), maxRequests: 2 }, createdAt: now }); task = transitionPipelineTask(task, 'READY', { at: now, reason: 'ELIGIBLE_GAP_PATH_AUTHORIZED' }); await store.putTask(task); created.push(task); await store.recordEvent('DATA_GAP_OPENED', { gapId: action.gapId, incidentId: action.incidentId, taskId: task.taskId, provider: action.provider }, now);
  }
  const next = await store.read(); return { schemaVersion: 'vigia.data-foundry-reconciliation.v1', observed: { openGaps: catalog.gaps.length, eligibleActions: catalog.plan.actions.filter((item) => item.eligible).length }, desired: { retainedIncidentsComplete: true }, tasksCreated: created, taskCounts: Object.fromEntries([...new Set(next.tasks.map((item) => item.state))].sort().map((stateName) => [stateName, next.tasks.filter((item) => item.state === stateName).length])), eventChainValid: DataFoundryStore.verifyEventChain(next) };
}
function uniqueIncidents(incidents = []) { return [...new Set(incidents.map((item) => item.id))].sort(); }

export async function recordProviderFailure({ projectRoot = process.cwd(), provider, endpoint, result, credentialRequirement = null, partnerRequirement = null, networkCondition = null, shortestExternalAction, maximumAttempts = 3, now = new Date().toISOString() } = {}) {
  const paths = dataFoundryPaths(projectRoot), store = new DataFoundryStore({ filePath: paths.state }), state = await store.read(), prior = state.blockedProviders[provider] ?? { attempts: 0 }, attempts = prior.attempts + 1, status = attempts >= maximumAttempts ? 'BLOCKED_EXTERNAL_ACCESS' : 'RETRYABLE'; await store.recordBlockedProvider(provider, { endpoint, attempts, lastResult: result, credentialRequirement, partnerRequirement, networkCondition, shortestExternalAction, status, updatedAt: now }); return { provider, attempts, status };
}
