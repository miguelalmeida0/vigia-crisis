import http from 'node:http';
import path from 'node:path';
import { signFieldRequest, verifyFieldResponse } from '../../../../../packages/domain/src/fieldnet/request-auth.mjs';
import {
  assertRestrictedCapacityReadiness,
  assertPersistedCapacityTask,
  buildFieldNetCapacityTask,
  FIELDNET_CAPACITY_TASK_SPECIFICATIONS,
  isExactIncidentList,
  isOpaqueCapacityTaskValue,
  projectCapacityTaskLifecycle,
  safeCapacityTaskReason,
  validateTrustedCapacityDestination
} from './fieldnet-capacity-task-contract.mjs';

export class FieldNetCapacityTaskClient {
  #inflight = new Map();

  constructor({ socketPath, keyId, key, incidentId, destination, expectedReleaseIdentity, centralSnapshotForIncident = null, clock = () => new Date(), timeoutMs = 2_000, maxResponseBytes = 256 * 1024 } = {}) {
    if (!path.isAbsolute(String(socketPath ?? ''))) throw new Error('fieldnet_capacity_task_socket_required');
    if (!isOpaqueCapacityTaskValue(String(keyId ?? '')) || String(key ?? '').length < 32) throw new Error('fieldnet_capacity_task_signing_material_required');
    this.destination = validateTrustedCapacityDestination({ destination, incidentId });
    this.socketPath = socketPath;
    this.keyId = keyId;
    this.key = key;
    this.incidentId = String(incidentId);
    this.expectedReleaseIdentity = Object.freeze(structuredClone(expectedReleaseIdentity ?? {}));
    this.centralSnapshotForIncident = typeof centralSnapshotForIncident === 'function' ? centralSnapshotForIncident : null;
    this.clock = clock;
    this.timeoutMs = Math.max(250, Number(timeoutMs) || 2_000);
    this.maxResponseBytes = Math.max(16_384, Math.min(1024 * 1024, Number(maxResponseBytes) || 256 * 1024));
  }

  async availabilityFor(incidentId) {
    const checkedAt = this.clock().toISOString();
    if (String(incidentId) !== this.incidentId) return Object.freeze({ state: 'NOT_CONNECTED', checkedAt, reason: 'No exact-scope trusted FieldNet capacity-task destination is configured for this incident.' });
    try {
      const readiness = await this.#request({ method: 'GET', path: '/api/fieldnet/capacity-task-readiness', body: null });
      if (readiness.status !== 200) throw new Error(`fieldnet_capacity_task_readiness_http_${readiness.status}`);
      assertRestrictedCapacityReadiness(readiness.body, {
        destinationNodeId: this.destination.nodeId,
        incidentId: this.incidentId,
        expectedReleaseIdentity: this.expectedReleaseIdentity
      });
      const response = await this.#request({ method: 'GET', path: '/api/fieldnet/state', body: null });
      if (response.status !== 200) throw new Error(`fieldnet_capacity_task_state_http_${response.status}`);
      const state = response.body;
      if (state?.nodeId !== this.destination.nodeId) throw new Error('fieldnet_capacity_task_destination_identity_mismatch');
      if (!isExactIncidentList((state.incidents ?? []).map((item) => item.incidentId), this.incidentId)) throw new Error('fieldnet_capacity_task_incident_package_not_initialized');
      return Object.freeze({ state: 'CONNECTED', checkedAt, destinationNodeId: this.destination.nodeId, readiness: readiness.body, reason: null });
    } catch (error) {
      return Object.freeze({ state: 'DEGRADED', checkedAt, destinationNodeId: this.destination.nodeId, reason: safeCapacityTaskReason(error, 'fieldnet_capacity_task_destination_unavailable') });
    }
  }

