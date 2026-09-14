import assert from "node:assert/strict";
import test from "node:test";

import { certificationGateSatisfied } from "./anduril_gate_state.mjs";

test("only the zero-current production metric may be non-blocking NOT_APPLICABLE", () => {
  assert.equal(certificationGateSatisfied("verifiedCurrentResponseCoverage", { state: "NOT_APPLICABLE" }), true);
  assert.equal(certificationGateSatisfied("responseSoftwareCapability", { state: "NOT_APPLICABLE" }), false);
  assert.equal(certificationGateSatisfied("verifiedCurrentResponseCoverage", { state: "FAIL" }), false);
  assert.equal(certificationGateSatisfied("responseSoftwareCapability", { state: "PASS" }), true);
});
