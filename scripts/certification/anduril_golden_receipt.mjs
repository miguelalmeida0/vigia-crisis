import { GOLDEN_SCENARIO_CONTRACTS, GOLDEN_SCENARIO_RECEIPT_SCHEMA, evidenceFingerprint, finiteIso, nonempty, rows } from "./anduril_integrity_shared.mjs";

export function validateGoldenScenarioReceipt(receipt, contract = GOLDEN_SCENARIO_CONTRACTS[receipt?.scenarioId]) {
  const violations = [];
  if (!receipt || typeof receipt !== "object") return { state: "FAIL", violations: [{ code: "GOLDEN_RECEIPT_MISSING" }] };
  if (receipt.schemaVersion !== GOLDEN_SCENARIO_RECEIPT_SCHEMA)
    violations.push({
      code: "GOLDEN_RECEIPT_SCHEMA_INVALID",
      actual: receipt.schemaVersion ?? null,
    });
  if (!contract)
    violations.push({
      code: "GOLDEN_RECEIPT_SCENARIO_UNKNOWN",
      scenarioId: receipt.scenarioId ?? null,
    });
  else if (!contract.testName.test(String(receipt.testName ?? "")))
    violations.push({
      code: "GOLDEN_RECEIPT_TEST_NAME_MISMATCH",
      scenarioId: receipt.scenarioId,
      testName: receipt.testName ?? null,
    });
  if (receipt.universe !== "ISOLATED_TEST_FIXTURE" || receipt.productionTruth !== false)
    violations.push({
      code: "GOLDEN_RECEIPT_UNIVERSE_INVALID",
      universe: receipt.universe ?? null,
      productionTruth: receipt.productionTruth ?? null,
    });
  if (!nonempty(receipt.incidentId) || !nonempty(receipt.service)) violations.push({ code: "GOLDEN_RECEIPT_BINDING_MISSING" });
  if (contract?.service && !contract.service.test(String(receipt.service ?? "")))
    violations.push({ code: "GOLDEN_RECEIPT_SERVICE_MISMATCH", scenarioId: receipt.scenarioId, service: receipt.service ?? null });
  if (
    !nonempty(receipt.serviceEvidence?.beforeFingerprint) ||
    !nonempty(receipt.serviceEvidence?.afterFingerprint) ||
    receipt.serviceEvidence.beforeFingerprint === receipt.serviceEvidence.afterFingerprint
  )
    violations.push({ code: "GOLDEN_RECEIPT_SERVICE_TRANSITION_INVALID" });
  if (!finiteIso(receipt.recordedAt) || receipt.resultState !== "PASS" || !nonempty(receipt.truthBoundary))
    violations.push({ code: "GOLDEN_RECEIPT_RESULT_INVALID" });
  const repository = receipt.repository;
  if (
    !repository ||
    !nonempty(repository.kind) ||
    !nonempty(repository.scope) ||
    repository.persisted !== true ||
    !nonempty(repository.beforeRevision) ||
    !nonempty(repository.afterRevision) ||
    repository.beforeRevision === repository.afterRevision
  )
    violations.push({ code: "GOLDEN_RECEIPT_REPOSITORY_TRANSITION_INVALID" });
  const transitions = rows(receipt.transitions);
  if (!contract || transitions.length < (contract.minimumTransitions ?? 1))
    violations.push({
      code: "GOLDEN_RECEIPT_TRANSITIONS_INSUFFICIENT",
      expected: contract?.minimumTransitions ?? null,
      actual: transitions.length,
    });
  const transitionReferences = new Set();
  transitions.forEach((transition, index) => {
    if (
      transition?.sequence !== index + 1 ||
      !nonempty(transition?.objectType) ||
      !nonempty(transition?.objectId) ||
      !nonempty(transition?.fromState) ||
      !nonempty(transition?.toState) ||
      transition.fromState === transition.toState ||
      !finiteIso(transition?.occurredAt) ||
      transition?.persisted !== true ||
      !nonempty(transition?.source?.kind) ||
      !nonempty(transition?.source?.reference) ||
      !nonempty(transition?.receiptReference)
    )
      violations.push({ code: "GOLDEN_RECEIPT_TRANSITION_INVALID", index });
    if (nonempty(transition?.receiptReference)) transitionReferences.add(transition.receiptReference);
  });
  const claims = rows(receipt.claims);
  const claimByCode = new Map(claims.map((claim) => [claim?.code, claim]));
  for (const code of contract?.requiredClaims ?? []) {
    const claim = claimByCode.get(code);
    if (
      !claim ||
      claim.state !== "PROVEN" ||
      !rows(claim.evidenceReferences).length ||
      claim.evidenceReferences.some((reference) => !transitionReferences.has(reference))
    )
      violations.push({
        code: "GOLDEN_RECEIPT_REQUIRED_CLAIM_INVALID",
        scenarioId: receipt.scenarioId,
        claim: code,
      });
  }
  const { fingerprint, receiptId, ...core } = receipt;
  const expectedFingerprint = evidenceFingerprint(core);
  const expectedReceiptId = `golden-receipt:${String(receipt.scenarioId ?? "unknown").toLowerCase()}:${expectedFingerprint.slice("sha256:".length, "sha256:".length + 24)}`;
  if (fingerprint !== expectedFingerprint || receiptId !== expectedReceiptId) violations.push({ code: "GOLDEN_RECEIPT_FINGERPRINT_INVALID" });
  return { state: violations.length ? "FAIL" : "PASS", violations };
}
