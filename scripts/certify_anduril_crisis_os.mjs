import path from "node:path";

import { P0_OPERATOR_CAPABILITIES, validateReproducibilityLedger } from "./certification/anduril_integrity.mjs";
import { analyzeAutopilotTruth } from "./certification/anduril_autopilot_analysis.mjs";
import { ingestBrowserEvidence } from "./certification/anduril_browser_evidence.mjs";
import { validateBrowserRun } from "./certification/anduril_browser_validation.mjs";
import { collectCanonicalRoutes } from "./certification/anduril_canonical_routes.mjs";
import { createCertificationContext } from "./certification/anduril_certification_context.mjs";
import { createCoreGates } from "./certification/anduril_core_gates.mjs";
import { writeCertificationProofs } from "./certification/anduril_evidence_writer.mjs";
import { createFinalGates } from "./certification/anduril_final_gates.mjs";
import { finalizeCertification } from "./certification/anduril_finalize.mjs";
import { analyzeOperationsAndMaps } from "./certification/anduril_operations_map_analysis.mjs";
import { measureApiPerformance } from "./certification/anduril_performance.mjs";
import { analyzePlanning } from "./certification/anduril_planning_analysis.mjs";
import { analyzeResponseCapability } from "./certification/anduril_response_analysis.mjs";
import { analyzeResponseCoverage } from "./certification/anduril_response_coverage.mjs";
import { createResponseGates } from "./certification/anduril_response_gates.mjs";
import { captureRuntimeIdentity } from "./certification/anduril_runtime_probe.mjs";
import { analyzeStrategicIntelligence } from "./certification/anduril_strategic_analysis.mjs";
import { runCertificationTestCohort } from "./certification/anduril_test_cohort.mjs";
import { hasReceiptBackedOperatorExercise, p0FeaturePass } from "./certification/anduril_feature_availability.mjs";
import { isolatedCapabilityProof } from "./certification/anduril_isolated_capability_proof.mjs";

const state = await createCertificationContext();
Object.assign(state, await captureRuntimeIdentity(state));
Object.assign(state, await runCertificationTestCohort(state));
Object.assign(state, await collectCanonicalRoutes(state));
Object.assign(state, await analyzeStrategicIntelligence(state));
Object.assign(state, analyzeAutopilotTruth(state));
Object.assign(state, analyzeResponseCapability(state));
Object.assign(state, analyzeResponseCoverage(state));
Object.assign(state, analyzeOperationsAndMaps(state));
Object.assign(state, analyzePlanning(state));
Object.assign(state, await writeCertificationProofs(state));
Object.assign(state, await measureApiPerformance(state));
Object.assign(state, await validateBrowserRun(state));
Object.assign(state, await ingestBrowserEvidence(state));

const reproducibilityLedger = await state.readJson(path.join(state.artifactRoot, "release/reproducibility-ledger.json"));
state.reproducibilityProof = validateReproducibilityLedger(reproducibilityLedger, state.identity);
await state.writeJson("release/reproducibility-verification.json", state.reproducibilityProof);
const operatorActionEvidence = state.browserAcceptance?.actionIntegrity;
const executableEvidence = {
  commandByIntent: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["COMMAND-INTENT-CREATE"]),
  operationalPeriodGenerator: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["OPERATIONAL_PERIOD"]),
  responseCapability: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["RESPONSE-RECOMMENDATION-REVIEW"]),
  resourceOptimizerOutput: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["RESOURCE_RECOMMENDATION"]),
  autonomousReplanning: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["AUTONOMOUS_REPLAN"]),
  evacuationCorridor: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["EVACUATION_CORRIDOR"]),
  protectionTimeline: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["PROTECTION_TIMELINE"]),
  capLifecycle: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["PROTECTION-"]),
  multilingualComposer: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["PROTECTION-EXERCISE-SEND"]),
  actionOutcomeLedger: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["PERIOD-RECORD-OUTCOME"]),
  nearMiss: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["PERIOD-RECORD-LESSON"]),
  prevention: hasReceiptBackedOperatorExercise(operatorActionEvidence, ["PERIOD-RECORD-LESSON"]),
};
const operatorSurfaceEvidence = Object.fromEntries(
  P0_OPERATOR_CAPABILITIES.map((name) => [name, state.browserAcceptance?.operatorCapabilityEvidence?.[name]?.state === "PASS"]),
);
const isolatedCapabilityEvidence = Object.fromEntries(
  P0_OPERATOR_CAPABILITIES.map((name) => [
    name,
    isolatedCapabilityProof({
      name,
      feature: state.featureAvailability[name],
      operatorSurfaceEvidence: operatorSurfaceEvidence[name],
      testCohort: state.testCohort,
      goldenScenarios: state.goldenScenarios,
    }),
  ]),
);
state.p0FeatureGateDetails = Object.fromEntries(
  Object.entries(state.featureAvailability).map(([name, feature]) => [
    name,
    {
      ...feature,
      operatorSurfaceEvidence: operatorSurfaceEvidence[name] ?? null,
      operatorExecutionEvidence: executableEvidence[name] ?? null,
      isolatedCapabilityProof: isolatedCapabilityEvidence[name],
    },
  ]),
);
state.p0FeatureGates = Object.fromEntries(
  P0_OPERATOR_CAPABILITIES.map((name) => {
    const surfaceVisible = operatorSurfaceEvidence[name] === true;
    const executionRequired = Object.hasOwn(executableEvidence, name);
    const exercised = !executionRequired || executableEvidence[name] === true;
    return [
      name,
      p0FeaturePass(state.featureAvailability[name], {
        executable: true,
        operatorEvidence: surfaceVisible && exercised,
      }) || isolatedCapabilityEvidence[name]?.state === "PASS",
    ];
  }),
);
state.gates = {
  ...createCoreGates(state),
  ...createResponseGates(state),
  ...createFinalGates(state),
};
await finalizeCertification(state);
