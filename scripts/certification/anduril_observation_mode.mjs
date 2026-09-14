import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { probeCanonicalRuntimeIdentity, releaseIdentityOf } from "../release/runtime_identity_binding.mjs";
import { REPRODUCIBILITY_LABELS, REPRODUCIBILITY_STABLE_ARTIFACT_PATHS, sameIdentity, validateReproducibilityLedger } from "./anduril_integrity.mjs";
import { fileEvidence, readJson, sha256, statusComponents } from "./anduril_reproducibility_context.mjs";

export async function runObservationMode({ context, manifest, identity, label }) {
  if (!REPRODUCIBILITY_LABELS.includes(label)) throw new Error(`reproducibility_label_required:${REPRODUCIBILITY_LABELS.join(",")}`);
  const localStatus = spawnSync(process.execPath, ["scripts/local_runtime.mjs", "status"], { cwd: context.root, encoding: "utf8", maxBuffer: 2_000_000 });
  const statusText = `${localStatus.stdout ?? ""}${localStatus.stderr ?? ""}`;
  const components = statusComponents(statusText);
  let runtimeProof = null,
    runtimeError = null;
  try {
    runtimeProof = await probeCanonicalRuntimeIdentity({
      manifest,
      apiOrigin: context.apiOrigin,
      operatorOrigin: context.operatorOrigin,
    });
  } catch (error) {
    runtimeError = String(error?.message ?? error);
  }
  const certificationPath = path.join(context.root, ".artifacts/anduril-class-crisis-os/certification.json");
  const certification = await readJson(certificationPath);
  const descriptors = Object.fromEntries(
    await Promise.all(
      ["api", "fieldnet", "operator"].map(async (component) => [component, await readJson(path.join(context.root, `.tmp/runtime/${component}.process.json`))]),
    ),
  );
  const prior = await readJson(context.ledgerPath);
  const observations = sameIdentity(prior, identity) && Array.isArray(prior?.observations) ? prior.observations : [];
  const failedGates = Array.isArray(certification?.failedGates) ? certification.failedGates.map((item) => item?.name).filter(Boolean) : [];
  const provisional = certification?.state === "FAIL" && failedGates.length === 1 && failedGates[0] === "releaseReproducibility";
  const runtimeIdentity = runtimeProof?.identity ?? null;
  const processStartedAt = {
    api: descriptors.api?.startedAt ?? runtimeProof?.api?.process?.startedAt ?? null,
    fieldnet: descriptors.fieldnet?.startedAt ?? runtimeProof?.fieldnet?.process?.startedAt ?? null,
    operator: descriptors.operator?.startedAt ?? null,
  };
  const coreReady =
    runtimeProof !== null &&
    sameIdentity(runtimeIdentity, identity) &&
    runtimeProof?.fieldnetReadiness?.ready === true &&
    Object.values(components).every((state) => state === "READY") &&
    Object.values(processStartedAt).every((value) => Number.isFinite(Date.parse(value ?? "")));
  const labelReady = label !== "CERTIFY_R" || ((certification?.state === "PASS" || provisional) && sameIdentity(certification, identity));
  const labelIndex = REPRODUCIBILITY_LABELS.indexOf(label);
  const priorByLabel = Object.fromEntries(
    REPRODUCIBILITY_LABELS.slice(0, labelIndex).map((required) => [
      required,
      observations.filter((item) => item.label === required && item.state === "PASS" && sameIdentity(item.manifestIdentity, identity)).at(-1) ?? null,
    ]),
  );
  const priorSequenceReady = Object.values(priorByLabel).every(Boolean);
  const beforeRestart = label === "COLD_START_1" ? priorByLabel.REBUILD_MANIFEST : label === "COLD_START_2" ? priorByLabel.COLD_START_1 : null;
  const restartProven =
    !beforeRestart ||
    ["api", "fieldnet", "operator"].every((component) => {
      const before = beforeRestart.processStartedAt?.[component],
        after = processStartedAt[component];
      return Number.isFinite(Date.parse(before ?? "")) && Number.isFinite(Date.parse(after ?? "")) && Date.parse(after) > Date.parse(before);
    });
  const artifactHashes = await Promise.all(
    [
      context.manifestPath,
      certificationPath,
      context.reportPath,
      path.join(context.root, ".artifacts/anduril-class-crisis-os/browser/evidence-index.json"),
      path.join(context.root, ".artifacts/anduril-class-crisis-os/performance/api-useful-content.json"),
    ].map((target) => fileEvidence(context, target)),
  );
  const certifyArtifacts = priorByLabel.CERTIFY_R?.artifactHashes ?? (label === "CERTIFY_R" ? artifactHashes : []);
  const certifyByPath = new Map(certifyArtifacts.map((item) => [item?.path, item?.sha256]));
  const currentByPath = new Map(artifactHashes.map((item) => [item?.path, item?.sha256]));
  const artifactContinuityProven =
    label === "BUILD_R" ||
    REPRODUCIBILITY_STABLE_ARTIFACT_PATHS.every(
      (relative) => Boolean(certifyByPath.get(relative)) && currentByPath.get(relative) === certifyByPath.get(relative),
    );
  const observation = {
    schemaVersion: "vigia.anduril-release-reproducibility-observation.v1",
    label,
    capturedAt: new Date().toISOString(),
    state: coreReady && labelReady && priorSequenceReady && restartProven && artifactContinuityProven ? "PASS" : "FAIL",
    manifestIdentity: identity,
    manifestSha256: await sha256(context.manifestPath),
    runtimeIdentity,
    runtimeIdentityError: runtimeError,
    components,
    localStatusExitCode: localStatus.status,
    localStatus: statusText,
    fieldnetReady: runtimeProof?.fieldnetReadiness?.ready === true,
    sequence: {
      priorLabelsRequired: REPRODUCIBILITY_LABELS.slice(0, labelIndex),
      priorLabelsPresent: Object.fromEntries(Object.entries(priorByLabel).map(([required, value]) => [required, Boolean(value)])),
      priorSequenceReady,
      restartProven,
      artifactContinuityProven,
    },
    processStartedAt,
    processDescriptors: descriptors,
    certification: certification
      ? {
          state: certification.state,
          identity: releaseIdentityOf(certification),
          provisionalCertificationAccepted: provisional,
          failedGates,
          sha256: await sha256(certificationPath),
        }
      : null,
    artifactHashes,
  };
  const ledger = {
    schemaVersion: "vigia.anduril-release-reproducibility-ledger.v1",
    generatedAt: observation.capturedAt,
    ...identity,
    requiredSequence: REPRODUCIBILITY_LABELS,
    observations: [...observations, observation],
  };
  ledger.verification = validateReproducibilityLedger(ledger, identity);
  await writeFile(context.ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ observation, ledger: path.relative(context.root, context.ledgerPath), verification: ledger.verification }, null, 2)}\n`,
  );
  if (observation.state !== "PASS") process.exitCode = 1;
}
