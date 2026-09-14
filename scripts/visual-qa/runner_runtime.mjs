import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { get as httpGet } from "node:http";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_OPERATOR_RUNTIME_FILES, classifyReleasePath, operatorSourceHashFromEntries } from "../release/build_release_manifest.mjs";
import { probeCanonicalRuntimeIdentity } from "../release/runtime_identity_binding.mjs";
import { parseCanonicalRuntimeStatus, validateCanonicalVqaPreflight } from "./certification_preflight.mjs";
import { assertVisualReferences } from "./runner_visual_references.mjs";
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
assertVisualReferences(root);
export function command(program, args, { capture = false, env = {}, allowFailure = false, cwd = root } = {}) {
  const processEnvironment = { ...process.env, ...env };
  if (capture) {
    try {
      return {
        status: 0,
        output: execFileSync(program, args, {
          cwd,
          env: processEnvironment,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 64 * 1024 * 1024,
        }),
      };
    } catch (error) {
      if (!allowFailure) throw error;
      return {
        status: error.status ?? 1,
        output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      };
    }
  }
  const result = spawnSync(program, args, {
    cwd,
    stdio: "inherit",
    env: processEnvironment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(`${program}_failed:${result.status}`);
  return result;
}
export function dockerReady() {
  return (
    command("docker", ["version", "--format", "{{.Server.Version}}"], {
      capture: true,
      allowFailure: true,
    }).status === 0
  );
}
export function sourceDigest() {
  const paths = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "dist") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && !entry.isSymbolicLink()) paths.push(absolute);
    }
  }
  for (const name of ["src", "styles", "assets"]) walk(path.join(root, "apps/operator-console", name));
  paths.push(path.join(root, "apps/operator-console/index.html"));
  const hash = createHash("sha256");
  for (const file of paths.sort()) hash.update(path.relative(root, file)).update("\0").update(readFileSync(file)).update("\0");
  return hash.digest("hex");
}
export function currentOperatorSourceHash() {
  const entries = [];
  function addFile(absolute) {
    const metadata = lstatSync(absolute);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`visual_qa_operator_source_invalid:${path.relative(root, absolute)}`);
    const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
    entries.push({
      path: relative,
      mode: metadata.mode & 0o111 ? "0755" : "0644",
      sha256: `sha256:${createHash("sha256").update(readFileSync(absolute)).digest("hex")}`,
    });
  }
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "dist") continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
      if (classifyReleasePath(relative) === "RUNTIME CACHE") continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        if (["SOURCE — release code", "TEST"].includes(classifyReleasePath(relative))) addFile(absolute);
      } else if (entry.isSymbolicLink()) throw new Error(`visual_qa_operator_source_symlink:${path.relative(root, absolute)}`);
    }
  }
  walk(path.join(root, "apps", "operator-console"));
  for (const relative of CANONICAL_OPERATOR_RUNTIME_FILES) addFile(path.join(root, relative));
  return operatorSourceHashFromEntries(entries);
}
export async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}
async function operatorReadyIdentity(origin) {
  const target = new URL("/__operator/ready", origin);
  return new Promise((resolve, reject) => {
    const request = httpGet(target, { headers: { accept: "application/json" } }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) request.destroy(new Error("visual_qa_operator_identity_too_large"));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          resolve({
            ok: Number(response.statusCode) >= 200 && Number(response.statusCode) < 300,
            identity: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error("visual_qa_operator_identity_timeout")));
    request.once("error", reject);
  });
}

async function explicitRuntime() {
  const supplied = String(process.env.VIGIA_VQA_OPERATOR_ORIGIN ?? "").trim();
  if (!supplied) return null;
  const origin = new URL(supplied);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password || origin.search || origin.hash)
    throw new Error("visual_qa_operator_origin_invalid");
  const { ok, identity } = await operatorReadyIdentity(origin.origin);
  if (!ok || identity?.ok !== true || identity?.frontend !== "operator-console") throw new Error("visual_qa_operator_identity_invalid");
  return {
    origin: origin.origin,
    port: Number(origin.port),
    releaseId: identity.releaseId,
    sourceHash: identity.sourceHash,
    assetDigest: identity.assetDigest,
  };
}

export async function canonicalRuntime({ allowStart = false } = {}) {
  const explicit = await explicitRuntime();
  let status = command("npm", ["run", "local:status", "--silent"], {
    capture: true,
    allowFailure: true,
  });
  const allReady = () => Object.values(parseCanonicalRuntimeStatus(status.output)).every((state) => state === "READY") && status.status === 0;
  if (allowStart && !allReady()) {
    command("npm", ["run", "local:up", "--silent"], { allowFailure: true });
    status = command("npm", ["run", "local:status", "--silent"], {
      capture: true,
      allowFailure: true,
    });
  }
  if (!allReady())
    return {
      blocked: true,
      reason: "canonical_runtime_not_ready",
      status: status.output.trim(),
      components: parseCanonicalRuntimeStatus(status.output),
    };
  const pointer = explicit
    ? {
        origin: explicit.origin,
        port: explicit.port,
        releaseId: explicit.releaseId,
      }
    : JSON.parse(readFileSync(path.join(root, ".tmp", "operator-console-current.json"), "utf8"));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(pointer.origin) || !Number.isInteger(pointer.port)) throw new Error("visual_qa_runtime_pointer_invalid");
  const manifest = JSON.parse(readFileSync(path.join(root, "data/validation/release/current-release-manifest.json"), "utf8"));
  let runtimeProof;
  try {
    const fieldOrigin = process.env.VIGIA_FIELDNET_ORIGIN ?? "http://127.0.0.1:4188";
    runtimeProof = await probeCanonicalRuntimeIdentity({
      manifest,
      apiOrigin: process.env.VIGIA_API_ORIGIN ?? "http://127.0.0.1:4177",
      fieldOrigin,
      operatorOrigin: pointer.origin,
    });
  } catch (error) {
    return {
      blocked: true,
      reason: "canonical_runtime_identity_or_readiness_invalid",
      status: status.output.trim(),
      error: String(error?.message ?? error),
    };
  }
  const verification = validateCanonicalVqaPreflight({
    statusOutput: status.output,
    statusExitCode: status.status,
    manifest,
    runtimeProof,
    pointer,
  });
  if (verification.state !== "PASS")
    return {
      blocked: true,
      reason: "canonical_runtime_preflight_failed",
      status: status.output.trim(),
      verification,
    };
  return {
    origin: pointer.origin,
    port: pointer.port,
    fieldOrigin: process.env.VIGIA_FIELDNET_ORIGIN ?? "http://127.0.0.1:4188",
    ...runtimeProof.identity,
    sourceHash: runtimeProof.operator?.sourceHash,
    assetDigest: runtimeProof.operator?.assetDigest,
    preflight: verification,
  };
}
