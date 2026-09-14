import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { actionClass, normalizedActions, sourceReference } from './crisis-autopilot-trigger-mapping.mjs';

const MAX_RECORDS_PER_COLLECTION = 5_000;

export function assertCoordinatorCapacity(rows, collection) {
  if (rows.length >= MAX_RECORDS_PER_COLLECTION) throw Object.assign(new Error('crisis_autopilot_coordinator_capacity_reached'), { statusCode: 507, details: { collection, max: MAX_RECORDS_PER_COLLECTION } });
}

function upsert(rows, id, value) {
  const index = rows.findIndex((item) => item.id === id);
  if (index < 0) { assertCoordinatorCapacity(rows, value.kind); rows.unshift(value); return 'CREATED'; }
  rows[index] = { ...rows[index], ...value, createdAt: rows[index].createdAt, version: Number(rows[index].version ?? 1) + 1 };
  return 'UPDATED';
}

export const nextCheck = (at, minutes = 5) => new Date(Date.parse(at) + minutes * 60_000).toISOString();
export const deadline = (at, minutes = 30) => new Date(Date.parse(at) + minutes * 60_000).toISOString();
export const retryAt = (at, attempt, baseMs, maxMs) => new Date(Date.parse(at) + Math.min(maxMs, baseMs * 2 ** Math.min(10, Math.max(0, attempt - 1)))).toISOString();
export const errorReason = (error) => String(error?.message ?? error ?? 'crisis_autopilot_coordination_failed').slice(0, 512);

