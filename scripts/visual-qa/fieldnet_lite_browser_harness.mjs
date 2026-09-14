import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFieldIncidentPackage } from "../../packages/domain/src/fieldnet/contracts.mjs";
import { signFieldRequest } from "../../packages/domain/src/fieldnet/request-auth.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverEntry = path.join(root, "apps/field-node/src/server.mjs");
const launcherEntry = path.join(root, "apps/field-node/src/lite-launcher.mjs");
const incidentId = "incident:isolated-fieldnet-lite-browser-vqa";
const deviceId = "device:isolated-fieldnet-lite-browser-vqa";
const key = randomBytes(32).toString("base64url");
const directory = await mkdtemp(path.join(tmpdir(), "vigia-fieldnet-lite-vqa-"));
const socketPath = path.join(directory, "control.sock");
const children = [];
let sequence = 0;

function waitEvent(child, name) {
  return new Promise((resolve, reject) => {
    let output = "";
    let errors = "";
    const timeout = setTimeout(() => reject(new Error(`${name}_timeout:${errors.slice(0, 500)}`)), 15_000);
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.once("exit", (code) => reject(new Error(`${name}_early_exit:${code}:${errors.slice(0, 500)}`)));
    child.stdout.on("data", (chunk) => {
      output += chunk;
      for (const line of output.split("\n")) {
        try {
          const event = JSON.parse(line);
          if (event.event !== name) continue;
          clearTimeout(timeout);
          resolve(event);
          return;
        } catch {}
      }
    });
  });
}

function signedRequest({ method = "GET", pathname, body = null }) {
  const payload = body === null ? "" : JSON.stringify(body);
  const headers = {
    host: "fieldnode.local",
    ...signFieldRequest({ method, path: pathname, keyId: "field-operator", key, body, nonce: `browser-vqa-${++sequence}` }),
  };
  if (body !== null) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(payload);
  }
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path: pathname, method, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : null });
      });
    });
    request.once("error", reject);
    request.end(payload);
  });
}

function requireStatus(result, expected, label) {
  if (result.status !== expected) throw new Error(`${label}:${result.status}:${JSON.stringify(result.body).slice(0, 500)}`);
  return result.body;
}

async function close() {
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  await rm(directory, { recursive: true, force: true });
}

process.once("SIGINT", () => close().finally(() => process.exit(0)));
process.once("SIGTERM", () => close().finally(() => process.exit(0)));

try {
  const fieldNode = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: {
      ...process.env,
      FIELDNET_CONTROL_SOCKET: socketPath,
      FIELDNET_CONTROL_KEY: key,
      FIELDNET_CONTROL_KEY_ID: "field-operator",
      FIELDNET_CONTROL_INCIDENT_SCOPES: incidentId,
      FIELDNET_DB_PATH: path.join(directory, "fieldnet.sqlite"),
      FIELDNET_HOST: "127.0.0.1",
      FIELDNET_NODE_ID: "field-node:isolated-browser-vqa",
      FIELDNET_PORT: "0",
      FIELDNET_CENTRAL_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(fieldNode);
  await waitEvent(fieldNode, "FIELDNET_LISTENING");
  requireStatus(await signedRequest({
    method: "POST",
    pathname: "/api/fieldnet/incidents/import",
    body: { package: createFieldIncidentPackage({ incidentId, createdAt: new Date().toISOString() }) },
  }), 201, "fieldnet_lite_vqa_incident_import_failed");
  requireStatus(await signedRequest({
    method: "POST",
    pathname: "/api/fieldnet/devices",
    body: { device: {
      deviceId,
      deviceType: "PHONE",
      hardwareIdentity: "hardware:isolated-browser-vqa",
      ownerOperator: "observer:isolated-browser-vqa",
      capabilities: ["STRUCTURED_FIELD_REPORT", "TASK_ACK"],
      timeQuality: "SYNCED",
      observer: {
        observerId: "observer:isolated-browser-vqa",
        observerClass: "AUTHORIZED_RESPONDER",
        verificationState: "ROLE_ATTESTED",
        organizationId: "exercise:browser-vqa",
        attestationReference: "attestation:isolated-browser-vqa",
        attestedBy: "field-operator",
        attestedAt: new Date().toISOString(),
      },
    } },
  }), 201, "fieldnet_lite_vqa_device_registration_failed");
  requireStatus(await signedRequest({
    method: "POST",
    pathname: "/api/fieldnet/verification-tasks",
    body: { task: {
      taskId: "task:isolated-browser-vqa:road",
      incidentId,
      objective: "Confirm road access from the governed safe point.",
      owner: "exercise:browser-vqa",
      dueAt: "2099-09-04T01:00:00.000Z",
      acknowledgeBy: "2099-09-04T00:30:00.000Z",
      location: { type: "Point", coordinates: [-8.6, 41.1] },
      safeZoneConstraint: { mode: "KNOWN_SAFE_POINT", instruction: "Remain at the governed safe point.", hazardExclusionM: 500 },
      targetObserverClasses: ["AUTHORIZED_RESPONDER"],
      expectedReportTypes: ["ROAD_ACCESS"],
      requiredEvidence: ["CURRENT_ACCESS_STATE", "GNSS_POINT"],
      completionCriteria: "One linked attributable road report is persisted.",
    } },
  }), 201, "fieldnet_lite_vqa_task_creation_failed");
  const release = requireStatus(
    await signedRequest({ pathname: "/api/fieldnet/release" }),
    200,
    "fieldnet_lite_vqa_release_probe_failed",
  );
  const launcher = spawn(process.execPath, [launcherEntry], {
    cwd: root,
    env: {
      ...process.env,
      FIELDNET_CONTROL_SOCKET: socketPath,
      FIELDNET_CONTROL_KEY: key,
      FIELDNET_CONTROL_KEY_ID: "field-operator",
      FIELDNET_CONTROL_INCIDENT_SCOPES: incidentId,
      FIELDNET_LITE_DEVICE_ID: deviceId,
      FIELDNET_LITE_PORT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(launcher);
  const ready = await waitEvent(launcher, "FIELDNET_LITE_READY");
  process.stdout.write(`${JSON.stringify({ ...ready, release, event: "FIELDNET_LITE_BROWSER_VQA_READY" })}\n`);
} catch (error) {
  await close();
  throw error;
}
