import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { bindReleaseIdentity, releaseIdentityOf } from "../release/runtime_identity_binding.mjs";

export async function createCertificationContext() {
  const root = process.cwd();
  const artifactRoot = path.join(root, ".artifacts/anduril-class-crisis-os");
  const reportPath = path.join(root, "docs/handoffs/VIGIA_ANDURIL_CLASS_CRISIS_OS_MEGA_PATCH_REPORT.md");
  const apiOrigin = process.env.VIGIA_API_ORIGIN ?? "http://127.0.0.1:4177";
  const operatorOrigin = process.env.VIGIA_OPERATOR_ORIGIN ?? "http://127.0.0.1:4190";
  const rows = (value) => (Array.isArray(value) ? value : []);
  const section = (payload, key) => payload?.data?.[key]?.value ?? null;
  const sectionState = (payload, key) => payload?.data?.[key]?.state ?? "MISSING";
  const iso = (value) => (Number.isFinite(Date.parse(value ?? "")) ? new Date(value).toISOString() : null);
  const percentile = (values, fraction) => {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    return sorted.length ? Number(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))].toFixed(2)) : null;
  };
  const variance = (values) => {
    const valid = values.filter(Number.isFinite);
    if (!valid.length) return null;
    const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length;
    return Number((valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / valid.length).toFixed(2));
  };
  const status = (passed, evidence, details = null) => ({
    state: passed ? "PASS" : "FAIL",
    evidence,
    details,
  });
  const notRun = (evidence) => ({ state: "NOT_RUN", evidence, details: null });
  const readJson = async (target, fallback = null) => {
    try {
      return JSON.parse(await readFile(target, "utf8"));
    } catch {
      return fallback;
    }
  };
  const objectRows = (value, output = [], depth = 0) => {
    if (depth > 14 || !value || typeof value !== "object") return output;
    output.push(value);
    if (Array.isArray(value)) value.forEach((item) => objectRows(item, output, depth + 1));
    else Object.values(value).forEach((item) => objectRows(item, output, depth + 1));
    return output;
  };
  const withheldState = (value) =>
    /^(?:NO_|WITHHELD|UNAVAILABLE|INSUFFICIENT|UNKNOWN|BLOCKED|INCOMPLETE|REQUIRED|INVALID|NOT_APPLICABLE)/.test(String(value?.state ?? "").toUpperCase());
  const withheldLifecycleComplete = (value) =>
    !withheldState(value) ||
    Boolean(
      String(value?.reason ?? "").trim() &&
        (String(value?.unlockCondition ?? "").trim() || rows(value?.requiredInputs).length || String(value?.terminalReason ?? "").trim()),
    );
  const numberAt = (...values) => values.map(Number).find(Number.isFinite) ?? null;
  const usefulApiSample = (value) => Number(value?.status) >= 200 && Number(value?.status) < 300 && Number(value?.bytes) > 2;
  const manifestPath = path.join(root, "data/validation/release/current-release-manifest.json");
  const manifest = await readJson(manifestPath);
  if (!manifest) throw new Error("current_release_manifest_unavailable");
  const identity = releaseIdentityOf(manifest);
  const writeJson = async (relative, value) => {
    const target = path.join(artifactRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(bindReleaseIdentity(value, identity), null, 2)}\n`);
    return target;
  };
  const writeText = async (relative, value) => {
    const target = path.join(artifactRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, String(value));
    return target;
  };
  const sha256File = async (target) =>
    `sha256:${createHash("sha256")
      .update(await readFile(target))
      .digest("hex")}`;
  const repositoryEvidencePath = (value) => {
    if (typeof value !== "string" || !value.trim()) throw new Error("evidence_path_missing");
    const target = path.resolve(root, value);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`evidence_path_outside_repository:${value}`);
    return target;
  };
  const recursiveFiles = async (directory) => {
    const output = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) output.push(...(await recursiveFiles(target)));
      else if (entry.isFile()) output.push(target);
    }
    return output.sort();
  };
  const copyEvidenceFile = async ({ source, destination, category, capturedAt = null }) => {
    const sourcePath = repositoryEvidencePath(source);
    const destinationPath = repositoryEvidencePath(destination);
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) throw new Error(`evidence_source_not_file:${source}`);
    if (["SEVEN_ROUTE_SCREENSHOT", "RESPONSIVE_SCREENSHOT", "INTERACTION_EVIDENCE"].includes(category)) {
      const signature = (await readFile(sourcePath)).subarray(0, 8).toString("hex");
      if (signature !== "89504e470d0a1a0a") throw new Error(`evidence_png_signature_invalid:${source}`);
    }
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    const [sourceHash, copiedHash, copiedStat] = await Promise.all([sha256File(sourcePath), sha256File(destinationPath), stat(destinationPath)]);
    const capturedAtMs = Date.parse(capturedAt ?? "");
    const fresh = !Number.isFinite(capturedAtMs) || sourceStat.mtimeMs >= capturedAtMs - 10_000;
    return {
      category,
      source: path.relative(root, sourcePath),
      path: path.relative(root, destinationPath),
      sha256: copiedHash,
      sourceSha256: sourceHash,
      bytes: copiedStat.size,
      sourceModifiedAt: sourceStat.mtime.toISOString(),
      fresh,
      hashMatchesSource: sourceHash === copiedHash,
    };
  };
  for (const directory of [
    "baseline",
    "autopilot",
    "collection",
    "twin",
    "decisions",
    "fieldnet",
    "exposure",
    "operations",
    "protection",
    "outcomes",
    "prevention",
    "browser",
    "performance",
    "release",
  ]) {
    await mkdir(path.join(artifactRoot, directory), { recursive: true });
  }
  await mkdir(path.join(root, ".tmp/test"), { recursive: true });
  return {
    root,
    artifactRoot,
    reportPath,
    apiOrigin,
    operatorOrigin,
    rows,
    section,
    sectionState,
    iso,
    percentile,
    variance,
    status,
    notRun,
    readJson,
    objectRows,
    withheldState,
    withheldLifecycleComplete,
    numberAt,
    usefulApiSample,
    manifestPath,
    manifest,
    identity,
    writeJson,
    writeText,
    sha256File,
    repositoryEvidencePath,
    recursiveFiles,
    copyEvidenceFile,
  };
}
