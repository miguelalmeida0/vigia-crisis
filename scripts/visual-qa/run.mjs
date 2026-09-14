import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { get as httpGet } from "node:http";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_OPERATOR_RUNTIME_FILES, classifyReleasePath, operatorSourceHashFromEntries } from "../release/build_release_manifest.mjs";
import { probeCanonicalRuntimeIdentity } from "../release/runtime_identity_binding.mjs";
import { parseCanonicalRuntimeStatus, validateCanonicalVqaPreflight } from "./certification_preflight.mjs";

import { canonicalRuntime, command, currentOperatorSourceHash, dockerReady, freePort, root, sourceDigest } from "./runner_runtime.mjs";
import { runDocker } from "./runner_docker.mjs";

const lane = process.argv[2] ?? "all";
if (!["all", "golden", "canonical"].includes(lane)) throw new Error(`visual_qa_lane_invalid:${lane}`);
const focusedRoute = String(process.env.VIGIA_VQA_ROUTE ?? "").trim();
const requestedExecution = String(process.env.VIGIA_VQA_EXECUTION ?? "auto").trim();
if (!["auto", "docker", "local"].includes(requestedExecution)) throw new Error(`visual_qa_execution_invalid:${requestedExecution}`);

const output = path.join(root, ".artifacts", "deterministic-visual-qa");
const worldBrowserOutput = path.join(root, ".artifacts", "world-leader-gap-closure", "browser");
const andurilBrowserOutput = path.join(root, ".artifacts", "anduril-class-crisis-os", "browser");
const contractDirectory = path.join(root, "data", "validation", "frontend-visual-contract");
const contract = path.join(contractDirectory, "vigia-visual-contract.json");
mkdirSync(output, { recursive: true });
mkdirSync(worldBrowserOutput, { recursive: true });
mkdirSync(andurilBrowserOutput, { recursive: true });
mkdirSync(contractDirectory, { recursive: true });

function prepareLaneOutput(selected) {
  const directory = path.join(output, selected);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  return directory;
}

