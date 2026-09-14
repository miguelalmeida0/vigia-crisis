import assert from "node:assert/strict";
import test from "node:test";
import {
  FINAL_ARTIFACT_SEAL_REQUIRED_PATHS,
  FINAL_ARTIFACT_SEAL_SCHEMA,
  REPRODUCIBILITY_LABELS,
  validateFinalArtifactSeal,
  validateReproducibilityLedger,
} from "./anduril_integrity.mjs";

const identity = Object.freeze({
  releaseId: "vigia-intelligence-fabric-test",
  codeStateHash: "sha256:code",
  operationalDataHash: "sha256:data",
  releaseStatementHash: "sha256:statement",
});
const reproducibilityArtifactHashes = () => [
  {
    path: ".artifacts/anduril-class-crisis-os/certification.json",
    sha256: "sha256:certification",
  },
  {
    path: "docs/handoffs/VIGIA_ANDURIL_CLASS_CRISIS_OS_MEGA_PATCH_REPORT.md",
    sha256: "sha256:report",
  },
  {
    path: ".artifacts/anduril-class-crisis-os/browser/evidence-index.json",
    sha256: "sha256:browser",
  },
  {
    path: ".artifacts/anduril-class-crisis-os/performance/api-useful-content.json",
    sha256: "sha256:performance",
  },
];

const reproducibilityLedger = () => ({
  schemaVersion: "vigia.anduril-release-reproducibility-ledger.v1",
  ...identity,
  observations: REPRODUCIBILITY_LABELS.map((label, index) => ({
    schemaVersion: "vigia.anduril-release-reproducibility-observation.v1",
    label,
    capturedAt: `2026-09-04T12:0${index}:00.000Z`,
    state: "PASS",
    manifestIdentity: identity,
    runtimeIdentity: identity,
    manifestSha256: `sha256:manifest-${index}`,
    components: {
      Database: "READY",
      "Central API": "READY",
      FieldNet: "READY",
      Operator: "READY",
    },
    localStatusExitCode: 0,
    fieldnetReady: true,
    certification:
      label === "CERTIFY_R"
        ? {
            state: "PASS",
            identity,
            provisionalCertificationAccepted: false,
            failedGates: [],
            sha256: "sha256:certification",
          }
        : null,
    artifactHashes: index >= REPRODUCIBILITY_LABELS.indexOf("CERTIFY_R") ? reproducibilityArtifactHashes() : [],
    processStartedAt: Object.fromEntries(
      ["api", "fieldnet", "operator"].map((component, componentIndex) => [
        component,
        index < 3 ? `2026-09-04T11:59:0${componentIndex + 1}.000Z` : `2026-09-04T12:0${index}:0${componentIndex + 1}.000Z`,
      ]),
    ),
  })),
});

test("reproducibility ledger requires one coherent build/certify/rebuild/two-cold-start sequence", () => {
  const result = validateReproducibilityLedger(reproducibilityLedger(), identity);
  assert.equal(result.state, "PASS");
  assert.deepEqual(Object.fromEntries(Object.keys(identity).map((field) => [field, result[field]])), identity);
});

test("reproducibility ledger fails when a cold start reuses a process or loses readiness", () => {
  const ledger = reproducibilityLedger();
  ledger.observations.at(-1).processStartedAt.api = ledger.observations.at(-2).processStartedAt.api;
  ledger.observations.at(-1).components.FieldNet = "FAILED";
  ledger.observations.at(-1).fieldnetReady = false;
  const result = validateReproducibilityLedger(ledger, identity);
  assert.equal(result.state, "FAIL");
  assert.ok(result.violations.some((item) => item.code === "REPRODUCIBILITY_COLD_START_PROCESS_NOT_RESTARTED"));
  assert.ok(result.violations.some((item) => item.code === "REPRODUCIBILITY_COMPONENT_NOT_READY"));
});

test("reproducibility ledger fails without the certification/report/browser/performance evidence set", () => {
  const ledger = reproducibilityLedger();
  ledger.observations.find((item) => item.label === "CERTIFY_R").artifactHashes.pop();
  const result = validateReproducibilityLedger(ledger, identity);
  assert.equal(result.state, "FAIL");
  assert.ok(result.violations.some((item) => item.code === "REPRODUCIBILITY_CERTIFICATION_ARTIFACT_MISSING"));
});

