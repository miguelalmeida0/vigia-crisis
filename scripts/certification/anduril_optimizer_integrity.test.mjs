import assert from "node:assert/strict";
import test from "node:test";

import { auditOptimizerCapacityCollectionPlans } from "./anduril_integrity.mjs";

test("optimizer capacity audit requires a collection plan whenever capacityKnown is false regardless of report state", () => {
  const projection = {
    incident: { id: "incident:capacity-audit" },
    optimizerInputs: {
      candidates: [
        {
          facilityId: "hospital:reported-but-incomplete",
          kind: "HOSPITAL",
          capacityState: "FIELD_REPORTED",
          capacityKnown: false,
        },
        {
          facilityId: "station:known",
          kind: "FIRE_STATION",
          capacityState: "PARTNER_REPORTED",
          capacityKnown: true,
        },
        {
          facilityId: "shelter:not-decision-relevant",
          kind: "SHELTER",
          capacityState: "UNKNOWN",
          capacityKnown: false,
          capacityDecisionRelevant: false,
        },
      ],
    },
    informationRequirements: [],
  };
  const missing = auditOptimizerCapacityCollectionPlans([projection]);
  assert.equal(missing.state, "FAIL");
  assert.deepEqual(
    missing.violations.map((item) => item.facilityId),
    ["hospital:reported-but-incomplete"],
  );
  projection.informationRequirements.push({
    subjectId: "hospital:reported-but-incomplete",
    collectionPlan: {
      owner: "Response capability collection",
      source: "Named current-capacity provider",
    },
  });
  const covered = auditOptimizerCapacityCollectionPlans([projection]);
  assert.equal(covered.state, "PASS");
  assert.equal(covered.unknownCandidateCount, 1);
});
