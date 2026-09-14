import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CentralFieldNetService } from '../../apps/api/src/modules/fieldnet/central-fieldnet-service.mjs';
import { signFieldRequest } from '../../packages/domain/src/fieldnet/request-auth.mjs';

const PROOF_CONTROL_KEY='fieldnet-proof-control-key-32-bytes-minimum';
const PROOF_NODE_KEY='fieldnet-proof-node-key-32-bytes-minimum';

export const now = () => new Date().toISOString();
export const elapsed = (start) => Number((performance.now() - start).toFixed(3));
export const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
export const reservePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close((error) => error ? reject(error) : resolve(port)); });
});
export const waitFor = async (work, { timeoutMs = 12_000, intervalMs = 100, label = 'condition' } = {}) => {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    try { latest = await work(); if (latest) return latest; } catch (error) { latest = error; }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timeout_waiting_for_${label}:${latest?.message ?? JSON.stringify(latest)}`);
};
export const requestJson = async (base, pathname, { method = 'GET', value } = {}) => {
  const payload=value===undefined?null:value,headers={...(value===undefined?{}:{'content-type':'application/json'}),...signFieldRequest({method,path:new URL(pathname,'http://local').pathname,keyId:'field-operator',key:PROOF_CONTROL_KEY,body:payload})};
  const response = await fetch(`${base}${pathname}`, { method, headers, body: value === undefined ? undefined : JSON.stringify(value) });
  const responsePayload = await response.json();
  if (!response.ok) throw new Error(`${method}_${pathname}_http_${response.status}:${responsePayload.error ?? JSON.stringify(responsePayload)}`);
  return responsePayload;
};
export const startFieldNode = ({ root, port, centralPort, dbPath, incidentId }) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['apps/field-node/src/server.mjs'], { cwd: root, env: { ...process.env, FIELDNET_ALLOW_SHARED_CONTROL_LISTENER:'1',FIELDNET_CONTROL_KEY:PROOF_CONTROL_KEY,FIELDNET_CONTROL_KEY_ID:'field-operator',FIELDNET_CONTROL_INCIDENT_SCOPES:incidentId,FIELDNET_NODE_KEY:PROOF_NODE_KEY,FIELDNET_PORT: String(port), FIELDNET_HOST: '127.0.0.1', FIELDNET_NODE_ID: 'field-node:proof-cell-1', FIELDNET_DB_PATH: path.relative(root, dbPath), FIELDNET_CENTRAL_URL: `http://127.0.0.1:${centralPort}`, FIELDNET_MONITOR_INTERVAL_MS: '250', FIELDNET_REQUEST_TIMEOUT_MS: '500' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`field_node_start_timeout:${stderr}`)); }, 5_000);
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    for (const line of stdout.split('\n')) if (line.includes('FIELDNET_LISTENING')) { clearTimeout(timer); try { resolve({ child, listener: JSON.parse(line), stderr: () => stderr }); } catch (error) { reject(error); } }
  });
  child.once('exit', (code) => { if (code && !stdout.includes('FIELDNET_LISTENING')) { clearTimeout(timer); reject(new Error(`field_node_exit_${code}:${stderr}`)); } });
});
export const stopFieldNode = ({ child }) => new Promise((resolve) => {
  if (child.exitCode !== null) return resolve();
  child.once('exit', resolve);
  child.kill('SIGTERM');
  setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 2_000).unref();
});
export const startCentralMock = async ({ port, incidentId, filePath }) => {
  const state = { mutationById: new Map(), deliveries: 0, duplicateDeliveries: 0, rejected: 0, firstResponseDropped: false, requests: 0, priorityAccepted: {}, typeAccepted: {}, incidentIds: new Set(), lastRequest: null };
  const centralService = new CentralFieldNetService({ filePath, nodeRegistry:{'field-node:proof-cell-1':{key:PROOF_NODE_KEY,incidentIds:[incidentId],capabilities:['fieldnet:sync'],status:'active'}}, operationalEventService: { async operatorEvent(id) { return id === incidentId ? { event: { id, evidenceState: 'satellite-only', knowledgeState: 'physical_observation_aging', physicalOperationalState: 'AGING_PHYSICAL_EVIDENCE', lastSeenAt: '2026-08-13T14:18:00Z' } } : null; } } });
  await centralService.initialize(); state.centralService = centralService;
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true })); return; }
    if (request.method !== 'POST' || request.url !== '/fieldnet/sync') { response.writeHead(404).end(); return; }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); state.requests += 1; state.lastRequest = payload;
    for (const mutation of payload.mutations ?? []) {
      state.deliveries += 1; state.incidentIds.add(mutation.incidentId);
      if (state.mutationById.has(mutation.id)) state.duplicateDeliveries += 1;
      else { state.mutationById.set(mutation.id, mutation); state.priorityAccepted[mutation.priority] = (state.priorityAccepted[mutation.priority] ?? 0) + 1; state.typeAccepted[mutation.type] = (state.typeAccepted[mutation.type] ?? 0) + 1; }
    }
    let result;
    try { result = await centralService.sync(payload); } catch (error) { state.rejected += payload.mutations?.length ?? 0; response.writeHead(409, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: error.message })); return; }
    if (!state.firstResponseDropped) { state.firstResponseDropped = true; request.socket.destroy(); return; }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(result));
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve({ server, state })); });
};
