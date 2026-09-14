import { writeFile } from "node:fs/promises";
import path from "node:path";

import { probeCanonicalRuntimeIdentity, releaseIdentityOf } from "../release/runtime_identity_binding.mjs";
import { FINAL_ARTIFACT_SEAL_SCHEMA, sameIdentity, validateFinalArtifactSeal, validateReproducibilityLedger } from "./anduril_integrity.mjs";
import { collectFinalArtifactHashes, coreArtifactIdentityViolations, readJson, sha256, verifyCurrentSourceState } from "./anduril_reproducibility_context.mjs";

export async function runFinalSealMode({ context, manifest, identity, sealFinal }) {
  const certificationPath = path.join(context.root, ".artifacts/anduril-class-crisis-os/certification.json");
  const [ledger, certification] = await Promise.all([readJson(context.ledgerPath), readJson(certificationPath)]);
  const reproducibilityVerification = validateReproducibilityLedger(ledger, identity);
  const ledgerSha256 = await sha256(context.ledgerPath).catch(() => null);
  const artifactHashes = await collectFinalArtifactHashes(context);
  const contentViolations = await coreArtifactIdentityViolations(context, identity);
  const sourceStateVerification = await verifyCurrentSourceState(context, manifest, identity);
  let runtimeIdentity = null,
    runtimeError = null;
  try {
    runtimeIdentity = (
      await probeCanonicalRuntimeIdentity({
        manifest,
        apiOrigin: context.apiOrigin,
        operatorOrigin: context.operatorOrigin,
      })
    ).identity;
  } catch (error) {
    runtimeError = String(error?.message ?? error);
  }
  const observations = Array.isArray(ledger?.observations) ? ledger.observations : [];
  const finalObservation = observations.filter((item) => item?.label === "COLD_START_2" && sameIdentity(item?.manifestIdentity, identity)).at(-1) ?? null;
  const certificationSummary = certification
    ? {
        state: certification.state,
        generatedAt: certification.generatedAt,
        sha256: await sha256(certificationPath),
        ...releaseIdentityOf(certification),
      }
    : null;
  const validationOptions = {
    identity,
    currentArtifactHashes: artifactHashes,
    certification,
    reproducibilityVerification,
    runtimeIdentity,
    ledgerSha256,
    sourceStateVerification,
  };

  if (!sealFinal) {
    const seal = await readJson(context.finalSealPath);
    const validation = validateFinalArtifactSeal(seal, validationOptions);
    const violations = [
      ...contentViolations,
      ...sourceStateVerification.violations,
      ...(runtimeError ? [{ code: "FINAL_ARTIFACT_RUNTIME_PROBE_FAILED", error: runtimeError }] : []),
      ...validation.violations,
    ];
    const verification = {
      ...validation,
      state: violations.length ? "FAIL" : "PASS",
      violations,
    };
    process.stdout.write(`${JSON.stringify({ state: verification.state, seal: path.relative(context.root, context.finalSealPath), verification }, null, 2)}\n`);
    if (verification.state !== "PASS") process.exitCode = 1;
    return;
  }

  const releaseReproducibilityGate = (Array.isArray(certification?.gates) ? certification.gates : []).find((item) => item?.name === "releaseReproducibility");
  const preconditionViolations = [
    ...contentViolations,
    ...sourceStateVerification.violations,
    ...(runtimeError ? [{ code: "FINAL_ARTIFACT_RUNTIME_PROBE_FAILED", error: runtimeError }] : []),
    ...(certification?.state === "PASS"
      ? []
      : [
          {
            code: "FINAL_ARTIFACT_CERTIFICATION_NOT_PASS",
            actual: certification?.state ?? null,
          },
        ]),
    ...(releaseReproducibilityGate?.state === "PASS"
      ? []
      : [
          {
            code: "FINAL_ARTIFACT_CERTIFICATION_REPRODUCIBILITY_GATE_NOT_PASS",
            actual: releaseReproducibilityGate?.state ?? null,
          },
        ]),
    ...(reproducibilityVerification.state === "PASS" ? [] : reproducibilityVerification.violations),
    ...artifactHashes
      .filter((item) => !item.sha256)
      .map((item) => ({
        code: "FINAL_ARTIFACT_HASH_UNAVAILABLE",
        path: item.path,
      })),
  ];
  const sealDraft = {
    schemaVersion: FINAL_ARTIFACT_SEAL_SCHEMA,
    sealedAt: new Date().toISOString(),
    state: preconditionViolations.length ? "FAIL" : "PASS",
    ...identity,
    runtimeIdentity,
    sourceStateVerification,
    certification: certificationSummary,
    finalReproducibilityObservationAt: finalObservation?.capturedAt ?? null,
    reproducibilityVerification,
    reproducibilityLedgerSha256: ledgerSha256,
    artifactSet:
      "Every file beneath .artifacts/anduril-class-crisis-os except this seal, plus the complete release manifest/source/statement bundle and final report.",
    artifacts: artifactHashes,
  };
  const validation = validateFinalArtifactSeal(sealDraft, validationOptions);
  const violations = [...preconditionViolations, ...validation.violations];
  const verification = {
    ...validation,
    state: violations.length ? "FAIL" : "PASS",
    violations,
  };
  const seal = { ...sealDraft, state: verification.state, verification };
  if (verification.state === "PASS") await writeFile(context.finalSealPath, `${JSON.stringify(seal, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ state: verification.state, seal: path.relative(context.root, context.finalSealPath), verification }, null, 2)}\n`);
  if (verification.state !== "PASS") process.exitCode = 1;
}