  async ensureCapacityTask({ requirement, facility } = {}) {
    if (String(requirement?.incidentId) !== this.incidentId) throw new Error('fieldnet_capacity_task_incident_scope_forbidden');
    const availability = await this.availabilityFor(this.incidentId);
    if (availability.state !== 'CONNECTED') throw new Error(`fieldnet_capacity_task_destination_not_ready:${availability.reason ?? 'readiness_failed'}`);
    const task = buildFieldNetCapacityTask({ requirement, facility, destinationNodeId: this.destination.nodeId });
    if (this.#inflight.has(task.taskId)) return this.#inflight.get(task.taskId);
    const operation = this.#ensure(task, requirement).finally(() => this.#inflight.delete(task.taskId));
    this.#inflight.set(task.taskId, operation);
    return operation;
  }

  async #ensure(expected, requirement) {
    const attemptedAt = this.clock().toISOString();
    const lookupPath = `/api/fieldnet/tasks/${encodeURIComponent(expected.taskId)}?incidentId=${encodeURIComponent(this.incidentId)}`;
    let response = await this.#request({ method: 'GET', path: lookupPath, signaturePath: lookupPath.split('?')[0], body: null });
    let duplicate = false;
    let task;
    if (response.status === 404) {
      response = await this.#request({ method: 'POST', path: '/api/fieldnet/verification-tasks', body: { task: expected } });
      if (response.status !== 201) throw new Error(`fieldnet_capacity_task_create_http_${response.status}:${safeCapacityTaskReason(response.body?.error, 'create_failed')}`);
      task = response.body?.task;
      duplicate = response.body?.duplicate === true;
    } else {
      if (response.status !== 200) throw new Error(`fieldnet_capacity_task_lookup_http_${response.status}`);
      task = response.body;
      duplicate = true;
    }
    assertPersistedCapacityTask(task, expected, this.destination.nodeId);
    const persisted = await this.#request({ method: 'GET', path: lookupPath, signaturePath: lookupPath.split('?')[0], body: null });
    if (persisted.status !== 200) throw new Error('fieldnet_capacity_task_persistence_confirmation_failed');
    task = assertPersistedCapacityTask(persisted.body, expected, this.destination.nodeId);
    const lifecyclePath = `/api/fieldnet/tasks/${encodeURIComponent(expected.taskId)}/lifecycle`;
    const lifecycleResponse = await this.#request({ method: 'GET', path: lifecyclePath, body: null });
    if (lifecycleResponse.status !== 200) throw new Error('fieldnet_capacity_task_lifecycle_confirmation_failed');
    let centralTask = null;
    if (this.centralSnapshotForIncident) {
      try {
        const snapshot = await this.centralSnapshotForIncident(this.incidentId);
        centralTask = (snapshot?.tasks ?? []).find((item) => item.taskId === task.taskId) ?? null;
      } catch {
        centralTask = null;
      }
    }
    return projectCapacityTaskLifecycle({
      task,
      destinationNodeId: this.destination.nodeId,
      centralTask,
      localLifecycle: lifecycleResponse.body,
      attemptedAt,
      nextAttempt: requirement.currentAssessment?.nextCheckAt ?? null,
      duplicate
    });
  }

  #request({ method, path: requestPath, signaturePath = requestPath, body }) {
    const payload = body === null ? null : Buffer.from(JSON.stringify(body));
    const signed = signFieldRequest({ method, path: signaturePath, keyId: this.keyId, key: this.key, body, now: this.clock() });
    return new Promise((resolve, reject) => {
      const request = http.request({
        socketPath: this.socketPath,
        path: requestPath,
        method,
        headers: {
          host: 'fieldnode.local',
          accept: 'application/json',
          ...signed,
          ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {})
        }
      }, (response) => {
        const declared = Number(response.headers['content-length']);
        if (Number.isFinite(declared) && declared > this.maxResponseBytes) {
          response.destroy();
          reject(new Error('fieldnet_capacity_task_response_too_large'));
          return;
        }
        const chunks = [];
        let bytes = 0;
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > this.maxResponseBytes) {
            response.destroy(new Error('fieldnet_capacity_task_response_too_large'));
            return;
          }
          chunks.push(chunk);
        });
        response.once('error', reject);
        response.once('end', () => {
          try {
            const raw = Buffer.concat(chunks, bytes).toString('utf8');
            const parsed = raw ? JSON.parse(raw) : null;
            verifyFieldResponse({
              keyId: this.keyId,
              key: this.key,
              requestNonce: signed['x-vigia-field-nonce'],
              requestBodyHash: signed['x-vigia-field-body-sha256'],
              body: parsed,
              headers: response.headers
            });
            resolve({ status: Number(response.statusCode ?? 0), body: parsed });
          } catch (error) {
            reject(error);
          }
        });
      });
      request.setTimeout(this.timeoutMs, () => request.destroy(new Error('fieldnet_capacity_task_request_timeout')));
      request.once('error', reject);
      if (payload) request.write(payload);
      request.end();
    });
  }
}

export { buildFieldNetCapacityTask, FIELDNET_CAPACITY_TASK_SPECIFICATIONS, validateTrustedCapacityDestination };
