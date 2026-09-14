import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { requiredPlanningClock, requiredPlanningIncidentId } from './contracts.mjs';
import { projectCommandIntent } from './project-command-intent.mjs';
import { projectCrisisDependencyGraph } from './project-dependencies.mjs';
import { projectDynamicExposureGraph } from './project-exposure.mjs';
import { projectModelDisagreement, projectRealityReconciliation } from './project-evidence.mjs';
import { projectEvacuationCorridor } from './project-evacuation.mjs';
import { projectOperationalPeriod } from './project-operational-period.mjs';
import { projectCapProtection, projectMultilingualComposer, projectProtectionTimeline } from './project-protection.mjs';
import { projectAutonomousReplanning } from './project-replanning.mjs';
import { projectResourceOptimizer } from './project-resource-optimizer.mjs';
import { planningReviewBindings, projectPlanningReview } from './project-review.mjs';
import { rows, text, withResolutionLifecycle } from './projection-helpers.mjs';

export function projectCrisisPlanning(input = {}) {
  const incident = input.incident ?? {};
  const incidentId = requiredPlanningIncidentId(incident);
  const asOf = requiredPlanningClock(input.asOf ?? input.generatedAt);
  const contexts = input.contexts ?? {};
  const planning = input.planning ?? {};
  const responseCapability = input.responseCapability ?? planning.responseCapability ?? null;
  const exposureGraph = projectDynamicExposureGraph({ incident, contexts, responseCapability, asOf });
  const dependencyGraph = projectCrisisDependencyGraph(exposureGraph, contexts, asOf);
  const modelDisagreement = projectModelDisagreement(input.modelClaims ?? planning.modelClaims, asOf);
  const realityReconciliation = projectRealityReconciliation(input.reconciliation ?? planning.reconciliation, asOf);
  const commandIntent = projectCommandIntent(input.commandIntent ?? planning.commandIntent, asOf);
  const operationalPeriodProposal = projectOperationalPeriod(input.operationalPeriodProposal ?? planning.operationalPeriodProposal, commandIntent, asOf);
  const suppliedTaskRequirements = input.taskRequirements ?? planning.taskRequirements;
  const resourceOptimizer = projectResourceOptimizer(responseCapability, rows(suppliedTaskRequirements).length ? suppliedTaskRequirements : commandIntent.value?.resourceRecommendations, asOf);
  const evacuationCorridor = projectEvacuationCorridor({
    incidentScenario: input.incidentScenario ?? planning.incidentScenario,
    evacuation: input.evacuation ?? planning.evacuation,
    responseCapability,
    contexts,
    asOf,
  });
  const protectionTimeline = projectProtectionTimeline(input.protectionScenario ?? planning.protectionScenario, asOf);
  const multilingualProtectionComposer = projectMultilingualComposer(input.protectionMessage ?? planning.protectionMessage, asOf);
  const capProtection = projectCapProtection(input.capProtection ?? planning.capProtection, multilingualProtectionComposer, asOf);
  const autonomousReplanning = projectAutonomousReplanning({
    replanning: input.replanning ?? planning.replanning,
    triggers: input.triggers ?? planning.triggers,
    resourceOptimizer,
    evacuationCorridor,
    responseCapability,
    asOf,
  });
  const sections = {
    dynamicExposureGraph: withResolutionLifecycle(exposureGraph, asOf, 'Supply attributable coordinates or explicit governed exposure relations.'),
    crisisDependencyGraph: withResolutionLifecycle(dependencyGraph, asOf, 'Supply explicit dependencies or governed context nodes that activate scenario modelling.'),
    modelDisagreement: withResolutionLifecycle(modelDisagreement, asOf, 'Supply two attributable time-bound claims about the same subject and quantity.'),
    realityReconciliation: withResolutionLifecycle(realityReconciliation, asOf, 'Supply an expected value and attributable observed value for the same estimate.'),
    commandIntent: withResolutionLifecycle(commandIntent, asOf, 'Provide a structured intent, target, owner, requester, and deadline.'),
    operationalPeriodProposal: withResolutionLifecycle(operationalPeriodProposal, asOf, 'Provide period bounds, an objective, and owners and deadlines for every actionable item.'),
    resourceOptimizer: withResolutionLifecycle(resourceOptimizer, asOf, 'Provide task requirements and eligible response-capability optimizer inputs with current attributable capacity.'),
    autonomousReplanning: withResolutionLifecycle(autonomousReplanning, asOf, 'Provide a qualifying trigger, current old plan, and a governed alternative.'),
    evacuationCorridor: withResolutionLifecycle(evacuationCorridor, asOf, 'Provide a valid admitted scenario and attributable current route candidates to governed shelters.'),
    protectionTimeline: withResolutionLifecycle(protectionTimeline, asOf, 'Provide a valid admitted scenario with explicit 15/30/60/120-minute windows.'),
    capProtection: withResolutionLifecycle(capProtection, asOf, 'Provide a governed CAP lifecycle record with attributable transitions.'),
    multilingualProtectionComposer: withResolutionLifecycle(multilingualProtectionComposer, asOf, 'Provide a complete canonical message and attributable translations.'),
  };
  const sourceProjectionHash = text(input.sourceProjectionHash ?? planning.sourceProjectionHash);
  const compiledAgainstIntentHash = text(input.compiledAgainstIntentHash ?? commandIntent?.value?.proposalHash);
  const proposalReviewBindings = planningReviewBindings({ incidentId, sections, asOf, sourceProjectionHash, compiledAgainstIntentHash });
  const planningReview = projectPlanningReview(input.planningDecisions ?? planning.planningDecisions, asOf, input.planningDecisionInventory ?? planning.planningDecisionInventory);
  const core = {
    schemaVersion: 'vigia.crisis-planning-projection.v1',
    incidentId,
    generatedAt: asOf,
    sourceProjectionHash,
    compiledAgainstIntentHash,
    proposalReviewBindings,
    planningReview,
    ...sections,
    truthBoundary: {
      unknownIsNotNegative: true,
      unavailableIsNotZero: true,
      contextIsNotEvidence: true,
      scenarioIsNotObservation: true,
      forecastIsNotAuthority: true,
      recommendationIsNotDispatch: true,
      actionIsNotSuccess: true,
      automaticCanonicalMutation: false,
      automaticConsequentialExecution: false,
    },
  };
  return immutable({ ...core, projectionHash: semanticHash('crisis-planning-projection', core) });
}