export async function persistAutopilotTrigger({ repository, trigger, canonicalEvent, proposedActions, at }) {
  const receiptId = semanticHash('crisis-autopilot-receipt', trigger), actions = normalizedActions(trigger, proposedActions);
  let result;
  await repository.mutate((state) => {
    const receipts = [...(state.crisisAutopilotReceipts ?? [])], existing = receipts.find((item) => item.receiptId === receiptId);
    if (existing) { result = { ...existing, idempotentReplay: true }; return state; }
    assertCoordinatorCapacity(receipts, 'crisisAutopilotReceipts');
    const informationRequirements = [...(state.crisisAutopilotInformationRequirements ?? [])];
    const collectionTasks = [...(state.crisisAutopilotCollectionTasks ?? [])];
    const recomputeActions = [...(state.crisisAutopilotRecomputeActions ?? [])];
    const authorityProposals = [...(state.crisisAutopilotAuthorityProposals ?? [])];
    const dispositions = [];
    for (const action of actions) {
      const classification = actionClass(action.actionType);
      if (classification === 'INFORMATION_REQUIREMENT') {
        const unknownId = String(action.unknownId ?? action.causeId ?? trigger.eventId);
        const id = semanticHash('crisis-autopilot-information-requirement', { incidentId: trigger.incidentId, unknownId });
        const disposition = upsert(informationRequirements, id, {
          schemaVersion: 'vigia.autopilot-information-requirement.v1', id, kind: 'INFORMATION_REQUIREMENT', version: 1,
          incidentId: trigger.incidentId, unknownId, question: action.question ?? null, state: 'OPEN', priority: action.priority ?? null,
          owner: action.owner ?? 'VIGIA_SOURCE_RESOLUTION_SCHEDULER', source: action.source ?? sourceReference(canonicalEvent),
          lastCheckedAt: at, nextCheckAt: action.nextCheckAt ?? nextCheck(at), unlockCondition: action.unlockCondition ?? null,
          completionCriteria: action.completionCriteria ?? null, triggerReceiptId: receiptId, createdAt: at, updatedAt: at,
          truthBoundary: 'This is an information requirement, not evidence and not a satisfied requirement.',
        });
        dispositions.push({ actionType: action.actionType, recordId: id, disposition, consequential: false });
      } else if (classification === 'COLLECTION_TASK') {
        const candidateId = String(action.candidateId ?? '').trim();
        if (!candidateId || candidateId.length > 512) throw Object.assign(new Error('crisis_autopilot_collection_candidate_id_required'), { statusCode: 400 });
        const id = semanticHash('crisis-autopilot-collection-task', { incidentId: trigger.incidentId, candidateId });
        const disposition = upsert(collectionTasks, id, {
          schemaVersion: 'vigia.autopilot-collection-task.v1', id, taskId: id, kind: 'COLLECTION_TASK', version: 1,
          incidentId: trigger.incidentId, candidateId, requirementId: action.requirementId ?? null, question: action.question ?? null,
          state: 'REQUESTED', owner: action.owner ?? 'VIGIA_SOURCE_RESOLUTION_SCHEDULER', source: action.source ?? sourceReference(canonicalEvent),
          lastCheckedAt: at, nextCheckAt: action.nextCheckAt ?? nextCheck(at), deadlineAt: action.deadlineAt ?? deadline(at),
          unlockCondition: action.unlockCondition ?? null, completionCriteria: action.completionCriteria ?? null,
          escalation: { state: 'NOT_DUE', owner: 'VIGIA_HUMAN_ATTENTION_QUEUE', at: action.deadlineAt ?? deadline(at) },
          triggerReceiptId: receiptId, createdAt: at, updatedAt: at,
          truthBoundary: 'REQUESTED means a durable collection lifecycle exists. It does not claim provider acceptance, acquisition, evidence, or requirement satisfaction.',
        });
        dispositions.push({ actionType: action.actionType, recordId: id, disposition, consequential: false });
      } else if (classification === 'RECOMPUTE') {
        const id = semanticHash('crisis-autopilot-recompute-action', { receiptId, actionType: action.actionType });
        assertCoordinatorCapacity(recomputeActions, 'crisisAutopilotRecomputeActions');
        recomputeActions.unshift({
          schemaVersion: 'vigia.autopilot-recompute-action.v1', id, kind: 'RECOMPUTE', incidentId: trigger.incidentId,
          actionType: action.actionType, state: 'REFRESH_REQUESTED', owner: 'VIGIA_CANONICAL_PROJECTION_SERVICE', source: sourceReference(canonicalEvent),
          lastCheckedAt: at, nextCheckAt: at, unlockCondition: 'A fresh canonical governed-twin projection is persisted in the in-process projection cache.',
          completionCriteria: 'Projection refresher returns a canonical source projection hash.', triggerReceiptId: receiptId,
          createdAt: at, updatedAt: at, truthBoundary: 'This record requests deterministic recomputation only; it cannot change evidence, authority, dispatch, or outcome truth.',
        });
        dispositions.push({ actionType: action.actionType, recordId: id, disposition: 'CREATED', consequential: false });
      } else {
        const id = semanticHash('crisis-autopilot-authority-proposal', { receiptId, actionType: action.actionType, causeId: action.causeId ?? null });
        assertCoordinatorCapacity(authorityProposals, 'crisisAutopilotAuthorityProposals');
        authorityProposals.unshift({
          schemaVersion: 'vigia.autopilot-authority-proposal.v1', id, kind: 'AUTHORITY_GATED_PROPOSAL', incidentId: trigger.incidentId,
          actionType: action.actionType, state: classification === 'UNSUPPORTED_PROPOSAL' ? 'WITHHELD_UNSUPPORTED' : 'HUMAN_AUTHORITY_REQUIRED',
          owner: action.owner ?? 'INCIDENT_COMMAND_AUTHORITY', source: sourceReference(canonicalEvent), lastCheckedAt: at, nextCheckAt: null,
          unlockCondition: action.authorityRequirement ?? 'An explicitly authorized governed workflow must review and execute this proposal.',
          completionCriteria: 'A separate authority-bound action receipt exists.', triggerReceiptId: receiptId, createdAt: at, updatedAt: at,
          mutationsExecuted: false, truthBoundary: 'This is proposal-only. No objective, assignment, dispatch, warning, protection action, or authority is created here.',
        });
        dispositions.push({ actionType: action.actionType, recordId: id, disposition: 'PROPOSAL_RECORDED', consequential: true });
      }
    }
    const safeMutationCount = dispositions.filter((item) => !item.consequential).length;
    const receipt = {
      schemaVersion: 'vigia.crisis-autopilot-coordinator-receipt.v1', receiptId, ...trigger, consumedAt: at,
      state: safeMutationCount ? 'PERSISTED_REFRESH_PENDING' : 'PERSISTED_PROPOSAL_ONLY', idempotentReplay: false,
      actions: dispositions, safeMutationCount, authorityGatedCount: dispositions.filter((item) => item.consequential).length,
      canonicalProjection: { state: safeMutationCount ? 'REFRESH_PENDING' : 'NOT_REQUIRED', projectionHash: null, refreshedAt: null, reason: null, attemptCount: 0, lastAttemptAt: null, nextRetryAt: safeMutationCount ? at : null },
      notification: { state: safeMutationCount ? 'PENDING' : 'NOT_REQUIRED', attemptCount: 0, lastAttemptAt: null, nextRetryAt: null, reason: null },
      truthBoundary: 'The receipt proves durable idempotent coordination. It does not prove provider collection, evidence satisfaction, consequential execution, dispatch, warning delivery, or outcome.',
    };
    receipts.unshift(receipt); result = receipt;
    return { ...state, crisisAutopilotReceipts: receipts, crisisAutopilotInformationRequirements: informationRequirements, crisisAutopilotCollectionTasks: collectionTasks, crisisAutopilotRecomputeActions: recomputeActions, crisisAutopilotAuthorityProposals: authorityProposals };
  });
  return result;
}
