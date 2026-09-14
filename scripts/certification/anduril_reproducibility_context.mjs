import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { releaseIdentityFromEntries, sameReleaseSource, sourceState } from "../release/build_release_manifest.mjs";
import { verifyReleaseBundle } from "../release/release_statement.mjs";
import { REPRODUCIBILITY_STABLE_ARTIFACT_PATHS, sameIdentity } from "./anduril_integrity.mjs";

export const createReproducibilityContext = async () => {
  const root = process.cwd();
  const evidenceRoot = path.join(root, ".artifacts/anduril-class-crisis-os/release");
  const context = {
    root,
    evidenceRoot,
    manifestPath: path.join(root, "data/validation/release/current-release-manifest.json"),
    releaseSourcePath: path.join(root, "data/validation/release/release-source-manifest.json"),
    releaseStatementPath: path.join(root, "data/validation/release/release-statement.json"),
    ledgerPath: path.join(evidenceRoot, "reproducibility-ledger.json"),
    finalSealPath: path.join(evidenceRoot, "final-artifact-seal.json"),
    reportPath: path.join(root, "docs/handoffs/VIGIA_ANDURIL_CLASS_CRISIS_OS_MEGA_PATCH_REPORT.md"),
    apiOrigin: process.env.VIGIA_API_ORIGIN ?? "http://127.0.0.1:4177",
    operatorOrigin: process.env.VIGIA_OPERATOR_ORIGIN ?? "http://127.0.0.1:4190",
  };
  await mkdir(evidenceRoot, { recursive: true });
  return context;
};

export const readJson = async (target, fallback = null) => {
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch {
    return fallback;
  }
};
export const sha256 = async (target) =>
  `sha256:${createHash("sha256")
    .update(await readFile(target))
    .digest("hex")}`;
