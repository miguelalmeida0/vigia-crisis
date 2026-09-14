import {canonicalIncidentId} from '../../../../../packages/domain/src/authorization.mjs';
import {informationRequirements, knowledgeStateFromSituation} from '../../../../../packages/domain/src/intelligence/information-requirements.mjs';
import {explainRequirement, nextVerificationTasks} from '../../../../../packages/domain/src/intelligence/collection-tasking.mjs';
import {requirementSourceIndex, requirementSources} from '../../../../../packages/domain/src/intelligence/collection-sources.mjs';
import {reconcileRequirements} from '../../../../../packages/domain/src/intelligence/collection-lifecycle.mjs';
import {previewKnowledgeImpact, previewRequestForRequirement} from '../../../../../packages/domain/src/intelligence/epistemic-impact.mjs';
import {knowledgeDelta, knowledgeEvents, requirementKnowledgeEvents} from '../../../../../packages/domain/src/intelligence/knowledge-events.mjs';

// Read-only collection intelligence over retained situation snapshots.
//
// It performs no external fetch, starts no acquisition, and writes no
// operational fact. The requirement lifecycle it maintains lives in memory,
// bounded per incident, and is rebuilt from the retained snapshots on restart -
// it is a read-side index, never a second source of operational truth.

const REQUIREMENT_CACHE_TTL_MS = 15_000;
const MAX_TRACKED_INCIDENTS = 32;

export class CollectionIntelligenceService {
  #cache = new Map();
  #retained = new Map();

  constructor({situationService, knowledgeService = null, clock = () => new Date()}) {
    if (!situationService) throw new Error('situation_service_required');
    this.situationService = situationService;
    this.knowledgeService = knowledgeService;
    this.clock = clock;
    this.metrics = {requirementReads: 0, taskingReads: 0, previews: 0, previewRejections: 0, cacheHits: 0};
  }

