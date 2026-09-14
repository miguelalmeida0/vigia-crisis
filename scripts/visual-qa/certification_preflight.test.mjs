import assert from "node:assert/strict";
import test from "node:test";

import { parseCanonicalRuntimeStatus, validateCanonicalVqaPreflight } from "./certification_preflight.mjs";

const identity = {
  releaseId: "vigia-intelligence-fabric-test",
  codeStateHash: "sha256:code",
  operationalDataHash: "sha256:data",
  releaseStatementHash: "sha256:statement",
};
const readyStatus = "Database       READY\nCentral API    READY\nFieldNet       READY\nOperator       READY\n";
const proof = { identity, fieldnetReadiness: { ready: true } };
const pointer = { origin: "http://127.0.0.1:4190", port: 4190, releaseId: identity.releaseId };

test("canonical VQA preflight requires all four components and exact identity quartet", () => {
  assert.deepEqual(parseCanonicalRuntimeStatus(readyStatus), { Database: "READY", "Central API": "READY", FieldNet: "READY", Operator: "READY" });
  assert.equal(validateCanonicalVqaPreflight({ statusOutput: readyStatus, statusExitCode: 0, manifest: identity, runtimeProof: proof, pointer }).state, "PASS");
});

test("canonical VQA preflight fails closed for FieldNet/database readiness or quartet mismatch", () => {
  const result = validateCanonicalVqaPreflight({
    statusOutput: readyStatus.replace("Database       READY", "Database       DEGRADED").replace("FieldNet       READY", "FieldNet       NOT_READY"),
    statusExitCode: 1,
    manifest: identity,
    runtimeProof: { identity: { ...identity, operationalDataHash: "sha256:other" }, fieldnetReadiness: { ready: false } },
    pointer,
  });
  assert.equal(result.state, "FAIL");
  assert.ok(result.violations.some((item) => item.code === "VQA_RUNTIME_COMPONENT_NOT_READY" && item.component === "Database"));
  assert.ok(result.violations.some((item) => item.code === "VQA_RUNTIME_COMPONENT_NOT_READY" && item.component === "FieldNet"));
  assert.ok(result.violations.some((item) => item.code === "VQA_RUNTIME_IDENTITY_MISMATCH" && item.field === "operationalDataHash"));
  assert.ok(result.violations.some((item) => item.code === "VQA_FIELDNET_AUTHORITATIVE_READINESS_FALSE"));
});
