const BASE = '/backend';
export const PROTECTION_MUTATION_TIMEOUT_MS = 24000;

async function operatorIdentity() {
  const response = await fetch('/__operator/ready', { credentials:'same-origin', cache:'no-store', headers:{ accept:'application/json' } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || payload?.frontend !== 'operator-console') throw new Error('operator_identity_unavailable');
  return payload;
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutError = Object.assign(new Error('operator_request_timeout'), { status:408 });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(timeoutError); }, options.timeoutMs ?? 12000);
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  const headers = { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
  if (!['GET','HEAD','OPTIONS'].includes(String(options.method || 'GET').toUpperCase())) headers['x-vigia-operator-intent'] = 'operator-console';
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
      credentials: 'same-origin',
      signal,
      cache: 'no-store'
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('json') ? await response.json().catch(() => null) : await response.text().catch(() => '');
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || `backend_${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } catch (error) {
    if (timedOut && controller.signal.aborted) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const TRANSIENT_MUTATION_STATUSES = new Set([408, 502, 503, 504]);

export async function idempotentMutationRequest(path, options = {}) {
  const input = options.body;
  const idempotencyKey = input && typeof input === 'object' && typeof input.idempotencyKey === 'string'
    ? input.idempotencyKey.trim()
    : '';
  if (!idempotencyKey) return request(path, options);

  // Serialize once so a transport retry sends the same admitted mutation
  // bytes and, critically, the same durable idempotency key. The backend is
  // authoritative about whether the first attempt committed.
  const retryOptions = { ...options, body: JSON.stringify(input) };
  try {
    return await request(path, retryOptions);
  } catch (error) {
    if (!TRANSIENT_MUTATION_STATUSES.has(Number(error?.status))) throw error;
    return request(path, retryOptions);
  }
}

function query(path, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
  return `${path}${search.size ? `?${search}` : ''}`;
}

export function situationRequest(incidentId,part='',params={},options={}) {
  return request(query(`/api/v10/operator/incidents/${encodeURIComponent(incidentId)}/situation${part?'/'+part:''}`,params),{timeoutMs:15000,...options});
}
export const situationDocumentSources=()=>request('/api/v10/operator/situation-document-sources');
export const teamRequest=(part,body)=>request('/api/v10/team/'+part,{method:body?'POST':'GET',body,timeoutMs:6000});

export const vigiaApi = {
  intelligenceQuery: (params,options={}) => request(query('/api/v10/operator/intelligence-query',params),options),
  intelligenceCounterfactual: (params,options={}) => request(query('/api/v10/operator/intelligence-counterfactual',params),options),
  operatorIdentity,
  health: () => request('/__health', { timeoutMs: 3500 }),
  session: () => request('/api/v10/session', { timeoutMs: 5000 }),
  createSession: () => request('/api/v10/session', { method:'POST', body:{ intent:'local-shadow-operator-session' }, timeoutMs:5000 }),
  bootstrap: () => request('/api/v2/bootstrap', { timeoutMs: 18000 }),
  commandBootstrap: () => request('/api/v10/workspaces/command', { timeoutMs: 18000 }),
  events: () => request('/api/v10/events', { timeoutMs: 20000 }),
  event: (id, options = {}) => request(`/api/v10/events/${encodeURIComponent(id)}?projection=operator`, { timeoutMs: 20000, signal:options.signal }),
  territory: () => request('/api/v10/territory', { timeoutMs: 18000 }),
  replay: () => request('/api/v10/replay', { timeoutMs: 20000 }),
  replayCase: id => request(`/api/v10/replay/cases/${encodeURIComponent(id)}`, { timeoutMs: 25000 }),
  alerts: () => request('/api/v10/alerts?limit=100', { timeoutMs: 10000 }),
  operationsStatus: () => request('/api/v10/operations/status', { timeoutMs: 8000 }),
  operationsMetrics: () => request('/api/v10/operations/metrics', { timeoutMs: 8000 }),
  operationsIncident: (id, options = {}) => request(`/api/v10/operations/incidents/${encodeURIComponent(id)}`, { timeoutMs: 10000, signal:options.signal }),
  operationsTerritories: () => request('/api/v10/operations/territories', { timeoutMs: 10000 }),
  operationsAssets: () => request('/api/v10/operations/assets?limit=1000', { timeoutMs: 12000 }),
  operationsRoster: () => request('/api/v10/operations/roster', { timeoutMs: 10000 }),
  fieldnet: () => request('/api/v10/fieldnet/status', { timeoutMs: 8000 }),
  fieldnetReconciliation: id => request(`/api/v10/fieldnet/reconciliation/${encodeURIComponent(id)}`, { timeoutMs: 8000 }),
  evidenceNeeds: () => request('/api/v10/evidence-needs', { timeoutMs: 8000 }),
  evidenceRequests: () => request('/api/v2/evidence-requests', { timeoutMs: 8000 }),
  intelligenceInbox: () => request('/api/v10/intelligence/inbox?limit=5', { timeoutMs: 12000 }),
  intelligenceIncident: (id, options = {}) => request(`/api/v10/intelligence/incidents/${encodeURIComponent(id)}`, { timeoutMs:12000, signal:options.signal }),
  intelligenceHistory: (id, cursor = '') => request(query(`/api/v10/intelligence/incidents/${encodeURIComponent(id)}/history`, { cursor, limit:20 }), { timeoutMs:12000 }),
  intelligenceReplay: (id, asOf) => request(query(`/api/v10/intelligence/replay/${encodeURIComponent(id)}`, { asOf }), { timeoutMs:12000 }),
  intelligencePrevent: id => request(`/api/v10/intelligence/prevent/${encodeURIComponent(id)}`, { timeoutMs:10000 }),
  recordIntelligenceDecision: (id, input) => idempotentMutationRequest(`/api/v10/intelligence/incidents/${encodeURIComponent(id)}/decisions`, { method:'POST', body:input, timeoutMs:10000 }),
  createEvidenceRequest: input => idempotentMutationRequest('/api/v2/evidence-requests', { method:'POST', body:input, timeoutMs:10000 }),
  transitionEvidenceRequest: (id,input) => idempotentMutationRequest(`/api/v2/evidence-requests/${encodeURIComponent(id)}`, { method:'PATCH', body:input, timeoutMs:10000 }),
  previewIncidentImport: input => request('/api/v10/incident-command/imports/validate', { method:'POST', body:input, timeoutMs:12000 }),
  confirmIncidentImport: input => request('/api/v10/incident-command/imports', { method:'POST', body:input, timeoutMs:18000 }),
  commandIncident: id => request(`/api/v10/incident-command/incidents/${encodeURIComponent(id)}`, { timeoutMs:10000 }),
  proposeCommandIntent: (id,input) => idempotentMutationRequest(`/api/v10/incident-command/incidents/${encodeURIComponent(id)}/intents`, { method:'POST', body:input, timeoutMs:12000 }),
  recordPlanningDecision: (id,input) => idempotentMutationRequest(`/api/v10/incident-command/incidents/${encodeURIComponent(id)}/planning-decisions`, { method:'POST', body:input, timeoutMs:12000 }),
  applyReviewedPlan: (id,decisionId,input) => idempotentMutationRequest(`/api/v10/incident-command/incidents/${encodeURIComponent(id)}/planning-decisions/${encodeURIComponent(decisionId)}/apply`, { method:'POST', body:input, timeoutMs:12000 }),
  retrySources: () => request('/api/v1/world/refresh', { method:'POST', body:{ reason:'operator_bounded_retry' }, timeoutMs:30000 }),
  detectionBenchmark: () => request('/api/v10/detection/benchmark', { timeoutMs: 10000 }),
  preventionConsensus: () => request('/api/v10/validation/prevention-consensus/zones', { timeoutMs: 10000 }),
  preventionFinding: id => request(`/api/v10/prevention/findings/${encodeURIComponent(id)}`, { timeoutMs: 10000 }),
  observations: ({ coordinate, primaryId, comparableId, radiusKm = 9 }) => request(query('/api/v2/observations/resolve', {
    lon: coordinate?.[0], lat: coordinate?.[1], radiusKm, primaryId, comparableId
  }), { timeoutMs: 22000 }),
  screening: ({ coordinate, primaryId, comparableId, radiusKm = 9 }) => request(query('/api/v10/observations/change-screening', {
    lon: coordinate?.[0], lat: coordinate?.[1], radiusKm, primaryId, comparableId
  }), { timeoutMs: 22000 }),
  acknowledgeAlert: (id, note = '') => request(`/api/v10/alerts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST', body: { note }, timeoutMs: 10000 })
};

