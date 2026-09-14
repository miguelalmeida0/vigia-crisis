import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signFieldRequest, verifyFieldResponse } from '../../../packages/domain/src/fieldnet/request-auth.mjs';
import { ResponseCapabilityService } from '../src/modules/response-capability/response-capability-service.mjs';

export const root = fileURLToPath(new URL('../../..', import.meta.url));
export const serverEntry = fileURLToPath(new URL('../../field-node/src/server.mjs', import.meta.url));
export const scratchRoot = path.join(root, '.tmp/test');
export const INCIDENT_ID = 'incident:capacity-task-bridge';
export const NODE_ID = 'field-node:capacity-task-bridge';
export const CONTROL_KEY = 'fieldnet-control-capacity-task-bridge-key';
export const TASK_KEY = 'fieldnet-restricted-capacity-task-key';
export const CONTROL_KEY_ID = 'field-operator';
export const TASK_KEY_ID = 'fieldnet-capacity-task-resolver';

export function waitForListener(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    let errors = '';
    const timeout = setTimeout(() => reject(new Error(`fieldnet_listener_timeout:${output}:${errors}`)), 10_000);
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`fieldnet_exited_before_listen:${code}:${output}:${errors}`)); });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      for (const line of output.split('\n')) {
        try {
          const event = JSON.parse(line);
          if (event.event === 'FIELDNET_LISTENING') { clearTimeout(timeout); resolve(event); return; }
        } catch {}
      }
    });
  });
}

export function signedSocketRequest({ socketPath, keyId, key, method = 'GET', requestPath, signaturePath = requestPath, body = null }) {
  const encoded = body === null ? null : Buffer.from(JSON.stringify(body));
  const signed = signFieldRequest({ method, path: signaturePath, keyId, key, body });
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path: requestPath,
      method,
      headers: { host: 'fieldnode.local', ...signed, ...(encoded ? { 'content-type': 'application/json', 'content-length': String(encoded.length) } : {}) }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const value = raw ? JSON.parse(raw) : null;
          if (response.headers['x-vigia-field-response-signature']) verifyFieldResponse({
            keyId,
            key,
            requestNonce: signed['x-vigia-field-nonce'],
            requestBodyHash: signed['x-vigia-field-body-sha256'],
            body: value,
            headers: response.headers
          });
          resolve({ status: response.statusCode, body: value, signed: Boolean(response.headers['x-vigia-field-response-signature']) });
        } catch (error) { reject(error); }
      });
    });
    request.once('error', reject);
    if (encoded) request.write(encoded);
    request.end();
  });
}

export function facility(kind = 'FIRE_STATION') {
  return {
    id: kind === 'HOSPITAL' ? 'hospital:bridge' : 'station:bridge',
    kind,
    name: kind === 'HOSPITAL' ? 'Governed hospital' : 'Governed fire station',
    coordinate: [-8.4, 41.1],
    distanceKm: 6,
    staticCapability: kind === 'HOSPITAL' ? { emergencyDepartment: { value: true } } : { wildfireCapability: { value: true } },
    provenance: { provider: 'Governed fixture', sourceRecordId: `fixture:${kind}` },
    freshness: { state: 'STATIC_SNAPSHOT' }
  };
}

export function responseService({ dispatcher = null, reportProvider = null, recommendationRepository = null, now = new Date(), kind = 'FIRE_STATION' } = {}) {
  const candidate = facility(kind);
  const empty = { HOSPITAL: [], FIRE_STATION: [], EMS_BASE: [], CIVIL_PROTECTION: [], POLICE: [], SHELTER: [], WATER_POINT: [], AIR_SUPPORT_BASE: [] };
  empty[kind] = [candidate];
  return new ResponseCapabilityService({
    facilityRepository: { nearest: () => ({ covered: true, byKind: empty, sourceCoverage: {} }) },
    routingAdapter: {
      endpoint: 'https://governed-routing.invalid',
      async routeMany(_origin, items) {
        return items.map((item) => ({ ...item, reachability: {
          state: 'ROUTED', method: 'GOVERNED_TEST_ROUTER', routeDistanceKm: 8, travelTimeMinutes: 12,
          currentRoute: { geometry: { type: 'LineString', coordinates: [[-8.5, 41.2], item.coordinate] } },
          alternativeRoute: null, alternativeRouteState: 'NOT_RETURNED', roadClosureImpact: { state: 'UNKNOWN', closures: [] },
          terrainAccessConstraints: { state: 'UNKNOWN', constraints: [] }, source: { provider: 'Governed test router' },
          checkedAt: now.toISOString(), confidence: { state: 'CONTEXTUAL_ESTIMATE' }
        } }));
      }
    },
    capacityReportProvider: reportProvider,
    capacityTaskDispatcher: dispatcher,
    recommendationRepository,
    clock: () => new Date(now)
  });
}
