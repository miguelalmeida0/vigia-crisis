import {
  GOLDEN_SCENARIO_CONTRACTS,
  createGoldenScenarioReceipt,
  encodeGoldenScenarioReceiptDiagnostic,
} from "./anduril_integrity.mjs";

const goldenTestNames = Object.freeze({
  GOLDEN_1: "golden 1: one",
  GOLDEN_2: "golden 2: two",
  GOLDEN_3: "golden 3: three",
  GOLDEN_4: "golden 4: four",
  GOLDEN_5: "golden 5: five",
  GOLDEN_6: "golden 6: six",
  GOLDEN_7: "golden 7: seven",
  GOLDEN_PLANNING: "golden planning: planning",
  GOLDEN_RESPONSE_CAPACITY: "golden response capacity: generated requirement completes the signed FieldNet roundtrip, closes after admission, recalculates optimization, and persists review",
});

export const goldenReceipt = (scenarioId) => {
  const contract = GOLDEN_SCENARIO_CONTRACTS[scenarioId];
  const transitions = Array.from({ length: contract.minimumTransitions }, (_, index) => ({
    objectType: "TEST_OBJECT",
    objectId: `object:${scenarioId}:${index}`,
    fromState: `BEFORE_${index}`,
    toState: `AFTER_${index}`,
    occurredAt: "2026-09-04T12:00:00.000Z",
    persisted: true,
    source: { kind: "TEST_REPOSITORY", reference: `source:${scenarioId}:${index}` },
    receiptReference: `transition:${scenarioId}:${index}`,
  }));
  return createGoldenScenarioReceipt({
    scenarioId,
    testName: goldenTestNames[scenarioId],
    incidentId: "incident:test",
    service:
      scenarioId === "GOLDEN_RESPONSE_CAPACITY"
        ? "ResponseCapabilityService + signed FieldNet task/ack/report/completion + central sync/admission/review"
        : "TestService",
    serviceEvidence: {
      beforeFingerprint: `sha256:service-before:${scenarioId}`,
      afterFingerprint: `sha256:service-after:${scenarioId}`,
    },
    repository: {
      kind: "IN_MEMORY_TEST",
      scope: "UNIT_TEST",
      beforeRevision: `sha256:before:${scenarioId}`,
      afterRevision: `sha256:after:${scenarioId}`,
      persisted: true,
    },
    transitions,
    claims: contract.requiredClaims.map((code) => ({
      code,
      state: "PROVEN",
      evidenceReferences: transitions.map((item) => item.receiptReference),
    })),
    recordedAt: "2026-09-04T12:00:00.000Z",
    resultState: "PASS",
    truthBoundary: "Unit-test receipt only; not production truth.",
  });
};

const goldenDiagnostics = Object.keys(GOLDEN_SCENARIO_CONTRACTS)
  .map((scenarioId) => `# ${encodeGoldenScenarioReceiptDiagnostic(goldenReceipt(scenarioId))}`)
  .join("\n");

export const validTap = `TAP version 13
# Subtest: golden 1: one
ok 1 - golden 1: one
# Subtest: golden 2: two
ok 2 - golden 2: two
# Subtest: invariant: public field observations remain unverified observations and public tasking is remote-only
ok 3 - invariant: public field observations remain unverified observations and public tasking is remote-only
# Subtest: golden 3: three
ok 4 - golden 3: three
# Subtest: golden 4: four
ok 5 - golden 4: four
# Subtest: golden 5: five
ok 6 - golden 5: five
# Subtest: golden 6: six
ok 7 - golden 6: six
# Subtest: golden 7: seven
ok 8 - golden 7: seven
# Subtest: golden planning: planning
ok 9 - golden planning: planning
# Subtest: golden response capacity: generated requirement completes the signed FieldNet roundtrip, closes after admission, recalculates optimization, and persists review
ok 10 - golden response capacity: generated requirement completes the signed FieldNet roundtrip, closes after admission, recalculates optimization, and persists review
${goldenDiagnostics}
1..10
# tests 10
# pass 10
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 10.25
`;
