import {
  FINAL_ARTIFACT_SEAL_REQUIRED_PATHS,
  FINAL_ARTIFACT_SEAL_SCHEMA,
  IDENTITY_FIELDS,
  REPRODUCIBILITY_LABELS,
  REPRODUCIBILITY_STABLE_ARTIFACT_PATHS,
  finiteIso,
  nonempty,
  rows,
  sameIdentity,
} from "./anduril_integrity_shared.mjs";

export function validateReproducibilityLedger(ledger, identity) {
  const violations = [];
  if (!ledger || typeof ledger !== "object")
    return {
      state: "FAIL",
      violations: [{ code: "REPRODUCIBILITY_LEDGER_MISSING" }],
    };
  if (ledger.schemaVersion !== "vigia.anduril-release-reproducibility-ledger.v1")
    violations.push({
      code: "REPRODUCIBILITY_LEDGER_SCHEMA_INVALID",
      actual: ledger.schemaVersion ?? null,
    });
  if (!sameIdentity(ledger, identity)) violations.push({ code: "REPRODUCIBILITY_LEDGER_IDENTITY_MISMATCH" });
  const observations = rows(ledger.observations).filter((item) => sameIdentity(item?.manifestIdentity, identity));
  const latest = Object.fromEntries(REPRODUCIBILITY_LABELS.map((label) => [label, observations.filter((item) => item.label === label).at(-1) ?? null]));
  for (const label of REPRODUCIBILITY_LABELS) {
    const observation = latest[label];
    if (!observation) {
      violations.push({ code: "REPRODUCIBILITY_OBSERVATION_MISSING", label });
      continue;
    }
    if (observation.schemaVersion !== "vigia.anduril-release-reproducibility-observation.v1")
      violations.push({
        code: "REPRODUCIBILITY_OBSERVATION_SCHEMA_INVALID",
        label,
        actual: observation.schemaVersion ?? null,
      });
    if (observation.state !== "PASS")
      violations.push({
        code: "REPRODUCIBILITY_OBSERVATION_NOT_PASS",
        label,
        actual: observation.state,
      });
    if (!sameIdentity(observation.runtimeIdentity, identity))
      violations.push({
        code: "REPRODUCIBILITY_RUNTIME_IDENTITY_MISMATCH",
        label,
      });
    if (!nonempty(observation.manifestSha256)) violations.push({ code: "REPRODUCIBILITY_MANIFEST_HASH_MISSING", label });
    if (observation.localStatusExitCode !== 0)
      violations.push({
        code: "REPRODUCIBILITY_LOCAL_STATUS_FAILED",
        label,
        actual: observation.localStatusExitCode ?? null,
      });
    for (const component of ["Database", "Central API", "FieldNet", "Operator"])
      if (observation.components?.[component] !== "READY")
        violations.push({
          code: "REPRODUCIBILITY_COMPONENT_NOT_READY",
          label,
          component,
          actual: observation.components?.[component] ?? null,
        });
    for (const component of ["api", "fieldnet", "operator"])
      if (!finiteIso(observation.processStartedAt?.[component]))
        violations.push({
          code: "REPRODUCIBILITY_PROCESS_START_INVALID",
          label,
          component,
          actual: observation.processStartedAt?.[component] ?? null,
        });
  }
  const orderedTimes = REPRODUCIBILITY_LABELS.map((label) => Date.parse(latest[label]?.capturedAt ?? ""));
  if (orderedTimes.some((value) => !Number.isFinite(value)) || orderedTimes.some((value, index) => index > 0 && value <= orderedTimes[index - 1]))
    violations.push({ code: "REPRODUCIBILITY_OBSERVATION_ORDER_INVALID" });
  const certifyObservation = latest.CERTIFY_R;
  if (certifyObservation) {
    const certification = certifyObservation.certification;
    const provisional =
      certification?.state === "FAIL" &&
      certification?.provisionalCertificationAccepted === true &&
      rows(certification?.failedGates).length === 1 &&
      certification.failedGates[0] === "releaseReproducibility";
    if (!sameIdentity(certification?.identity, identity) || !(certification?.state === "PASS" || provisional) || !nonempty(certification?.sha256))
      violations.push({
        code: "REPRODUCIBILITY_CERTIFICATION_EVIDENCE_INVALID",
      });
    const artifactByPath = new Map(rows(certifyObservation.artifactHashes).map((item) => [item?.path, item]));
    for (const path of REPRODUCIBILITY_STABLE_ARTIFACT_PATHS)
      if (!nonempty(artifactByPath.get(path)?.sha256))
        violations.push({
          code: "REPRODUCIBILITY_CERTIFICATION_ARTIFACT_MISSING",
          path,
        });
    for (const label of ["CERTIFY_R", "REBUILD_MANIFEST", "COLD_START_1", "COLD_START_2"]) {
      const observation = latest[label];
      if (!observation) continue;
      const artifactRows = rows(observation.artifactHashes);
      const currentByPath = new Map(artifactRows.map((item) => [item?.path, item]));
      for (const path of REPRODUCIBILITY_STABLE_ARTIFACT_PATHS) {
        const baselineHash = artifactByPath.get(path)?.sha256;
        const currentHash = currentByPath.get(path)?.sha256;
        if (!nonempty(currentHash))
          violations.push({
            code: "REPRODUCIBILITY_CERTIFICATION_ARTIFACT_MISSING",
            label,
            path,
          });
        else if (nonempty(baselineHash) && currentHash !== baselineHash)
          violations.push({
            code: "REPRODUCIBILITY_CERTIFICATION_ARTIFACT_CHANGED",
            label,
            path,
            expected: baselineHash,
            actual: currentHash,
          });
      }
    }
  }
  const rebuild = latest.REBUILD_MANIFEST;
  const coldOne = latest.COLD_START_1;
  const coldTwo = latest.COLD_START_2;
  for (const [label, observation] of [
    ["COLD_START_1", coldOne],
    ["COLD_START_2", coldTwo],
  ]) {
    if (observation && observation.fieldnetReady !== true) violations.push({ code: "REPRODUCIBILITY_FIELDNET_NOT_READY", label });
  }
  for (const [priorLabel, prior, nextLabel, next] of [
    ["REBUILD_MANIFEST", rebuild, "COLD_START_1", coldOne],
    ["COLD_START_1", coldOne, "COLD_START_2", coldTwo],
  ]) {
    if (!prior || !next) continue;
    for (const component of ["api", "fieldnet", "operator"]) {
      const first = prior.processStartedAt?.[component];
      const second = next.processStartedAt?.[component];
      if (!finiteIso(first) || !finiteIso(second) || first === second || Date.parse(second) <= Date.parse(first))
        violations.push({
          code: "REPRODUCIBILITY_COLD_START_PROCESS_NOT_RESTARTED",
          component,
          priorLabel,
          nextLabel,
          first: first ?? null,
          second: second ?? null,
        });
    }
  }
  return {
    schemaVersion: "vigia.anduril-reproducibility-ledger-verification.v1",
    state: violations.length ? "FAIL" : "PASS",
    ...Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, identity?.[field] ?? null])),
    requiredLabels: REPRODUCIBILITY_LABELS,
    observedLabels: Object.fromEntries(Object.entries(latest).map(([label, value]) => [label, Boolean(value)])),
    observationsForRelease: observations.length,
    violations,
  };
}
