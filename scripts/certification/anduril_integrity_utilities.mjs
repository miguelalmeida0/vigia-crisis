import { createHash } from "node:crypto";
import { IDENTITY_FIELDS } from "./anduril_integrity_contracts.mjs";

export function auditOptimizerCapacityCollectionPlans(responseProjections = []) {
  const violations = [];
  for (const projection of rows(responseProjections)) {
    const incidentId = projection?.incident?.id ?? null;
    const requirements = rows(projection?.informationRequirements);
    for (const candidate of rows(projection?.optimizerInputs?.candidates)) {
      if (candidate?.capacityKnown !== false || candidate?.capacityDecisionRelevant === false) continue;
      const requirement = requirements.find((item) => String(item?.subjectId ?? "") === String(candidate?.facilityId ?? ""));
      if (!requirement?.collectionPlan || typeof requirement.collectionPlan !== "object" || Array.isArray(requirement.collectionPlan)) {
        violations.push({
          incidentId,
          facilityId: candidate?.facilityId ?? null,
          kind: candidate?.kind ?? null,
          capacityState: candidate?.capacityState ?? null,
          capacityKnown: candidate?.capacityKnown,
          reason: "OPTIMIZER_UNKNOWN_CAPACITY_COLLECTION_PLAN_MISSING",
        });
      }
    }
  }
  return {
    schemaVersion: "vigia.optimizer-capacity-collection-plan-audit.v1",
    state: violations.length ? "FAIL" : "PASS",
    projectionCount: rows(responseProjections).length,
    unknownCandidateCount: rows(responseProjections).reduce(
      (sum, projection) => sum + rows(projection?.optimizerInputs?.candidates).filter((item) => item?.capacityKnown === false && item?.capacityDecisionRelevant !== false).length,
      0,
    ),
    violations,
  };
}

export const finiteIso = (value) => Number.isFinite(Date.parse(value ?? ""));
export const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
export const rows = (value) => (Array.isArray(value) ? value : []);
export const sameIdentity = (left, right) => IDENTITY_FIELDS.every((key) => nonempty(left?.[key]) && left[key] === right?.[key]);
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
export const evidenceFingerprint = (value) => `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
export const percentile = (values, fraction) => {
  const ordered = rows(values)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  return ordered.length ? Number(ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * fraction) - 1))].toFixed(2)) : null;
};
export const variance = (values) => {
  const valid = rows(values).filter(Number.isFinite);
  if (!valid.length) return null;
  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return Number((valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / valid.length).toFixed(2));
};
