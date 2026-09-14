const DEFAULT_BASE = 'http://127.0.0.1:4188';

function configuredBase() {
  const candidate = document.documentElement.dataset.fieldnetUrl || new URLSearchParams(location.search).get('fieldnetNode');
  if (!candidate) return DEFAULT_BASE;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) return DEFAULT_BASE;
    return url.origin;
  } catch { return DEFAULT_BASE; }
}

function authoritativeActor() {
  const session=globalThis.__VIGIA_SESSION__;
  if(!session?.authenticated)throw new Error('fieldnet_requires_authoritative_session');
  return `${session.actor?.name??session.name} · ${session.actor?.title??session.title}`;
}

export class FieldNetClient {
  constructor(baseUrl = configuredBase()) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
  }

  async request(path, init = {}) {
    const started = performance.now();
    const headers = { ...(init.body ? { 'content-type':'application/json' } : {}), ...(init.headers ?? {}) };
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      signal:init.signal ?? AbortSignal.timeout(4_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? `fieldnet_http_${response.status}`);
    return { payload, durationMs:Number((performance.now() - started).toFixed(1)) };
  }

  state() { return this.request('/api/fieldnet/state'); }
  release() { return this.request('/api/fieldnet/release'); }
  incidents() { return this.request('/api/fieldnet/incidents'); }
  devices() { return this.request('/api/fieldnet/devices'); }
  sensorGateway() { return this.request('/api/fieldnet/sensor-gateway'); }
  registerDevice(device) { return this.request('/api/fieldnet/devices', { method:'POST', body:JSON.stringify({ device, actor:authoritativeActor() }) }); }
  incident(id) { return this.request(`/api/fieldnet/incidents/${encodeURIComponent(id)}`); }
  observations(id) { return this.request(`/api/fieldnet/incidents/${encodeURIComponent(id)}/observations`); }
  tasks(id) { return this.request(`/api/fieldnet/incidents/${encodeURIComponent(id)}/tasks`); }
  conflicts(id) { return this.request(`/api/fieldnet/incidents/${encodeURIComponent(id)}/conflicts`); }
  truthGraph(id) { return this.request(`/api/fieldnet/incidents/${encodeURIComponent(id)}/truth-graph`); }
  sourceFreshness(id) { return this.request(`/api/fieldnet/incidents/${encodeURIComponent(id)}/source-freshness`); }
  offlineMap(id) { return this.request(`/api/fieldnet/incidents/${encodeURIComponent(id)}/offline-map`); }
  replay(id) { return this.request(`/api/fieldnet/incidents/${encodeURIComponent(id)}/replay`); }
  metrics(id) { return this.request(`/api/fieldnet/incidents/${encodeURIComponent(id)}/metrics`); }
  syncQueue() { return this.request('/api/fieldnet/sync-queue'); }

  addObservation(observation) {
    return this.request('/api/fieldnet/observations', { method:'POST', body:JSON.stringify({ observation, actor:authoritativeActor() }) });
  }
  acknowledge(task) {
    return this.request(`/api/fieldnet/tasks/${encodeURIComponent(task.taskId)}/acknowledgements`, { method:'POST', body:JSON.stringify({ taskVersion:task.version, actor:authoritativeActor() }) });
  }
  mutateTask(task, changes) {
    const mutationId = `field-ui:${task.taskId}:${task.version}:${crypto.randomUUID()}`;
    return this.request(`/api/fieldnet/tasks/${encodeURIComponent(task.taskId)}/mutations`, { method:'POST', body:JSON.stringify({ mutationId, baseVersion:task.version, changes, actor:authoritativeActor() }) });
  }
  resolveConflict(conflictId, strategy) {
    return this.request(`/api/fieldnet/conflicts/${encodeURIComponent(conflictId)}/resolve`, { method:'POST', body:JSON.stringify({ strategy, actor:authoritativeActor() }) });
  }
  setConnectionState(state) {
    return this.request('/api/fieldnet/connection-state', { method:'POST', body:JSON.stringify({ state, actor:authoritativeActor() }) });
  }
  sync() { return this.request('/api/fieldnet/sync', { method:'POST', body:'{}', signal:AbortSignal.timeout(15_000) }); }
}