Object.assign(vigiaApi, {
  operatorCommandOverview: options => request('/api/v10/operator/command-overview', { timeoutMs:24500, signal:options?.signal }),
  operatorMapContext: scope => request(`/api/v10/operator/map-context/${scope}`, { timeoutMs:12000 }),
  operatorIncidents: options => request('/api/v10/operator/incidents', { timeoutMs:24500, signal:options?.signal }),
  operatorIncident: (id, options) => request(`/api/v10/operator/incidents/${encodeURIComponent(id)}`, { timeoutMs:24000, signal:options?.signal }),
  operatorLocation: (id, options) => request(`/api/v10/operator/incidents/${encodeURIComponent(id)}/location`, { timeoutMs:12000, signal:options?.signal }),
  operatorIntelligence: (id, options) => request(`/api/v10/operator/incidents/${encodeURIComponent(id)}/intelligence`, { timeoutMs:24000, signal:options?.signal }),
  operatorEvidenceDebt: (id, options) => request(`/api/v10/operator/incidents/${encodeURIComponent(id)}/evidence-debt`, { timeoutMs:24000, signal:options?.signal }),
  operatorOperations: (id, options) => request(`/api/v10/operator/incidents/${encodeURIComponent(id)}/operations`, { timeoutMs:24000, signal:options?.signal }),
  reviewResponseRecommendation: (incidentId,recommendationId,input) => idempotentMutationRequest(`/api/v10/operator/incidents/${encodeURIComponent(incidentId)}/response-capability/recommendations/${encodeURIComponent(recommendationId)}/reviews`, { method:'POST', body:input, timeoutMs:12000 }),
  operatorAuthority: options => request('/api/v10/operator/authority', { timeoutMs:12000, signal:options?.signal }),
  operatorControlPlane: options => request('/api/v10/operator/control-plane', { timeoutMs:12000, signal:options?.signal }),
  operatorReports: options => request('/api/v10/operator/reports', { timeoutMs:25000, signal:options?.signal }),
  operatorGlobalAwareness: options => request('/api/v10/operator/global-situational-awareness', { timeoutMs:25000, signal:options?.signal }),
  humanAttention: options => request('/api/v10/operator/attention', { timeoutMs:12000, signal:options?.signal }),
  acknowledgeHumanAttention: (attentionId,input={}) => idempotentMutationRequest(`/api/v10/operator/attention/${encodeURIComponent(attentionId)}/acknowledge`, { method:'POST', body:input, timeoutMs:12000 }),
  humanAttentionAction: (attentionId,input={}) => idempotentMutationRequest(`/api/v10/operator/attention/${encodeURIComponent(attentionId)}/actions`, { method:'POST', body:input, timeoutMs:24000 }),
  operationalPeriods: options => request('/api/v10/operator/operational-periods', { timeoutMs:12000, signal:options?.signal }),
  startOperationalPeriod: input => idempotentMutationRequest('/api/v10/operator/operational-periods', { method:'POST', body:input, timeoutMs:24000 }),
  recordOperationalPeriod: (periodId,input) => idempotentMutationRequest(`/api/v10/operator/operational-periods/${encodeURIComponent(periodId)}/records`, { method:'POST', body:input, timeoutMs:24000 }),
  beginOperationalPeriodHandoff: (periodId,input) => idempotentMutationRequest(`/api/v10/operator/operational-periods/${encodeURIComponent(periodId)}/handoff`, { method:'POST', body:input, timeoutMs:24000 }),
  closeOperationalPeriod: (periodId,input) => idempotentMutationRequest(`/api/v10/operator/operational-periods/${encodeURIComponent(periodId)}/close`, { method:'POST', body:input, timeoutMs:24000 }),
  protectionWorkflows: (incidentId,options) => request(`/api/v10/incident-command/incidents/${encodeURIComponent(incidentId)}/protection-workflows`, { timeoutMs:12000, signal:options?.signal }),
  createProtectionWorkflow: (incidentId,input) => idempotentMutationRequest(`/api/v10/incident-command/incidents/${encodeURIComponent(incidentId)}/protection-workflows`, { method:'POST', body:input, timeoutMs:PROTECTION_MUTATION_TIMEOUT_MS }),
  transitionProtectionWorkflow: (incidentId,workflowId,input) => idempotentMutationRequest(`/api/v10/incident-command/incidents/${encodeURIComponent(incidentId)}/protection-workflows/${encodeURIComponent(workflowId)}/transitions`, { method:'POST', body:input, timeoutMs:PROTECTION_MUTATION_TIMEOUT_MS }),
  composeCapDraft: (incidentId,workflowId,input) => idempotentMutationRequest(`/api/v10/incident-command/incidents/${encodeURIComponent(incidentId)}/protection-workflows/${encodeURIComponent(workflowId)}/cap-draft`, { method:'POST', body:input, timeoutMs:PROTECTION_MUTATION_TIMEOUT_MS }),
  dispatchCap: (incidentId,workflowId,input) => idempotentMutationRequest(`/api/v10/incident-command/incidents/${encodeURIComponent(incidentId)}/protection-workflows/${encodeURIComponent(workflowId)}/cap-dispatch`, { method:'POST', body:input, timeoutMs:PROTECTION_MUTATION_TIMEOUT_MS })
});

export function backendAsset(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return '';
  return path.startsWith('/api/') ? `${BASE}${path}` : path;
}

export function thermalOverlayUrl({ bbox, time = 'latest', width = 1200, height = 900 } = {}) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return '';
  return `${BASE}/api/v10/events/thermal/overlay?bbox=${bbox.join(',')}&time=${encodeURIComponent(time)}&width=${width}&height=${height}`;
}

export function basemapTileUrl(kind, z, x, y) {
  return `${BASE}/api/v1/basemap/${kind}/${z}/${x}/${y}`;
}

// Read-only collection intelligence. Same operator boundary as the situation
// reads above; nothing here mutates state or triggers acquisition.
export function collectionRequest(incidentId,part='',params={},options={}) {
  return request(
    query(
      `/api/v10/operator/incidents/${encodeURIComponent(incidentId)}/collection${part?'/'+part:''}`,
      params
    ),
    {timeoutMs:15000,...options}
  );
}