function blockedCanonical(reason, details = {}) {
  const directory = prepareLaneOutput("canonical");
  const summary = {
    schemaVersion: "vigia.final-white-visual-qa.v1",
    lane: "canonical",
    generatedAt: new Date().toISOString(),
    pass: false,
    fatal: { type: "ENVIRONMENT_BLOCKED", message: reason },
    environment: {
      execution: "local",
      canonicalTruthSubstituted: false,
      ...details,
    },
    routes: {},
    responsiveMatrix: [],
    requiredArtifactsFresh: false,
    missingArtifactSets: [
      "01-command-overview",
      "02-incidents",
      "03-incident-detail",
      "04-intelligence",
      "05-operations",
      "06-reports-analytics",
      "07-global-awareness",
    ],
    gates: {
      freshRuntimeScreenshots: false,
      sevenPrimaryRoutes: false,
      noRouteNumbers: false,
      removedPrimaryRoutesAbsent: false,
      horizontalOverflow: false,
      semantics: false,
      interactions: false,
      pageErrors: false,
      unexpectedHttpFailures: false,
      canonicalRuntime: false,
    },
  };
  writeFileSync(path.join(directory, "visual-qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return { lane: "canonical", status: 2, blocked: true, reason };
}

function localDependencyEnvironment() {
  const python = String(process.env.VIGIA_VQA_PYTHON ?? path.join(root, ".venv", "bin", "python")).trim();
  const bundledPython = String(
    process.env.VIGIA_WORKSPACE_PYTHON_PACKAGES ??
      path.join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "lib", "python3.12", "site-packages"),
  ).trim();
  const nodeModules = String(
    process.env.VIGIA_VQA_NODE_MODULES ?? path.join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules"),
  ).trim();
  const pythonPath = [bundledPython, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
  const check = command(python, ["-c", "import numpy, PIL, playwright"], {
    capture: true,
    allowFailure: true,
    env: { PYTHONPATH: pythonPath },
  });
  if (check.status !== 0) throw new Error(`visual_qa_local_python_dependencies_missing:${check.output.trim()}`);
  for (const name of ["pixelmatch", "pngjs"])
    if (
      !statSync(path.join(nodeModules, name), {
        throwIfNoEntry: false,
      })?.isDirectory()
    )
      throw new Error(`visual_qa_local_node_dependency_missing:${name}`);
  const cdpUrl = String(process.env.VIGIA_VQA_CDP_URL ?? "").trim();
  const browserExecutable = String(process.env.VIGIA_VQA_BROWSER_EXECUTABLE ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome").trim();
  if (!cdpUrl && !statSync(browserExecutable, { throwIfNoEntry: false })?.isFile()) throw new Error("visual_qa_local_browser_executable_missing");
  return { python, pythonPath, nodeModules, browserExecutable, cdpUrl };
}

async function runLocalGolden() {
  prepareLaneOutput("golden");
  const dependencies = localDependencyEnvironment(),
    proxyPort = await freePort(),
    releaseId = `vigia-golden-source-${sourceDigest().slice(0, 16)}`,
    localTemp = path.join(root, ".tmp", "visual-qa", "playwright");
  mkdirSync(localTemp, { recursive: true });
  const env = {
    TMPDIR: localTemp,
    PYTHONPATH: dependencies.pythonPath,
    VIGIA_VQA_ROOT: root,
    VIGIA_VQA_OUTPUT: output,
    VIGIA_VQA_CONTRACT: contract,
    VIGIA_VQA_TOOL_ROOT: path.join(root, "scripts", "visual-qa"),
    VIGIA_VQA_REUSE_CONTRACT: "1",
    VIGIA_VQA_SOURCE_SERVE: "1",
    VIGIA_VQA_OPERATOR_PORT: "1",
    VIGIA_VQA_PROXY_PORT: String(proxyPort),
    VIGIA_VQA_UPSTREAM_HOST: "127.0.0.1",
    VIGIA_VQA_RELEASE_ID: releaseId,
    VIGIA_VQA_NODE_MODULES: dependencies.nodeModules,
    VIGIA_VQA_BROWSER_EXECUTABLE: dependencies.browserExecutable,
    ...(dependencies.cdpUrl ? { VIGIA_VQA_CDP_URL: dependencies.cdpUrl } : {}),
    ...(focusedRoute ? { VIGIA_VQA_ROUTE: focusedRoute } : {}),
  };
  const result = command(dependencies.python, [path.join(root, "scripts", "visual-qa", "capture.py"), "--lane", "golden"], { env, allowFailure: true });
  return { lane: "golden", status: result.status ?? 1, releaseId };
}

async function runLocalCanonical(runtime) {
  const expectedSourceHash = currentOperatorSourceHash();
  if (runtime.sourceHash !== expectedSourceHash)
    return blockedCanonical("canonical_runtime_source_mismatch", {
      releaseId: runtime.releaseId ?? null,
      runtimeSourceHash: runtime.sourceHash ?? null,
      expectedSourceHash,
      assetDigest: runtime.assetDigest ?? null,
    });
  prepareLaneOutput("canonical");
  const dependencies = localDependencyEnvironment(),
    proxyPort = await freePort(),
    localTemp = path.join(root, ".tmp", "visual-qa", "playwright");
  mkdirSync(localTemp, { recursive: true });
  const env = {
    TMPDIR: localTemp,
    PYTHONPATH: dependencies.pythonPath,
    VIGIA_VQA_ROOT: root,
    VIGIA_VQA_OUTPUT: output,
    VIGIA_FINAL_WHITE_OUTPUT: path.join(output, "canonical"),
    VIGIA_EXECUTIVE_CONTRACT: path.join(contractDirectory, "executive-ux"),
    VIGIA_VQA_CONTRACT: contract,
    VIGIA_VQA_TOOL_ROOT: path.join(root, "scripts", "visual-qa"),
    VIGIA_VQA_REUSE_CONTRACT: "1",
    VIGIA_VQA_OPERATOR_PORT: String(runtime.port),
    VIGIA_VQA_PROXY_PORT: String(proxyPort),
    VIGIA_VQA_UPSTREAM_HOST: "127.0.0.1",
    VIGIA_VQA_RELEASE_ID: String(runtime.releaseId ?? ""),
    VIGIA_VQA_FIELDNET_ORIGIN: runtime.fieldOrigin,
    VIGIA_VQA_NODE_MODULES: dependencies.nodeModules,
    VIGIA_VQA_BROWSER_EXECUTABLE: dependencies.browserExecutable,
    ...(dependencies.cdpUrl ? { VIGIA_VQA_CDP_URL: dependencies.cdpUrl } : {}),
    ...(focusedRoute ? { VIGIA_VQA_ROUTE: focusedRoute } : {}),
  };
  const result = command(dependencies.python, [path.join(root, "scripts", "visual-qa", "final_white_capture.py")], { env, allowFailure: true });
  return {
    lane: "canonical",
    status: result.status ?? 1,
    releaseId: runtime.releaseId,
  };
}

const selectedLanes = lane === "all" ? ["golden", "canonical"] : [lane];
const execution = requestedExecution === "auto" ? (dockerReady() ? "docker" : "local") : requestedExecution;
let results = [];
if (execution === "docker") {
  if (!dockerReady()) throw new Error("visual_qa_docker_daemon_unavailable");
  results = await runDocker(selectedLanes, { andurilBrowserOutput, blockedCanonical, contractDirectory, focusedRoute, output, prepareLaneOutput, worldBrowserOutput });
} else {
  for (const selected of selectedLanes) {
    if (selected === "golden") results.push(await runLocalGolden());
    else {
      const runtime = await canonicalRuntime({ allowStart: false });
      results.push(runtime.blocked ? blockedCanonical(runtime.reason, { status: runtime.status }) : await runLocalCanonical(runtime));
    }
  }
}
const failures = results.filter((item) => item.status !== 0);
if (failures.length) {
  const description = failures.map((item) => `${item.lane}:${item.blocked ? "blocked" : item.status}:${item.reason ?? "gates-failed"}`).join(",");
  throw new Error(`visual_qa_lanes_failed:${description}`);
}
