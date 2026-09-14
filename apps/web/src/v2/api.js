export class Api {
  constructor() { this.actorId = 'public-readonly'; }
  async request(path, options = {}) {
    const { timeoutMs = 12_000, ...requestOptions } = options;
    const controller = new AbortController(); const externalSignal = requestOptions.signal; const signal = externalSignal && globalThis.AbortSignal?.any ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal; if (externalSignal && !globalThis.AbortSignal?.any) externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true }); const timer = setTimeout(() => controller.abort('request_timeout'), timeoutMs);
    const headers = { ...(requestOptions.body ? { 'content-type': 'application/json' } : {}), ...(requestOptions.headers ?? {}) };
    try {
      const body=requestOptions.body && typeof requestOptions.body !== 'string' ? JSON.stringify(requestOptions.body) : requestOptions.body,retryable=!requestOptions.method||requestOptions.method==='GET';
      for(let attempt=0;;attempt+=1){
        const response = await fetch(path, { ...requestOptions, credentials:'same-origin', headers, signal, body });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          if(retryable&&response.status===503&&payload.error==='runtime_starting'&&attempt<25){await new Promise((resolve)=>setTimeout(resolve,Math.min(400,120*(attempt+1))));continue;}
          const error = new Error(payload.message || payload.error || `request_failed_${response.status}`); error.status = response.status; error.code = payload.error; throw error;
        }
        if (response.status === 204) return null; return response.json();
      }
    } catch (error) {
      if (externalSignal?.aborted) { const error = new Error('request_cancelled'); error.code = 'request_cancelled'; throw error; } if (controller.signal.aborted) throw new Error('Request timed out. Retry when the source is available.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  session(){return this.request('/api/v10/session',{timeoutMs:4_000});}
  resumeLocalSession(){return this.request('/api/v10/session',{method:'POST',timeoutMs:4_000});}
  signout(){return this.request('/api/v10/session',{method:'DELETE',timeoutMs:4_000});}
  commandBootstrap(){return this.request('/api/v10/workspaces/command',{timeoutMs:8_000});}
  bootstrap() { return this.request('/api/v2/bootstrap'); }
  live() { return this.request('/api/v10/events', { timeoutMs: 18_000 }); }
  event(id) { return this.request(`/api/v10/events/${encodeURIComponent(id)}?projection=operator`, { timeoutMs: 18_000 }); }
  recordUiFirstSeen(id,body){return this.request(`/api/v10/events/${encodeURIComponent(id)}/ui-first-seen`,{method:'POST',body,timeoutMs:6_000});}
  territory() { return this.request('/api/v10/territory', { timeoutMs: 18_000 }); }
  detectionBenchmark(){return this.request('/api/v10/detection/benchmark');}
  measurementDebt(){return this.request('/api/v10/validation/measurement-debt');}
  preventionMachineEvidence(){return this.request('/api/v10/validation/prevention-machine-evidence');}
  measurementCampaigns(){return this.request('/api/v10/validation/measurement-campaigns');}
  falseNegativeTaxonomy(){return this.request('/api/v10/validation/false-negative-taxonomy');}
  preventionConsensusZones(){return this.request('/api/v10/validation/prevention-consensus/zones',{timeoutMs:8_000});}
  liveCampaignScorecards(){return this.request('/api/v10/campaign/live-shadow/scorecards');}
  pilotDefinition(){return this.request('/api/v10/pilot/definition');}
  pilotReport(){return this.request('/api/v10/pilot/report');}
  preventionFinding(id) { return this.request(`/api/v10/prevention/findings/${encodeURIComponent(id)}`); }
  reviewPreventionFinding(id, body) { return this.request(`/api/v10/prevention/findings/${encodeURIComponent(id)}/reviews`, { method:'POST', body }); }
  transitionPreventionMission(id,body){return this.request(`/api/v10/prevention/missions/${encodeURIComponent(id)}/transitions`,{method:'POST',body});}
  importPreventionReviews(body){return this.request('/api/v10/prevention/reviews/import',{method:'POST',body,timeoutMs:30_000});}
  replay() { return this.request('/api/v10/replay'); }
  replayCase(id) { return this.request(`/api/v10/replay/cases/${encodeURIComponent(id)}`, { timeoutMs: 20_000 }); }
  observation(coordinate, { primaryId = null, comparableId = null, ...options } = {}) {
    const params=new URLSearchParams({lon:String(coordinate[0]),lat:String(coordinate[1]),radiusKm:'9'});
    if(primaryId)params.set('primaryId',primaryId);if(comparableId)params.set('comparableId',comparableId);
    return this.request(`/api/v2/observations/resolve?${params}`, { timeoutMs: 22_000, ...options });
  }
  consequence(id) { return this.request(`/api/v2/consequence/${encodeURIComponent(id)}`); }
  exposure(id) { return this.request(`/api/v2/consequence/${encodeURIComponent(id)}/exposure`, { timeoutMs: 10_000 }); }
  outcomes() { return this.request('/api/v2/outcomes'); }
  audit() { return this.request('/api/v2/audit?limit=200'); }
  createEvidence(body) { return this.request('/api/v2/evidence-requests', { method: 'POST', body }); }
  transitionEvidence(id, body) { return this.request(`/api/v2/evidence-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body }); }
  submitEvidence(id, body) { return this.request(`/api/v2/evidence-requests/${encodeURIComponent(id)}/submit`, { method: 'POST', body }); }
  reviewEvidence(id, body) { return this.request(`/api/v2/evidence-requests/${encodeURIComponent(id)}/review`, { method: 'POST', body }); }
  verifyHazard(body) { return this.request('/api/v2/hazards/verify', { method: 'POST', body }); }
  createRemediation(body) { return this.request('/api/v2/remediations', { method: 'POST', body }); }
  transitionRemediation(id, body) { return this.request(`/api/v2/remediations/${encodeURIComponent(id)}`, { method: 'PATCH', body }); }
  submitCompletion(id, body) { return this.request(`/api/v2/remediations/${encodeURIComponent(id)}/completion`, { method: 'POST', body }); }
  reobserve(id, body) { return this.request(`/api/v2/remediations/${encodeURIComponent(id)}/reobserve`, { method: 'POST', body }); }
  reviewIncident(id, body) { return this.request(`/api/v2/incidents/${encodeURIComponent(id)}/review`, { method: 'POST', body }); }
  alerts() { return this.request('/api/v10/alerts'); }
  operationsStatus(){return this.request('/api/v10/operations/status',{timeoutMs:8_000});}
  operationsMetrics(){return this.request('/api/v10/operations/metrics',{timeoutMs:8_000});}
  operationsIncident(id){return this.request(`/api/v10/operations/incidents/${encodeURIComponent(id)}`,{timeoutMs:8_000});}
  notifications(){return this.request('/api/v10/notifications/in-app?limit=100',{timeoutMs:8_000});}
  acknowledgeAlert(id,body={}) { return this.request(`/api/v10/alerts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST',body }); }
  assignAlert(id,ownerActorId,body={}){return this.request(`/api/v10/alerts/${encodeURIComponent(id)}/assign`,{method:'POST',body:{...body,ownerActorId}});}
  eventCorrections() { return this.request('/api/v10/events/corrections'); }
  mergeEvents(body) { return this.request('/api/v10/events/corrections/merge', { method: 'POST', body }); }
  splitEvent(body) { return this.request('/api/v10/events/corrections/split', { method: 'POST', body }); }
  rejectAssociation(body) { return this.request('/api/v10/events/corrections/reject', { method: 'POST', body }); }

  taskSensor(id, body) { return this.request(`/api/v10/sensors/${encodeURIComponent(id)}/task`, { method: 'POST', body }); }

}
