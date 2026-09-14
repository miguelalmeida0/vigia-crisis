import { buildOperationalTruthProjection } from '../operator/operational-recovery-service.mjs';

const rows = (value) => Array.isArray(value) ? value : [];
const incidentId = (row) => String(row?.incident?.id ?? row?.incidentId ?? row?.id ?? '');

export class ResponseCapabilityReconciler {
  #inflight = null;
  #cursor = 0;
  #last = new Map();

  constructor({ responseCapabilityService, clock = () => new Date(), maxIncidentsPerCycle = 4,
    minimumRepeatMs = 5 * 60_000 } = {}) {
    this.responseCapabilityService = responseCapabilityService;
    this.clock = clock;
    this.maxIncidentsPerCycle = Math.max(1, Math.floor(maxIncidentsPerCycle));
    this.minimumRepeatMs = Math.max(1_000, minimumRepeatMs);
  }

  async reconcile({ twin } = {}) {
    if (this.#inflight) return this.#inflight;
    this.#inflight = this.#run(twin).finally(() => { this.#inflight = null; });
    return this.#inflight;
  }

  async #run(twin) {
    const checkedAt = this.clock().toISOString();
    const truth = buildOperationalTruthProjection(twin, { at: checkedAt });
    const incidentRows = new Map(rows(twin?.incidents).map((item) => [incidentId(item), item]));
    const governed = rows(truth.incidents).filter((item) => item.classification === 'VERIFIED_CURRENT'
      && ['GEOLOCATED', 'AREA_GEOMETRY'].includes(item.axes?.incidentCoverage?.state)
      && incidentRows.has(item.incidentId));
    const ordered = governed.length
      ? [...governed.slice(this.#cursor), ...governed.slice(0, this.#cursor)]
      : [];
    const selected = ordered.filter((item) => {
      const prior = this.#last.get(item.incidentId);
      return !prior || prior.revision !== item.priority?.revision
        || Date.parse(checkedAt) - Date.parse(prior.checkedAt) >= this.minimumRepeatMs;
    }).slice(0, this.maxIncidentsPerCycle);
    const results = [];
    for (const item of selected) {
      try {
        const projection = await this.responseCapabilityService.projectIncident(incidentRows.get(item.incidentId));
        results.push({ incidentId: item.incidentId, state: 'RECONCILED', projectionId: projection.projectionId });
        this.#last.set(item.incidentId, { revision: item.priority?.revision, checkedAt });
      } catch (error) {
        results.push({ incidentId: item.incidentId, state: 'FAILED', reason: String(error?.message ?? error).slice(0, 160) });
      }
    }
    if (governed.length) this.#cursor = (this.#cursor + Math.max(1, selected.length)) % governed.length;
    return {
      schemaVersion: 'vigia.response-capability-reconciliation.v1',
      checkedAt,
      governedIncidentCount: governed.length,
      selectedIncidentCount: selected.length,
      boundedLimit: this.maxIncidentsPerCycle,
      results,
      truthBoundary: 'This background cycle creates or refreshes governed information requirements and FieldNet tasking only. It does not dispatch, assign, authorize, or claim progress.'
    };
  }
}
