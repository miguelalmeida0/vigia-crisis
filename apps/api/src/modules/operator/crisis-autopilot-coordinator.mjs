import { canonicalIncidentId } from '../../../../../packages/domain/src/authorization.mjs';
import { CRISIS_AUTOPILOT_TRIGGER_TYPES } from '../../../../../packages/domain/src/crisis-autopilot/index.mjs';
import { persistAutopilotTrigger } from './crisis-autopilot-persistence.mjs';
import {
  canonicalAutopilotTriggersForOperationalEvent,
  crisisAutopilotTriggerTypeForOperationalEvent,
  requiredCoordinatorText,
  verifiedTriggerFromResolved,
} from './crisis-autopilot-trigger-mapping.mjs';
import {
  clearAutopilotCoordinationFailure,
  recordAutopilotCoordinationFailure,
  retryAutopilotNotification,
  retryAutopilotPending,
  retryAutopilotReceipt,
} from './crisis-autopilot-retry.mjs';

const DEFAULT_RETRY_BASE_MS = 5_000;
const DEFAULT_RETRY_MAX_MS = 5 * 60_000;

export { canonicalAutopilotTriggersForOperationalEvent, crisisAutopilotTriggerTypeForOperationalEvent };

export class CrisisAutopilotCoordinator {
  constructor({ repository, canonicalEventResolver, clock = () => new Date(), onChanged = async () => {}, projectionRefresher = null, projectionInvalidator = null, retryBaseMs = DEFAULT_RETRY_BASE_MS, retryMaxMs = DEFAULT_RETRY_MAX_MS } = {}) {
    if (!repository?.mutate || !repository?.snapshot) throw new Error('crisis_autopilot_repository_required');
    if (typeof canonicalEventResolver !== 'function') throw new Error('crisis_autopilot_canonical_event_resolver_required');
    Object.assign(this, {
      repository, canonicalEventResolver, clock, onChanged, projectionRefresher, projectionInvalidator,
      retryBaseMs: Math.max(100, Number(retryBaseMs) || DEFAULT_RETRY_BASE_MS),
      retryMaxMs: Math.max(100, Number(retryMaxMs) || DEFAULT_RETRY_MAX_MS),
    });
  }

  setProjectionRefresher(refresher) {
    if (refresher !== null && typeof refresher !== 'function') throw new TypeError('crisis_autopilot_projection_refresher_invalid');
    this.projectionRefresher = refresher;
    return this;
  }

  setProjectionInvalidator(invalidator) {
    if (invalidator !== null && typeof invalidator !== 'function') throw new TypeError('crisis_autopilot_projection_invalidator_invalid');
    this.projectionInvalidator = invalidator;
    return this;
  }

  snapshot(incidentId = null) {
    const state = this.repository.snapshotFields?.(['crisisAutopilotReceipts','crisisAutopilotInformationRequirements','crisisAutopilotCollectionTasks','crisisAutopilotRecomputeActions','crisisAutopilotAuthorityProposals','crisisAutopilotCoordinationFailures']) ?? this.repository.snapshot(), requested = incidentId ? canonicalIncidentId(incidentId) : null;
    const scoped = (key) => (state[key] ?? []).filter((item) => !requested || canonicalIncidentId(item.incidentId) === requested);
    const receipts = scoped('crisisAutopilotReceipts'), informationRequirements = scoped('crisisAutopilotInformationRequirements');
    const collectionTasks = scoped('crisisAutopilotCollectionTasks'), recomputeActions = scoped('crisisAutopilotRecomputeActions');
    const authorityProposals = scoped('crisisAutopilotAuthorityProposals'), coordinationFailures = scoped('crisisAutopilotCoordinationFailures');
    return {
      schemaVersion: 'vigia.crisis-autopilot-coordinator-snapshot.v1', incidentId: requested,
      receipts, informationRequirements, collectionTasks, recomputeActions, authorityProposals, coordinationFailures,
      counts: { receipts: receipts.length, informationRequirements: informationRequirements.length, collectionTasks: collectionTasks.length, recomputeActions: recomputeActions.length, authorityProposals: authorityProposals.length, coordinationFailures: coordinationFailures.length },
      truthBoundary: 'Receipts prove only durable lifecycle mutations and projection refreshes. Authority-gated proposals are not approvals, assignments, dispatches, warnings, truth changes, or outcomes.',
    };
  }

  async consume(input, { proposedActions = [] } = {}) {
    const trigger = {
      incidentId: canonicalIncidentId(requiredCoordinatorText(input?.incidentId, 'crisis_autopilot_incident_id_required')),
      eventId: requiredCoordinatorText(input?.eventId, 'crisis_autopilot_event_id_required'),
      revision: requiredCoordinatorText(String(input?.revision ?? ''), 'crisis_autopilot_event_revision_required'),
      triggerType: requiredCoordinatorText(input?.triggerType, 'crisis_autopilot_trigger_type_required').toUpperCase(),
      observedAt: input?.observedAt ?? null, sourceReference: input?.sourceReference ?? null,
    };
    if (!trigger.incidentId) throw Object.assign(new Error('crisis_autopilot_incident_id_required'), { statusCode: 400 });
    if (!CRISIS_AUTOPILOT_TRIGGER_TYPES.includes(trigger.triggerType)) throw Object.assign(new Error('crisis_autopilot_trigger_type_invalid'), { statusCode: 400 });
    const canonicalEvent = verifiedTriggerFromResolved(trigger, await this.canonicalEventResolver(trigger));
    const result = await persistAutopilotTrigger({ repository: this.repository, trigger, canonicalEvent, proposedActions, at: this.clock().toISOString() });
    if (!result.safeMutationCount) return result;
    const replay = result.idempotentReplay, refreshed = await this.retryReceipt(result.receiptId);
    return replay ? { ...refreshed, idempotentReplay: true } : refreshed;
  }

  retryReceipt(receiptId, options = {}) { return retryAutopilotReceipt(this, receiptId, options); }
  retryNotification(receiptId, options = {}) { return retryAutopilotNotification(this, receiptId, options); }
  recordCoordinationFailure(trigger, error, proposedActions = []) { return recordAutopilotCoordinationFailure(this, trigger, error, proposedActions); }
  clearCoordinationFailure(trigger) { return clearAutopilotCoordinationFailure(this, trigger); }
  retryPending(options = {}) { return retryAutopilotPending(this, options); }

  async consumeOperationalEvent(event, options = {}) {
    const receipts = [];
    for (const trigger of canonicalAutopilotTriggersForOperationalEvent(event)) {
      try {
        const receipt = await this.consume(trigger, options);
        await this.clearCoordinationFailure(trigger); receipts.push(receipt);
      } catch (error) { receipts.push(await this.recordCoordinationFailure(trigger, error, options.proposedActions)); }
    }
    return receipts;
  }

  async reconcile(events = [], { forceRetry = false } = {}) {
    const retry = await this.retryPending({ force: forceRetry }), results = [];
    for (const event of events) results.push(...await this.consumeOperationalEvent(event));
    const receipts = results.filter((item) => item?.receiptId), failures = results.filter((item) => item?.failureId);
    return { schemaVersion: 'vigia.crisis-autopilot-reconciliation.v1', considered: events.length, receipts: receipts.length, created: receipts.filter((item) => !item.idempotentReplay).length, duplicates: receipts.filter((item) => item.idempotentReplay).length, failuresScheduled: failures.length, retry };
  }
}
