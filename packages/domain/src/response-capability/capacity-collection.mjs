import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { isoOrNull, textOrNull } from './capacity-contract.mjs';

function sourceStrategy(id, label, collectorType, availability, reason) {
  const availabilityState = typeof availability === 'object' && availability !== null
    ? String(availability.state ?? 'NOT_CONNECTED')
    : String(availability ?? 'NOT_CONNECTED');
  const checkedAt = typeof availability === 'object' && availability !== null ? isoOrNull(availability.checkedAt) : null;
  const availabilityReason = typeof availability === 'object' && availability !== null ? textOrNull(availability.reason) : null;
  return {
    id,
    label,
    collectorType,
    availability: availabilityState,
    executionState: availabilityState === 'CONNECTED' ? 'READY' : availabilityState === 'DEGRADED' ? 'RETRY_WAIT' : 'NOT_CONFIGURED',
    checkedAt,
    reason: availabilityState === 'CONNECTED' ? null : availabilityReason ?? reason
  };
}

function taskExecutionKey(requirementId, strategyId) {
  return `${requirementId}:${strategyId}`;
}

function projectedCollectionTask({ planId, requirementId, strategy, generatedAt, nextCheckAt, execution }) {
  const fallback = strategy.executionState === 'READY' ? {
    state: 'SCHEDULED',
    attemptCount: 0,
    lastAttempt: null,
    nextAttempt: nextCheckAt,
    backoff: { state: 'NOT_REQUIRED', nextAttempt: nextCheckAt },
    deadline: null,
    escalation: { state: 'MONITORING', escalateTo: 'INCIDENT_COMMAND' },
    result: { state: 'NOT_ATTEMPTED', reason: 'The connected collection strategy is scheduled for execution.' },
    receipt: null,
    delivery: { state: 'NOT_RECORDED', reason: 'No destination receipt has been recorded.' },
    acknowledgement: { state: 'NOT_RECORDED', reason: 'No FieldNet acknowledgement has been recorded.' },
    localCompletion: { state: 'NOT_COMPLETED', completedAt: null, evidence: [] },
    centralReconciliation: { state: 'NOT_RECORDED', reason: 'No central reconciliation record has been observed.' }
  } : strategy.executionState === 'RETRY_WAIT' ? {
    state: 'RETRY_WAIT',
    attemptCount: 1,
    lastAttempt: strategy.checkedAt ?? generatedAt,
    nextAttempt: nextCheckAt,
    backoff: { state: 'WAITING_FOR_RETRY_WINDOW', nextAttempt: nextCheckAt },
    deadline: null,
    escalation: { state: 'MONITORING', escalateTo: 'INCIDENT_COMMAND' },
    result: { state: 'CONNECTOR_UNAVAILABLE', reason: strategy.reason },
    receipt: null,
    delivery: { state: 'NOT_RECORDED', reason: 'The configured FieldNet destination could not be reached.' },
    acknowledgement: { state: 'NOT_RECORDED', reason: 'No FieldNet acknowledgement has been recorded.' },
    localCompletion: { state: 'NOT_COMPLETED', completedAt: null, evidence: [] },
    centralReconciliation: { state: 'NOT_RECORDED', reason: 'No local task exists to reconcile centrally.' }
  } : {
    state: 'TERMINAL_UNAVAILABLE',
    attemptCount: 1,
    lastAttempt: generatedAt,
    nextAttempt: null,
    backoff: { state: 'NOT_REQUIRED', nextAttempt: null },
    deadline: null,
    escalation: { state: 'CONNECTOR_REQUIRED', escalateTo: 'INCIDENT_COMMAND' },
    result: { state: 'CONNECTOR_NOT_CONFIGURED', reason: strategy.reason },
    receipt: null,
    delivery: { state: 'NOT_RECORDED', reason: 'No trusted destination is configured.' },
    acknowledgement: { state: 'NOT_RECORDED', reason: 'No FieldNet acknowledgement has been recorded.' },
    localCompletion: { state: 'NOT_COMPLETED', completedAt: null, evidence: [] },
    centralReconciliation: { state: 'NOT_RECORDED', reason: 'No local task exists to reconcile centrally.' }
  };
  const trustedExecution = execution && typeof execution === 'object' && !Array.isArray(execution) ? execution : null;
  return {
    schemaVersion: 'vigia.collection-task.v1',
    id: semanticHash('collection-task', { planId, strategyId: strategy.id }).slice(0, 48),
    requirementId,
    strategyId: strategy.id,
    collectorType: strategy.collectorType,
    provider: { id: strategy.id, label: strategy.label },
    ...fallback,
    ...(trustedExecution ? {
      state: textOrNull(trustedExecution.state) ?? fallback.state,
      attemptCount: Number.isSafeInteger(trustedExecution.attemptCount) && trustedExecution.attemptCount >= 0 ? trustedExecution.attemptCount : fallback.attemptCount,
      lastAttempt: isoOrNull(trustedExecution.lastAttempt) ?? fallback.lastAttempt,
      nextAttempt: trustedExecution.nextAttempt === null ? null : isoOrNull(trustedExecution.nextAttempt) ?? fallback.nextAttempt,
      backoff: trustedExecution.backoff && typeof trustedExecution.backoff === 'object' && !Array.isArray(trustedExecution.backoff) ? structuredClone(trustedExecution.backoff) : fallback.backoff,
      deadline: trustedExecution.deadline === null ? null : isoOrNull(trustedExecution.deadline) ?? fallback.deadline,
      escalation: trustedExecution.escalation && typeof trustedExecution.escalation === 'object' && !Array.isArray(trustedExecution.escalation) ? structuredClone(trustedExecution.escalation) : fallback.escalation,
      result: trustedExecution.result && typeof trustedExecution.result === 'object' && !Array.isArray(trustedExecution.result) ? structuredClone(trustedExecution.result) : fallback.result,
      receipt: trustedExecution.receipt && typeof trustedExecution.receipt === 'object' && !Array.isArray(trustedExecution.receipt) ? structuredClone(trustedExecution.receipt) : fallback.receipt,
      delivery: trustedExecution.delivery && typeof trustedExecution.delivery === 'object' && !Array.isArray(trustedExecution.delivery) ? structuredClone(trustedExecution.delivery) : fallback.delivery,
      acknowledgement: trustedExecution.acknowledgement && typeof trustedExecution.acknowledgement === 'object' && !Array.isArray(trustedExecution.acknowledgement) ? structuredClone(trustedExecution.acknowledgement) : fallback.acknowledgement,
      localCompletion: trustedExecution.localCompletion && typeof trustedExecution.localCompletion === 'object' && !Array.isArray(trustedExecution.localCompletion) ? structuredClone(trustedExecution.localCompletion) : fallback.localCompletion,
      centralReconciliation: trustedExecution.centralReconciliation && typeof trustedExecution.centralReconciliation === 'object' && !Array.isArray(trustedExecution.centralReconciliation) ? structuredClone(trustedExecution.centralReconciliation) : fallback.centralReconciliation
    } : {}),
    deadline: trustedExecution?.deadline === null ? null : isoOrNull(trustedExecution?.deadline) ?? fallback.deadline,
    truthBoundary: 'A connector preflight, persisted FieldNet task, acknowledgement, or provider response is not capacity truth. Only an admitted attributable report can satisfy the requirement.'
  };
}

