import {
  FINAL_ARTIFACT_SEAL_REQUIRED_PATHS,
  FINAL_ARTIFACT_SEAL_SCHEMA,
  REPRODUCIBILITY_LABELS,
  finiteIso,
  nonempty,
  rows,
  sameIdentity,
} from "./anduril_integrity_shared.mjs";

export function validateFinalArtifactSeal(
  seal,
  {
    identity,
    currentArtifactHashes = null,
    certification = null,
    reproducibilityVerification = null,
    runtimeIdentity = null,
    ledgerSha256 = null,
    sourceStateVerification = null,
  } = {},
) {
  const violations = [];
  if (!seal || typeof seal !== "object")
    return {
      state: "FAIL",
      violations: [{ code: "FINAL_ARTIFACT_SEAL_MISSING" }],
    };
  if (seal.schemaVersion !== FINAL_ARTIFACT_SEAL_SCHEMA)
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_SCHEMA_INVALID",
      actual: seal.schemaVersion ?? null,
    });
  if (!sameIdentity(seal, identity)) violations.push({ code: "FINAL_ARTIFACT_SEAL_IDENTITY_MISMATCH" });
  if (seal.state !== "PASS")
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_NOT_PASS",
      actual: seal.state ?? null,
    });
  if (!finiteIso(seal.sealedAt))
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_TIME_INVALID",
      actual: seal.sealedAt ?? null,
    });
  if (!sameIdentity(runtimeIdentity ?? seal.runtimeIdentity, identity)) violations.push({ code: "FINAL_ARTIFACT_SEAL_RUNTIME_IDENTITY_MISMATCH" });

  const sourceVerification = sourceStateVerification ?? seal.sourceStateVerification;
  if (sourceVerification?.state !== "PASS" || !sameIdentity(sourceVerification, identity)) {
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_SOURCE_STATE_INVALID",
      actual: sourceVerification?.state ?? null,
    });
  }

  const sealedCertification = seal.certification;
  if (sealedCertification?.state !== "PASS" || !sameIdentity(sealedCertification, identity) || !nonempty(sealedCertification?.sha256))
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_CERTIFICATION_REFERENCE_INVALID",
    });
  const certificationProof = certification ?? sealedCertification;
  if (certificationProof?.state !== "PASS" || !sameIdentity(certificationProof, identity))
    violations.push({ code: "FINAL_ARTIFACT_SEAL_CERTIFICATION_INVALID" });
  const certificationGeneratedAt = certificationProof?.generatedAt;
  if (!finiteIso(certificationGeneratedAt))
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_CERTIFICATION_TIME_INVALID",
      actual: certificationGeneratedAt ?? null,
    });
  if (finiteIso(certificationGeneratedAt) && finiteIso(sealedCertification?.generatedAt) && certificationGeneratedAt !== sealedCertification.generatedAt)
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_CERTIFICATION_TIME_MISMATCH",
      expected: sealedCertification.generatedAt,
      actual: certificationGeneratedAt,
    });
  if (finiteIso(seal.sealedAt) && finiteIso(certificationGeneratedAt) && Date.parse(seal.sealedAt) < Date.parse(certificationGeneratedAt))
    violations.push({ code: "FINAL_ARTIFACT_SEAL_PREDATES_CERTIFICATION" });
  if (!finiteIso(seal.finalReproducibilityObservationAt))
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_REPRODUCIBILITY_TIME_INVALID",
      actual: seal.finalReproducibilityObservationAt ?? null,
    });
  else if (finiteIso(certificationGeneratedAt) && Date.parse(certificationGeneratedAt) <= Date.parse(seal.finalReproducibilityObservationAt))
    violations.push({
      code: "FINAL_ARTIFACT_CERTIFICATION_NOT_AFTER_REPRODUCIBILITY_SEQUENCE",
    });

  const reproducibility = reproducibilityVerification ?? seal.reproducibilityVerification;
  if (reproducibility?.state !== "PASS")
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_REPRODUCIBILITY_INVALID",
      actual: reproducibility?.state ?? null,
    });
  if (!nonempty(seal.reproducibilityLedgerSha256)) violations.push({ code: "FINAL_ARTIFACT_SEAL_LEDGER_HASH_MISSING" });
  else if (nonempty(ledgerSha256) && seal.reproducibilityLedgerSha256 !== ledgerSha256)
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_LEDGER_HASH_MISMATCH",
      expected: seal.reproducibilityLedgerSha256,
      actual: ledgerSha256,
    });

  const artifacts = rows(seal.artifacts);
  const artifactByPath = new Map();
  for (const item of artifacts) {
    if (!nonempty(item?.path) || !nonempty(item?.sha256)) {
      violations.push({
        code: "FINAL_ARTIFACT_SEAL_ENTRY_INVALID",
        path: item?.path ?? null,
      });
      continue;
    }
    if (artifactByPath.has(item.path))
      violations.push({
        code: "FINAL_ARTIFACT_SEAL_DUPLICATE_PATH",
        path: item.path,
      });
    artifactByPath.set(item.path, item.sha256);
  }
  for (const path of FINAL_ARTIFACT_SEAL_REQUIRED_PATHS)
    if (!artifactByPath.has(path))
      violations.push({
        code: "FINAL_ARTIFACT_SEAL_REQUIRED_PATH_MISSING",
        path,
      });
  if (artifactByPath.has(".artifacts/anduril-class-crisis-os/release/final-artifact-seal.json"))
    violations.push({ code: "FINAL_ARTIFACT_SEAL_SELF_REFERENCE" });
  const sealedCertificationHash = artifactByPath.get(".artifacts/anduril-class-crisis-os/certification.json");
  if (nonempty(sealedCertification?.sha256) && nonempty(sealedCertificationHash) && sealedCertification.sha256 !== sealedCertificationHash)
    violations.push({
      code: "FINAL_ARTIFACT_SEAL_CERTIFICATION_HASH_MISMATCH",
      expected: sealedCertification.sha256,
      actual: sealedCertificationHash,
    });

  if (Array.isArray(currentArtifactHashes)) {
    const currentByPath = new Map();
    for (const item of currentArtifactHashes) {
      if (!nonempty(item?.path) || !nonempty(item?.sha256)) continue;
      if (currentByPath.has(item.path))
        violations.push({
          code: "FINAL_ARTIFACT_CURRENT_DUPLICATE_PATH",
          path: item.path,
        });
      currentByPath.set(item.path, item.sha256);
    }
    for (const [path, expected] of artifactByPath) {
      const actual = currentByPath.get(path);
      if (!actual) violations.push({ code: "FINAL_ARTIFACT_SEALED_PATH_MISSING", path });
      else if (actual !== expected)
        violations.push({
          code: "FINAL_ARTIFACT_HASH_MISMATCH",
          path,
          expected,
          actual,
        });
    }
    for (const path of currentByPath.keys()) if (!artifactByPath.has(path)) violations.push({ code: "FINAL_ARTIFACT_UNSEALED_PATH_PRESENT", path });
  }
  return {
    schemaVersion: "vigia.anduril-final-artifact-seal-verification.v1",
    state: violations.length ? "FAIL" : "PASS",
    sealedArtifactCount: artifacts.length,
    currentArtifactCount: Array.isArray(currentArtifactHashes) ? currentArtifactHashes.length : null,
    violations,
  };
}
