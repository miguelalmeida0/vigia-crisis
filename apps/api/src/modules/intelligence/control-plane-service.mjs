import {
  createActionBudget, createActionReceipt, createControlPlaneEvent, createReconciliationCycle, evaluateActionAuthority,
  evaluateActionBudget, evaluateActionCooldown, evaluateActionPostcondition, evaluateCircuitBreaker, evaluateKillSwitch,
  planControlCycle, transitionControlAction
} from '../../../../../packages/domain/src/control-plane/index.mjs';
import { InternalControlExecutor } from './internal-control-executor.mjs';

const MODES = new Set(['LIVE', 'DRY_RUN', 'SHADOW']);
function instant(value) { return new Date(value).toISOString(); }
function policyFor(policies, reference) { return policies.find((item) => item.fingerprint === reference.fingerprint); }
function paired(twin, action) {
  const decisions = twin.controlPlane.decisions.filter((item) => item.policy.fingerprint === action.policy.fingerprint && item.subjectId === action.subjectId)
    .sort((left, right) => right.evaluatedAt.localeCompare(left.evaluatedAt));
  return {
    decision: decisions[0],
    desired: twin.controlPlane.desiredStates.find((item) => item.id === action.desiredStateId)
  };
}

export class ControlPlaneService {
  #intelligence; #policies; #executor; #clock; #defaultBudget; #proofPlane;
  #metrics = { policyEvaluations: 0, policiesApplicable: 0, actionsProposed: 0, actionsExecuted: 0, actionsBlocked: 0,
    authorityRequired: 0, budgetExhausted: 0, circuitOpen: 0, retries: 0, postconditionFailures: 0,
    convergenceCycles: 0, supersededActions: 0, evidenceNeedsAutoOpened: 0, evidenceNeedsAutoClosed: 0, duplicateActionsPrevented: 0 };
  constructor({ intelligenceService, policies, executor = new InternalControlExecutor(), clock = () => new Date(), budget = createActionBudget(), proofPlane = null } = {}) {
    if (!intelligenceService || !policies?.length) throw new Error('control_plane_dependencies_required');
    this.#intelligence = intelligenceService; this.#policies = policies; this.#executor = executor; this.#clock = clock; this.#defaultBudget = budget; this.#proofPlane = proofPlane;
  }

  status() { return { schemaVersion: 'vigia.control-plane-status.v1', executor: this.#executor.id, policyFingerprints: this.#policies.map((item) => item.fingerprint).sort(), metrics: structuredClone(this.#metrics) }; }

  async reconcile(options = {}) {
    const at = instant(options.asOf ?? this.#clock()), mode = String(options.mode ?? 'LIVE').toUpperCase();
    if (!MODES.has(mode)) throw new Error('invalid_control_plane_mode');
    if (options.enabled === false) return { schemaVersion: 'vigia.control-plane-run.v1', mode, at, state: 'DISABLED', converged: false, cycles: [] };
    const authoritySummary = this.#proofPlane?.summarizeControlContext(options.trustContext) ?? null;
    if (this.#proofPlane && mode !== 'DRY_RUN' && !authoritySummary) return { schemaVersion: 'vigia.control-plane-run.v1', mode, at, state: 'AUTHORITY_REQUIRED', converged: false, cycles: [] };
    const context = { at, mode, authority: this.#proofPlane ? authoritySummary : options.authority, trustContext: options.trustContext, budget: options.budget ?? this.#defaultBudget,
      killSwitch: options.killSwitch ?? { engaged: false }, circuitBreaker: options.circuitBreaker ?? {}, cooldown: options.cooldown ?? {},
      consequentialIntentByIncident: options.consequentialIntentByIncident ?? {}, cycleActions: [] };
    const maximum = Number.isInteger(options.maximumCycles) ? Math.max(1, options.maximumCycles) : 4, cycles = [];
    if (mode === 'LIVE') await this.#recoverStarted(context);
    for (let number = 1; number <= maximum; number += 1) {
      context.cycleActions = [];
      const twin = await this.#intelligence.getTwinAsOf(at), plan = planControlCycle({ twin, policies: this.#policies, at, consequentialIntentByIncident: context.consequentialIntentByIncident });
      this.#observePlan(plan); if (mode === 'LIVE') await this.#supersedeObsolete(twin, plan, context);
      if (mode === 'DRY_RUN') return { schemaVersion: 'vigia.control-plane-run.v1', mode, at, state: 'DRY_RUN', converged: plan.actions.length === 0,
        cycles: [{ plan, actions: plan.actions.map((action) => transitionControlAction(action, 'DRY_RUN', { at, result: { wouldHaveExecuted: true } })) }] };
      await this.#persistPlan(plan, at, context.trustContext);
      const outcomes = [];
      for (const action of plan.actions) {
        if (mode === 'SHADOW') outcomes.push(await this.#shadow(action, plan, at, context));
        else outcomes.push(await this.#runAction(action, context));
      }
      const finalTwin = await this.#intelligence.getTwinAsOf(at), nextPlan = planControlCycle({ twin: finalTwin, policies: this.#policies, at, consequentialIntentByIncident: context.consequentialIntentByIncident });
      const converged = nextPlan.actions.length === 0, cycle = createReconciliationCycle({ plan, cycleNumber: number, mode,
        startedProjectionHash: twin.projectionHash, finalProjectionHash: finalTwin.projectionHash, actionOutcomes: outcomes, converged, at });
      await this.#persist('RECONCILIATION_CYCLE', cycle, plan.decisions[0]?.factBinding.incidentId ?? 'control-plane', at, number, context.trustContext);
      this.#metrics.convergenceCycles += 1;
      cycles.push({ cycle, plan, outcomes });
      if (mode === 'SHADOW' || converged) return { schemaVersion: 'vigia.control-plane-run.v1', mode, at, state: mode === 'SHADOW' ? 'SHADOW_RECORDED' : 'CONVERGED', converged, cycles };
    }
    return { schemaVersion: 'vigia.control-plane-run.v1', mode, at, state: 'MAXIMUM_CYCLES_REACHED', converged: false, cycles };
  }

  async #recoverStarted(context) {
    const twin = await this.#intelligence.getTwinAsOf(context.at), plan = planControlCycle({ twin, policies: this.#policies, at: context.at, consequentialIntentByIncident: context.consequentialIntentByIncident });
    const stillDesired = new Set(plan.actions.map((item) => item.id));
    for (const action of twin.controlPlane.actions.filter((item) => item.status === 'STARTED')) {
      const postcondition = evaluateActionPostcondition(twin, action.postcondition, action.incidentId);
      if (!stillDesired.has(action.id) && !postcondition.satisfied) {
        const obsolete = transitionControlAction(action, 'SUPERSEDED', { at: context.at, reasons: ['DESIRED_STATE_NO_LONGER_APPLICABLE'], result: { recoveredBeforeEffect: true } });
        await this.#finish(obsolete, paired(twin, action), context, { state: 'CANCELLED_BEFORE_EFFECT', satisfied: false, evidence: [] }); this.#metrics.supersededActions += 1;
      } else await this.#runAction(action, context, twin);
    }
  }

  async #supersedeObsolete(twin, plan, context) {
    const current = new Set(plan.actions.map((item) => item.id));
    for (const action of twin.controlPlane.actions.filter((item) => item.status === 'PLANNED' && !current.has(item.id))) {
      const obsolete = transitionControlAction(action, 'SUPERSEDED', { at: context.at, reasons: ['DESIRED_STATE_NO_LONGER_APPLICABLE'], result: { executed: false } });
      await this.#finish(obsolete, paired(twin, action), context, { state: 'CANCELLED_BEFORE_EFFECT', satisfied: false, evidence: [] }); this.#metrics.supersededActions += 1;
    }
  }

  #observePlan(plan) {
    this.#metrics.policyEvaluations += plan.decisions.length;
    this.#metrics.policiesApplicable += plan.decisions.filter((item) => ['APPLY', 'AUTHORITY_REQUIRED'].includes(item.outcome)).length;
    this.#metrics.actionsProposed += plan.actions.length;
    this.#metrics.duplicateActionsPrevented += plan.decisions.filter((item) => item.outcome === 'CONVERGED').length;
  }

  async #persistPlan(plan, at, trustContext) {
    for (const decision of plan.decisions) await this.#persist('POLICY_DECISION', decision, decision.factBinding.incidentId, at, null, trustContext);
    for (const desired of plan.desiredStates) {
      const decision = plan.decisions.find((item) => item.subjectType === desired.subjectType && item.subjectId === desired.subjectId && item.policy.fingerprint === desired.policy.fingerprint);
      await this.#persist('DESIRED_STATE', desired, decision?.factBinding.incidentId ?? 'control-plane', at, null, trustContext);
    }
  }

  async #shadow(action, plan, at, context) {
    const shadow = transitionControlAction(action, 'SHADOW', { at, result: { wouldHaveExecuted: true } });
    await this.#persist('ACTION', shadow, action.incidentId, at, 'SHADOW', context.trustContext);
    const decision = plan.decisions.find((item) => item.policy.fingerprint === action.policy.fingerprint && item.subjectId === action.subjectId);
    const desired = plan.desiredStates.find((item) => item.id === action.desiredStateId);
    const receipt = createActionReceipt({ action: shadow, decision, desiredState: desired, outcome: 'WOULD_HAVE_EXECUTED', postcondition: { state: 'NOT_EVALUATED_SHADOW' }, at, executor: this.#executor.id, authority: null });
    await this.#persist('RECEIPT', receipt, action.incidentId, at, null, context.trustContext); return { actionId: action.id, status: shadow.status, receiptId: receipt.id };
  }

  #safety(action, twin, context) {
    const authority = this.#proofPlane ? this.#proofPlane.authorizeControlAction(action, context.trustContext, context.at, 'SAFETY') : evaluateActionAuthority(action, context.authority, context.at);
    const checks = [
      evaluateKillSwitch(context.killSwitch, action, context.at), authority,
      evaluateActionBudget(action, context.budget, { cycleActions: context.cycleActions, historicalActions: twin.controlPlane.actionHistory }),
      evaluateCircuitBreaker(action, twin.controlPlane.actionHistory, context.at, context.circuitBreaker),
      evaluateActionCooldown(action, twin.controlPlane.actionHistory, context.at, context.cooldown)
    ];
    const blocked = checks.find((item) => !item.allowed);
    const status = blocked?.state === 'AUTHORIZED_BUT_EXECUTION_DISABLED' ? 'AUTHORIZED_BUT_EXECUTION_DISABLED'
      : ['AUTHORITY_REQUIRED', 'STEP_UP_REQUIRED'].includes(blocked?.state) ? 'AUTHORITY_REQUIRED' : blocked?.state === 'BUDGET_EXCEEDED' ? 'BUDGET_EXCEEDED'
      : blocked?.state === 'OPEN' ? 'CIRCUIT_OPEN' : blocked ? 'BLOCKED' : null;
    return { allowed: !blocked, status, reasons: blocked?.reasons ?? [], checks };
  }

  async #runAction(input, context, suppliedTwin = null) {
    let twin = suppliedTwin ?? await this.#intelligence.getTwinAsOf(context.at), action = twin.controlPlane.actions.find((item) => item.id === input.id) ?? input;
    const pair = paired(twin, action), policy = policyFor(this.#policies, action.policy);
    if (!pair.decision || !pair.desired || !policy) throw new Error(`control_action_binding_missing:${action.id}:decision=${Boolean(pair.decision)}:desired=${Boolean(pair.desired)}:policy=${Boolean(policy)}`);
    if (action.status !== 'STARTED') {
      action = action.status === 'PLANNED' ? action : transitionControlAction(action, 'PLANNED', { at: context.at });
      await this.#persist('ACTION', action, action.incidentId, context.at, `PLANNED:${action.attempt}`, context.trustContext);
      const safety = this.#safety(action, twin, context);
      if (!safety.allowed) {
        this.#metrics.actionsBlocked += 1; if (safety.status === 'AUTHORITY_REQUIRED') this.#metrics.authorityRequired += 1;
        if (safety.status === 'BUDGET_EXCEEDED') this.#metrics.budgetExhausted += 1; if (safety.status === 'CIRCUIT_OPEN') this.#metrics.circuitOpen += 1;
        action = transitionControlAction(action, safety.status, { at: context.at, reasons: safety.reasons, result: { safetyChecks: safety.checks } });
        return this.#finish(action, pair, context, { state: 'NOT_EXECUTED', safetyChecks: safety.checks });
      }
      action = transitionControlAction(action, 'STARTED', { at: context.at, incrementAttempt: true });
      this.#metrics.actionsExecuted += 1; if (action.attempt > 1) this.#metrics.retries += 1;
      await this.#persist('ACTION', action, action.incidentId, context.at, `STARTED:${action.attempt}`, context.trustContext); context.cycleActions.push(action);
    }
    if (this.#proofPlane) {
      const recheck = this.#proofPlane.authorizeControlAction(action, context.trustContext, this.#clock(), 'EXECUTION_RECHECK');
      if (!recheck.allowed) {
        const status = recheck.state === 'AUTHORIZED_BUT_EXECUTION_DISABLED' ? 'AUTHORIZED_BUT_EXECUTION_DISABLED' : recheck.state === 'STEP_UP_REQUIRED' ? 'AUTHORITY_REQUIRED' : 'BLOCKED';
        action = transitionControlAction(action, status, { at: this.#clock(), reasons: ['TOCTOU_AUTHORITY_RECHECK_FAILED', ...recheck.reasons], result: { authorityRecheck: recheck } });
        this.#metrics.actionsBlocked += 1; return this.#finish(action, pair, context, { state: 'NOT_EXECUTED', authorityRecheck: recheck });
      }
    }
    let postcondition = evaluateActionPostcondition(twin, action.postcondition, action.incidentId), execution = { records: [], result: { recoveredFromPostcondition: true } };
    try {
      if (!postcondition.satisfied) execution = await this.#executor.execute({ action, policy, twin, at: context.at });
      for (const [index, item] of execution.records.entries()) await this.#persist(item.controlType, item.record, action.incidentId, context.at, `${item.record.status ?? 'RECORDED'}:${index}`, context.trustContext);
      twin = await this.#intelligence.getTwinAsOf(context.at); postcondition = evaluateActionPostcondition(twin, action.postcondition, action.incidentId);
      const status = postcondition.satisfied ? 'SUCCEEDED' : 'FAILED';
      if (!postcondition.satisfied) this.#metrics.postconditionFailures += 1;
      action = transitionControlAction(action, status, { at: context.at, result: execution.result, reasons: postcondition.satisfied ? action.reasons : ['POSTCONDITION_UNSATISFIED'] });
    } catch (error) {
      action = transitionControlAction(action, 'FAILED', { at: context.at, result: { code: error?.code ?? 'EXECUTION_FAILED', message: String(error?.message ?? error) }, reasons: ['EXECUTION_FAILED'] });
    }
    return this.#finish(action, pair, context, postcondition);
  }

  async #finish(action, pair, context, postcondition) {
    await this.#persist('ACTION', action, action.incidentId, context.at, `${action.status}:${action.attempt}`, context.trustContext);
    const receipt = createActionReceipt({ action, decision: pair.decision, desiredState: pair.desired, outcome: action.status, postcondition, at: context.at, executor: this.#executor.id, authority: context.authority });
    await this.#persist('RECEIPT', receipt, action.incidentId, context.at, null, context.trustContext);
    if (action.status === 'SUCCEEDED' && action.type === 'CREATE_ACQUISITION_REQUEST') this.#metrics.evidenceNeedsAutoOpened += 1;
    if (action.status === 'SUCCEEDED' && action.type === 'CLOSE_RESOLVED_WORK') this.#metrics.evidenceNeedsAutoClosed += action.parameters.requestIds.length;
    return { actionId: action.id, status: action.status, receiptId: receipt.id, postcondition };
  }

  async #persist(controlType, record, incidentId, at, sequence = null, trustContext = null) {
    let event = createControlPlaneEvent({ controlType, record, incidentId, at, sequence });
    if (this.#proofPlane) event = this.#proofPlane.bindInternalControlEvent(event, trustContext, at);
    const result = await this.#intelligence.ingestOperationalEvent(event, { receivedAt: at, ingestedAt: at, project: false });
    if (result.state === 'REJECTED') throw Object.assign(new Error(`control_event_rejected:${controlType}`), { code: 'CONTROL_EVENT_REJECTED', details: result.rejection });
    return result;
  }
}