test("reproducibility ledger fails when generated certification evidence changes after manifest rebuild or restart", () => {
  const ledger = reproducibilityLedger();
  const coldStart = ledger.observations.find((item) => item.label === "COLD_START_1");
  coldStart.artifactHashes.find((item) => item.path.endsWith("/certification.json")).sha256 = "sha256:rewritten";
  const result = validateReproducibilityLedger(ledger, identity);
  assert.equal(result.state, "FAIL");
  assert.ok(result.violations.some((item) => item.code === "REPRODUCIBILITY_CERTIFICATION_ARTIFACT_CHANGED" && item.label === "COLD_START_1"));
});

test("reproducibility ledger rejects a release-identity mismatch and out-of-order observations", () => {
  const ledger = reproducibilityLedger();
  ledger.codeStateHash = "sha256:other";
  ledger.observations[2].capturedAt = ledger.observations[0].capturedAt;
  const result = validateReproducibilityLedger(ledger, identity);
  assert.equal(result.state, "FAIL");
  assert.ok(result.violations.some((item) => item.code === "REPRODUCIBILITY_LEDGER_IDENTITY_MISMATCH"));
  assert.ok(result.violations.some((item) => item.code === "REPRODUCIBILITY_OBSERVATION_ORDER_INVALID"));
});

const finalArtifactHashes = () =>
  FINAL_ARTIFACT_SEAL_REQUIRED_PATHS.map((path, index) => ({
    path,
    sha256: `sha256:artifact-${index}`,
  }));
const finalArtifactSeal = () => ({
  schemaVersion: FINAL_ARTIFACT_SEAL_SCHEMA,
  sealedAt: "2026-09-04T12:20:00.000Z",
  state: "PASS",
  ...identity,
  runtimeIdentity: identity,
  certification: {
    state: "PASS",
    generatedAt: "2026-09-04T12:19:00.000Z",
    sha256: finalArtifactHashes().find((item) => item.path === ".artifacts/anduril-class-crisis-os/certification.json").sha256,
    ...identity,
  },
  finalReproducibilityObservationAt: "2026-09-04T12:10:00.000Z",
  reproducibilityVerification: { state: "PASS" },
  sourceStateVerification: { state: "PASS", ...identity },
  reproducibilityLedgerSha256: "sha256:ledger",
  artifacts: finalArtifactHashes(),
});

test("final artifact seal binds the complete current artifact set without self-reference", () => {
  const seal = finalArtifactSeal();
  const result = validateFinalArtifactSeal(seal, {
    identity,
    currentArtifactHashes: finalArtifactHashes(),
    certification: seal.certification,
    reproducibilityVerification: seal.reproducibilityVerification,
    runtimeIdentity: identity,
    ledgerSha256: "sha256:ledger",
    sourceStateVerification: seal.sourceStateVerification,
  });
  assert.equal(result.state, "PASS");
});

test("final artifact seal rejects rewritten, missing, and unsealed artifacts", () => {
  const seal = finalArtifactSeal();
  const current = finalArtifactHashes();
  current[0].sha256 = "sha256:rewritten";
  current.pop();
  current.push({
    path: ".artifacts/anduril-class-crisis-os/unsealed.json",
    sha256: "sha256:unsealed",
  });
  const result = validateFinalArtifactSeal(seal, {
    identity,
    currentArtifactHashes: current,
    certification: seal.certification,
    reproducibilityVerification: seal.reproducibilityVerification,
    runtimeIdentity: identity,
    ledgerSha256: "sha256:ledger",
    sourceStateVerification: seal.sourceStateVerification,
  });
  assert.equal(result.state, "FAIL");
  assert.ok(result.violations.some((item) => item.code === "FINAL_ARTIFACT_HASH_MISMATCH"));
  assert.ok(result.violations.some((item) => item.code === "FINAL_ARTIFACT_SEALED_PATH_MISSING"));
  assert.ok(result.violations.some((item) => item.code === "FINAL_ARTIFACT_UNSEALED_PATH_PRESENT"));
});

test("final artifact seal rejects stale or missing frozen-source verification", () => {
  const seal = finalArtifactSeal();
  const result = validateFinalArtifactSeal(seal, {
    identity,
    currentArtifactHashes: finalArtifactHashes(),
    certification: seal.certification,
    reproducibilityVerification: seal.reproducibilityVerification,
    runtimeIdentity: identity,
    ledgerSha256: "sha256:ledger",
    sourceStateVerification: { state: "FAIL", ...identity },
  });
  assert.equal(result.state, "FAIL");
  assert.ok(result.violations.some((item) => item.code === "FINAL_ARTIFACT_SEAL_SOURCE_STATE_INVALID"));
});