export function capacityInformationRequirement({ incidentId, facility, generatedAt, decisionBlocked, sourceAvailability = {}, collectionTaskExecutions = {} }) {
  const kind = facility.kind;
  const capacityContract = {
    HOSPITAL: {
      subject: 'medical receiving capacity',
      question: `Can ${facility.name} receive additional incident-related patients during the current planning window?`,
      requiredEvidenceClasses: ['PARTNER_OPERATIONAL_CAPACITY', 'AUTHORITY_CAPACITY', 'FIELD_CAPACITY_REPORT'],
      strategies: [
        sourceStrategy('partner-hospital-feed', 'Partner hospital capacity feed', 'PARTNER_FEED', sourceAvailability.partnerHospitalFeed ?? 'NOT_CONNECTED', 'No partner hospital capacity feed is configured.'),
        sourceStrategy('regional-health-authority', 'Regional health authority feed', 'AUTHORITY_FEED', sourceAvailability.regionalHealthAuthority ?? 'NOT_CONNECTED', 'No regional health-authority capacity feed is configured.'),
        sourceStrategy('ems-dispatch-feed', 'EMS or dispatch capacity feed', 'DISPATCH_FEED', sourceAvailability.emsDispatchFeed ?? 'NOT_CONNECTED', 'No governed EMS or dispatch capacity feed is configured.'),
        sourceStrategy('fieldnet-hospital-capacity', 'Trusted FieldNet hospital capacity report', 'FIELDNET_TASK', sourceAvailability.fieldNetHospitalCapacity ?? 'NOT_CONNECTED', 'The FieldNet hospital-capacity tasking connector is not configured.'),
      ],
    },
    FIRE_STATION: {
      subject: 'fire-response resource availability',
      question: `What wildfire-response crews and vehicles are currently available at ${facility.name}?`,
      requiredEvidenceClasses: ['DISPATCH_CAPACITY', 'PARTNER_OPERATIONAL_CAPACITY', 'FIELD_CAPACITY_REPORT'],
      strategies: [
        sourceStrategy('fire-dispatch-feed', 'Fire dispatch capacity feed', 'DISPATCH_FEED', sourceAvailability.fireDispatchFeed ?? 'NOT_CONNECTED', 'No governed fire-dispatch capacity feed is configured.'),
        sourceStrategy('partner-fire-operator', 'Trusted fire-station operator update', 'PARTNER_FEED', sourceAvailability.partnerFireOperator ?? 'NOT_CONNECTED', 'No partner fire-station capacity feed is configured.'),
        sourceStrategy('fieldnet-fire-capacity', 'Trusted FieldNet fire-station capacity report', 'FIELDNET_TASK', sourceAvailability.fieldNetFireCapacity ?? 'NOT_CONNECTED', 'The FieldNet fire-station-capacity tasking connector is not configured.'),
      ],
    },
  }[kind] ?? {
    subject: `${String(kind ?? 'response facility').toLowerCase().replaceAll('_', ' ')} operational capacity`,
    question: `What incident-relevant capacity is currently available at ${facility.name}?`,
    requiredEvidenceClasses: ['AUTHORITY_CAPACITY', 'PARTNER_OPERATIONAL_CAPACITY', 'FIELD_CAPACITY_REPORT'],
    strategies: [
      sourceStrategy(`authority-${String(kind).toLowerCase()}-capacity`, `${String(kind).replaceAll('_', ' ')} authority capacity feed`, 'AUTHORITY_FEED', sourceAvailability.authorityCapacity ?? 'NOT_CONNECTED', `No governed ${String(kind).toLowerCase().replaceAll('_', ' ')} authority capacity feed is configured.`),
      sourceStrategy(`partner-${String(kind).toLowerCase()}-operator`, `Trusted ${String(kind).replaceAll('_', ' ')} operator update`, 'PARTNER_FEED', sourceAvailability.partnerResponseOperator ?? 'NOT_CONNECTED', `No trusted ${String(kind).toLowerCase().replaceAll('_', ' ')} partner feed is configured.`),
      sourceStrategy(`fieldnet-${String(kind).toLowerCase()}-capacity`, `Trusted FieldNet ${String(kind).replaceAll('_', ' ')} capacity report`, 'FIELDNET_TASK', sourceAvailability.fieldNetResponseCapacity ?? 'NOT_CONNECTED', `The FieldNet ${String(kind).toLowerCase().replaceAll('_', ' ')} capacity tasking connector is not configured.`),
    ],
  };
  const { subject } = capacityContract;
  const requirementId = semanticHash('information-requirement', { incidentId, facilityId: facility.id, subject }).slice(0, 57);
  const planId = semanticHash('collection-plan', { requirementId }).slice(0, 49);
  const nextCheckAt = new Date(Date.parse(generatedAt) + 15 * 60_000).toISOString();
  const deadline = new Date(Date.parse(generatedAt) + 30 * 60_000).toISOString();
  const strategies = capacityContract.strategies;
  const activeStrategies = strategies.filter((strategy) => strategy.executionState === 'READY');
  const retryingStrategies = strategies.filter((strategy) => strategy.executionState === 'RETRY_WAIT');
  const collectionTasks = strategies.map((strategy) => projectedCollectionTask({
    planId,
    requirementId,
    strategy,
    generatedAt,
    nextCheckAt,
    execution: collectionTaskExecutions[taskExecutionKey(requirementId, strategy.id)]
  }));
  return immutable({
    schemaVersion: 'vigia.information-requirement.v1',
    id: requirementId,
    incidentId: String(incidentId),
    subjectId: facility.id,
    question: capacityContract.question,
    reason: `Current ${subject} is decision-relevant but no current attributable report is admitted.`,
    decisionBlocked,
    priority: { class: 'OPERATIONAL', rank: null, score: null },
    createdAt: generatedAt,
    deadline,
    state: activeStrategies.length ? 'COLLECTION_PLANNED' : retryingStrategies.length ? 'COLLECTION_RETRY_WAIT' : 'BLOCKED_SOURCE_CONNECTOR',
    requiredEvidenceClasses: capacityContract.requiredEvidenceClasses,
    satisfactionRule: 'An attributable, incident-scoped, freshness-valid aggregate capacity report must pass admission. Provider response alone does not satisfy this requirement.',
    currentAssessment: {
      state: 'UNKNOWN',
      lastCheckedAt: generatedAt,
      nextCheckAt,
      connectedStrategies: activeStrategies.length,
      retryingStrategies: retryingStrategies.length,
      unavailableStrategies: strategies.filter((strategy) => strategy.executionState !== 'READY').length,
      connectorPreflightAttempts: collectionTasks.filter((task) => ['CONNECTOR_NOT_CONFIGURED', 'CONNECTOR_UNAVAILABLE'].includes(task.result.state)).length
    },
    ownerPolicy: { automationOwner: 'response-capability-resolver', humanOwnerRequired: activeStrategies.length === 0 && retryingStrategies.length === 0 },
    escalationPolicy: {
      state: activeStrategies.length ? 'MONITORING_DEADLINE' : retryingStrategies.length ? 'RETRYING_CONNECTOR' : 'CONNECTOR_REQUIRED',
      escalateAt: deadline,
      escalateTo: 'INCIDENT_COMMAND',
      reason: activeStrategies.length ? 'Escalate if no attributable capacity report arrives by the decision deadline.' : retryingStrategies.length ? 'Retry the configured trusted FieldNet destination and escalate if it remains unavailable at the deadline.' : 'A command owner must select or establish a trusted capacity source.'
    },
    collectionPlan: {
      schemaVersion: 'vigia.collection-plan.v1',
      id: planId,
      requirementId,
      strategies,
      preferredOrder: strategies.map((strategy) => strategy.id),
      executions: collectionTasks.map((task) => ({
        collectionTaskId: task.id,
        strategyId: task.strategyId,
        state: task.state,
        attemptCount: task.attemptCount,
        lastAttempt: task.lastAttempt,
        nextAttempt: task.nextAttempt,
        backoff: task.backoff,
        deadline: task.deadline ?? deadline,
        escalation: task.escalation,
        receiptId: task.receipt?.receiptId ?? null,
        localPersistenceState: task.delivery?.state ?? 'NOT_RECORDED',
        localCompletionState: task.localCompletion?.state ?? 'NOT_COMPLETED',
        centralReconciliationState: task.centralReconciliation?.state ?? 'NOT_RECORDED'
      })),
      nextCheckAt,
      deadline,
      terminalConditions: [
        'A freshness-valid attributable capacity report is admitted.',
        'Every legitimate source is exhausted and terminal unavailability is recorded.',
        'Incident Command explicitly closes the decision requirement.'
      ]
    },
    collectionTasks,
    whatVigiaIsDoing: activeStrategies.length
      ? 'Scheduling the connected capacity sources and monitoring the decision deadline.'
      : retryingStrategies.length
        ? 'Retrying the configured trusted FieldNet destination; no task persistence, delivery, or acknowledgement is claimed.'
        : 'Escalating the capacity-source connector gap to Incident Command; no provider request or FieldNet task is claimed.',
    unlockCondition: 'Admit a freshness-valid aggregate capacity report from a trusted partner, dispatch, authority, or FieldNet source.',
    truthBoundary: 'This requirement and plan prove governed collection intent only. They do not prove task dispatch, acknowledgement, capacity, or resource availability.'
  });
}