  #sources() {
    // Registered approved sources, decorated with the entity ids their accepted
    // provenance already covers so a source can be matched to a subject.
    const rows = [...(this.knowledgeService?.sourceCache?.values() ?? [])];
    if (!rows.length) return [];
    const byUrl = new Map();
    for (const entity of this.knowledgeService?.cache?.values() ?? []) {
      for (const provenance of Object.values(entity?.provenance ?? {}).flat()) {
        if (!provenance?.url) continue;
        if (!byUrl.has(provenance.url)) byUrl.set(provenance.url, new Set());
        byUrl.get(provenance.url).add(entity.id);
      }
    }
    return rows.map((source) => ({...source, provenanceEntityIds: [...(byUrl.get(source.url) ?? [])]}));
  }

  async #state(incidentId, at = null) {
    const id = canonicalIncidentId(incidentId);
    const view = await this.situationService.snapshot(id, at);
    if (!view.snapshot) return {view, state: null};
    const evaluatedAt = at ? view.snapshot.knownAt : this.clock().toISOString();
    return {view, state: knowledgeStateFromSituation(view.snapshot, {at: evaluatedAt}), snapshot: view.snapshot};
  }

  /** Information requirements for one incident, with lifecycle reconciliation. */
  async requirements(incidentId, {at = null, limit = 60} = {}) {
    const id = canonicalIncidentId(incidentId);
    const cacheKey = `${id}:${at ?? 'current'}:${limit}`;
    const cached = this.#cache.get(cacheKey);
    const now = this.clock().getTime();
    if (cached && cached.expiresAt > now) { this.metrics.cacheHits += 1; return cached.value; }

    const {view, state} = await this.#state(id, at);
    if (!state) return {state: view.state, requirements: [], reason: view.reason ?? null};
    this.metrics.requirementReads += 1;

    const generated = informationRequirements(state, {limit});
    // Historical reads never mutate the retained lifecycle: a replay must not
    // reopen or close a requirement that belongs to the current knowledge state.
    const lifecycle = at
      ? {requirements: generated.requirements, events: [], open: generated.requirements.length, resolved: 0, expired: 0}
      : reconcileRequirements({retained: this.#retained.get(id) ?? [], generated: generated.requirements, at: state.evaluatedAt});
    if (!at) {
      this.#retained.set(id, lifecycle.requirements);
      while (this.#retained.size > MAX_TRACKED_INCIDENTS) this.#retained.delete(this.#retained.keys().next().value);
    }

    const sources = this.#sources();
    const sourceIndex = requirementSourceIndex({requirements: lifecycle.requirements}, {sources, at: state.evaluatedAt});
    const value = Object.freeze({
      ...generated,
      mode: view.mode,
      requirements: lifecycle.requirements.map((requirement) => ({...requirement, sourceTasking: sourceIndex.get(requirement.id) ?? null})),
      lifecycle: {open: lifecycle.open, resolved: lifecycle.resolved, expired: lifecycle.expired, events: lifecycle.events},
      readOnly: true,
      externalFetches: 0,
      operationalWrites: 0
    });
    this.#cache.set(cacheKey, {value, expiresAt: now + REQUIREMENT_CACHE_TTL_MS});
    while (this.#cache.size > MAX_TRACKED_INCIDENTS * 3) this.#cache.delete(this.#cache.keys().next().value);
    return value;
  }

  /** Ordered next-verification tasks with their explicit factors and reasons. */
  async tasks(incidentId, {at = null, limit = 10} = {}) {
    const requirements = await this.requirements(incidentId, {at});
    if (!requirements.requirements) return requirements;
    this.metrics.taskingReads += 1;
    const index = new Map(requirements.requirements.map((requirement) => [requirement.id, requirement.sourceTasking]));
    return nextVerificationTasks(requirements, {sourcesByRequirementId: index, limit});
  }

  /** One requirement with its deterministic causal explanation and preview offer. */
  async requirement(incidentId, requirementId, {at = null} = {}) {
    const requirements = await this.requirements(incidentId, {at});
    const found = (requirements.requirements ?? []).find((row) => row.id === requirementId);
    if (!found) throw Object.assign(new Error('information_requirement_not_found'), {statusCode: 404});
    return Object.freeze({
      schemaVersion: 'vigia.information-requirement-detail.v1',
      requirement: found,
      explanation: explainRequirement(found, {sourceTasking: found.sourceTasking}),
      availablePreview: previewRequestForRequirement(found),
      readOnly: true
    });
  }

  /** Approved registered sources that could answer one requirement. */
  async sources(incidentId, requirementId, {at = null} = {}) {
    const detail = await this.requirement(incidentId, requirementId, {at});
    return requirementSources(detail.requirement, {sources: this.#sources(), at: this.clock().toISOString()});
  }

  /** Knowledge-impact preview. Never writes; the assumption dies with the response. */
  async preview(incidentId, request, {at = null} = {}) {
    const {view, snapshot} = await this.#state(incidentId, at);
    if (!snapshot) return {state: view.state, reason: view.reason ?? null};
    try {
      const result = previewKnowledgeImpact(snapshot, request, {at: at ? snapshot.knownAt : this.clock().toISOString()});
      this.metrics.previews += 1;
      return result;
    } catch (error) {
      this.metrics.previewRejections += 1;
      throw error;
    }
  }

  /**
   * What VIGIA learned over a window, and what changed because it learned it.
   * Reads only retained captures; it never joins a newer fact onto an older one.
   */
  async knowledgeChanges(incidentId, {since = null} = {}) {
    const id = canonicalIncidentId(incidentId);
    const to = this.clock().toISOString();
    const from = since ?? new Date(this.clock().getTime() - 3600_000).toISOString();
    if (!Number.isFinite(Date.parse(from)) || Date.parse(from) > Date.parse(to)) throw Object.assign(new Error('knowledge_window_invalid'), {statusCode: 400});
    const [before, after] = await Promise.all([this.situationService.snapshot(id, from), this.situationService.snapshot(id, null)]);
    if (!after.snapshot) return {state: after.state, events: [], reason: after.reason ?? null};
    const events = before.snapshot ? knowledgeEvents(before.snapshot, after.snapshot) : {state: 'HISTORY_UNAVAILABLE', events: []};
    const lifecycleEvents = requirementKnowledgeEvents({events: (await this.requirements(id)).lifecycle?.events ?? []});
    return Object.freeze({
      ...knowledgeDelta({events: events.events, lifecycleEvents, from, to}),
      state: events.state,
      incidentId: id,
      worldChangeCount: events.worldChangeCount ?? 0,
      historyBoundary: 'Compares two retained captures. Snapshots are never rewritten with facts learned after they were taken.'
    });
  }
}