export const fileEvidence = async (context, target) => {
  try {
    return {
      path: path.relative(context.root, target),
      sha256: await sha256(target),
    };
  } catch {
    return { path: path.relative(context.root, target), sha256: null };
  }
};
const recursiveFiles = async (directory) => {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await recursiveFiles(target)));
    else if (entry.isFile()) output.push(target);
  }
  return output;
};
export const collectFinalArtifactHashes = async (context) => {
  const generatedEvidence = await recursiveFiles(path.join(context.root, ".artifacts/anduril-class-crisis-os"));
  const targets = [
    ...new Set(
      [
        context.manifestPath,
        context.releaseSourcePath,
        context.releaseStatementPath,
        context.reportPath,
        ...generatedEvidence.filter((target) => path.resolve(target) !== path.resolve(context.finalSealPath)),
      ].map((target) => path.resolve(target)),
    ),
  ].sort();
  return Promise.all(targets.map((target) => fileEvidence(context, target)));
};
export const sequenceFilesystemVerification = async (context, identity, ledger, verification) => {
  const observations = Array.isArray(ledger?.observations) ? ledger.observations : [];
  const finalObservation = observations.filter((item) => item?.label === "COLD_START_2" && sameIdentity(item?.manifestIdentity, identity)).at(-1) ?? null;
  const expected = new Map((Array.isArray(finalObservation?.artifactHashes) ? finalObservation.artifactHashes : []).map((item) => [item?.path, item?.sha256]));
  const current = await Promise.all(REPRODUCIBILITY_STABLE_ARTIFACT_PATHS.map((relative) => fileEvidence(context, path.join(context.root, relative))));
  const violations = [...(verification?.violations ?? [])];
  for (const item of current) {
    if (!expected.get(item.path))
      violations.push({
        code: "REPRODUCIBILITY_FILESYSTEM_BASELINE_MISSING",
        path: item.path,
      });
    else if (!item.sha256)
      violations.push({
        code: "REPRODUCIBILITY_FILESYSTEM_ARTIFACT_MISSING",
        path: item.path,
      });
    else if (item.sha256 !== expected.get(item.path))
      violations.push({
        code: "REPRODUCIBILITY_FILESYSTEM_ARTIFACT_CHANGED",
        path: item.path,
        expected: expected.get(item.path),
        actual: item.sha256,
      });
  }
  return {
    ...verification,
    state: violations.length ? "FAIL" : "PASS",
    filesystemComparedTo: finalObservation?.capturedAt ?? null,
    filesystemArtifacts: current,
    violations,
  };
};
export const coreArtifactIdentityViolations = async (context, identity) => {
  const violations = [];
  const targets = [
    context.manifestPath,
    path.join(context.root, ".artifacts/anduril-class-crisis-os/certification.json"),
    path.join(context.root, ".artifacts/anduril-class-crisis-os/release/reproducibility-verification.json"),
    path.join(context.root, ".artifacts/anduril-class-crisis-os/release/invariant-report.json"),
    path.join(context.root, ".artifacts/anduril-class-crisis-os/browser/evidence-index.json"),
    path.join(context.root, ".artifacts/anduril-class-crisis-os/performance/api-useful-content.json"),
  ];
  for (const target of targets) {
    const document = await readJson(target);
    if (!document)
      violations.push({
        code: "FINAL_ARTIFACT_CORE_JSON_UNAVAILABLE",
        path: path.relative(context.root, target),
      });
    else if (!sameIdentity(document, identity))
      violations.push({
        code: "FINAL_ARTIFACT_CORE_JSON_IDENTITY_MISMATCH",
        path: path.relative(context.root, target),
      });
  }
  let report = null;
  try {
    report = await readFile(context.reportPath, "utf8");
  } catch {}
  if (!report)
    violations.push({
      code: "FINAL_ARTIFACT_REPORT_UNAVAILABLE",
      path: path.relative(context.root, context.reportPath),
    });
  else
    for (const [field, value] of Object.entries(identity))
      if (!report.includes(String(value)))
        violations.push({
          code: "FINAL_ARTIFACT_REPORT_IDENTITY_MISSING",
          path: path.relative(context.root, context.reportPath),
          field,
        });
  return violations;
};
export const verifyCurrentSourceState = async (context, manifest, identity) => {
  const violations = [];
  const [releaseSource, statement] = await Promise.all([readJson(context.releaseSourcePath), readJson(context.releaseStatementPath)]);
  const current = await sourceState(),
    derived = releaseIdentityFromEntries(current.entries);
  const currentIdentity = Object.fromEntries(["releaseId", "codeStateHash", "operationalDataHash"].map((field) => [field, derived[field]]));
  let bundle = null;
  try {
    bundle = verifyReleaseBundle({ releaseSource, manifest, statement });
  } catch (error) {
    violations.push({
      code: "FINAL_ARTIFACT_RELEASE_BUNDLE_INVALID",
      error: String(error?.message ?? error),
    });
  }
  if (!["releaseId", "codeStateHash", "operationalDataHash"].every((field) => currentIdentity[field] === identity[field]))
    violations.push({
      code: "FINAL_ARTIFACT_CURRENT_SOURCE_IDENTITY_MISMATCH",
      expected: identity,
      actual: currentIdentity,
    });
  if (
    !sameReleaseSource(releaseSource, {
      ...current,
      releaseId: currentIdentity.releaseId,
    })
  )
    violations.push({ code: "FINAL_ARTIFACT_FROZEN_SOURCE_CHANGED" });
  if (bundle && !sameIdentity(bundle, identity))
    violations.push({
      code: "FINAL_ARTIFACT_RELEASE_BUNDLE_IDENTITY_MISMATCH",
      expected: identity,
      actual: bundle,
    });
  return {
    schemaVersion: "vigia.anduril-final-source-state-verification.v1",
    state: violations.length ? "FAIL" : "PASS",
    ...identity,
    currentSourceIdentity: currentIdentity,
    frozenEntryCount: Array.isArray(releaseSource?.entries) ? releaseSource.entries.length : null,
    currentEntryCount: current.entries.length,
    releaseSourceManifestSha256: await sha256(context.releaseSourcePath).catch(() => null),
    releaseStatementSha256: await sha256(context.releaseStatementPath).catch(() => null),
    violations,
  };
};
export const statusComponents = (output) =>
  Object.fromEntries(
    ["Database", "Central API", "FieldNet", "Operator"].map((name) => {
      const match = String(output).match(new RegExp(`^${name.replace(" ", "\\s+")}\\s+(READY|FAILED|DEGRADED|STARTING|STOPPED|NOT_READY)\\s*$`, "m"));
      return [name, match?.[1] ?? "MISSING"];
    }),
  );
