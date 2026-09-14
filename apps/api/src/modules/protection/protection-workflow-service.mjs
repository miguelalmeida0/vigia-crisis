import { assertCan, assertIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';
import { DisabledAlertTransport } from './cap-alert-transport.mjs';
import { dispatchExerciseCap } from './protection-exercise-dispatch.mjs';
import { dispatchLiveCap } from './protection-live-dispatch.mjs';
import { transitionProtectionWorkflow } from './protection-workflow-transition.mjs';
import {
  authorizeProtectionActor,
  buildProtectionCapDraft,
  createProtectionWorkflow,
  protectionFail,
  protectionIncidentMatches,
  protectionList,
  protectionReceipt
} from './protection-workflow-contract.mjs';

/**
 * Governed protection workflow facade. Lifecycle, CAP projection, and the two
 * dispatch universes live in isolated modules so production and exercise truth
 * remain independently reviewable.
 */
export class ProtectionWorkflowService {
  constructor({ repository, externalDispatch = null, alertTransport = null, clock = () => new Date() } = {}) {
    if (!repository) throw new Error('protection_repository_required');
    this.repository = repository;
    this.alertTransport = alertTransport ?? new DisabledAlertTransport();
    this.externalDispatch = externalDispatch ?? (this.alertTransport.enabled ? this.alertTransport : null);
    this.clock = clock;
  }

  #authorize(actor, incidentId) {
    return authorizeProtectionActor(actor, incidentId);
  }

  list(incidentId, actor) {
    assertCan(actor, 'read:incident_command');
    assertIncidentScope(actor, incidentId);
    const workflows = protectionList(this.repository.snapshot().protectionWorkflows).filter((item) => protectionIncidentMatches(item, incidentId));
    return {
      schemaVersion: 'vigia.protection-workflow-list.v1',
      incidentId,
      workflows,
      truthBoundary: 'Live, exercise, and replay protection universes are structurally labelled and never combined into production dispatch claims.'
    };
  }

  async create(actor, incidentId, input = {}) {
    const actorId = this.#authorize(actor, incidentId);
    const workflow = createProtectionWorkflow({ actorId, incidentId, input, externalDispatch: this.externalDispatch, clock: this.clock });
    const receipt = protectionReceipt(this.clock, workflow, 'WORKFLOW_CREATED');
    await this.repository.mutate((state) => {
      if (protectionList(state.protectionWorkflows).some((item) => item.workflowId === workflow.workflowId)) protectionFail('protection_workflow_identity_conflict', 409);
      return { ...state, protectionWorkflows: [...protectionList(state.protectionWorkflows), workflow], audit: [...protectionList(state.audit), receipt] };
    });
    return { workflow, receipt };
  }

  async transition(actor, incidentId, workflowId, input = {}) {
    const actorId = this.#authorize(actor, incidentId);
    return transitionProtectionWorkflow({ repository: this.repository, clock: this.clock, actor, actorId, incidentId, workflowId, input });
  }

  capDraft(actor, incidentId, workflowId, input = {}) {
    this.#authorize(actor, incidentId);
    const workflow = protectionList(this.repository.snapshot().protectionWorkflows).find((item) => item.workflowId === workflowId && protectionIncidentMatches(item, incidentId));
    if (!workflow) protectionFail('protection_workflow_not_found', 404);
    if (!['APPROVED', 'DISPATCH_ELIGIBLE', 'EXTERNAL_SEND_DISABLED', 'DISPATCHED', 'EXERCISE_SENT', 'ACKNOWLEDGED', 'UPDATED', 'SUPERSEDED', 'CANCELLED'].includes(workflow.state)) protectionFail('cap_draft_requires_approved_workflow', 409);
    const { cap, validation, transport } = buildProtectionCapDraft({ workflow, input, alertTransport: this.alertTransport, clock: this.clock });
    return {
      schemaVersion: 'vigia.cap-draft.v2', workflowId, incidentId, universe: workflow.universe,
      productionTruth: workflow.productionTruth, cap, validation,
      authority: { required: true, state: workflow.authority.state, approvalState: workflow.approval.state, approvalReceiptId: workflow.approval.receiptId },
      transport,
      truthBoundary: workflow.universe === 'EXERCISE'
        ? 'This CAP Exercise message can be recorded only in the isolated VIGIA exercise ledger. It cannot invoke an external or public-alert transport.'
        : 'A valid CAP draft is not an issued public alert. External dispatch remains fail-closed until a named authority and transport are configured.'
    };
  }

  async dispatchCap(actor, incidentId, workflowId, input = {}) {
    const actorId = this.#authorize(actor, incidentId);
    const before = this.repository.snapshot();
    const workflow = protectionList(before.protectionWorkflows).find((item) => item.workflowId === workflowId && protectionIncidentMatches(item, incidentId));
    if (!workflow) protectionFail('protection_workflow_not_found', 404);
    if (workflow.universe === 'EXERCISE') {
      return dispatchExerciseCap({
        repository: this.repository, clock: this.clock, actor, actorId, incidentId, workflowId, workflow, input,
        capDraft: (draftInput) => this.capDraft(actor, incidentId, workflowId, draftInput)
      });
    }
    if (input.exerciseAction != null || input.exerciseTarget != null) protectionFail('exercise_delivery_requires_exercise_universe', 409);
    if (workflow.universe !== 'LIVE_PRODUCTION') protectionFail('non_production_protection_dispatch_forbidden', 409);
    const draft = this.capDraft(actor, incidentId, workflowId, input);
    return dispatchLiveCap({ repository: this.repository, clock: this.clock, alertTransport: this.alertTransport, actorId, incidentId, workflowId, workflow, input, draft, before });
  }
}
