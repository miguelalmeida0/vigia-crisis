import { randomUUID } from 'node:crypto';
import { createIntervention, transitionIntervention } from '../../../../../packages/domain/src/intervention.mjs';
import { requireCoordinate, requireObject, requireText } from '../../shared/validation.mjs';

const HAZARD_KINDS = new Set(['combustible_residue', 'vegetation_encroachment', 'access_obstruction', 'other']);
const DECISIONS = new Set(['verified', 'rejected', 'uncertain']);

export class CommandService {
  constructor({ repository, auditService = null, clock = () => new Date(), onChanged = () => {} }) {
    this.repository = repository;
    this.auditService = auditService;
    this.clock = clock;
    this.onChanged = onChanged;
  }

  snapshot() {
    return this.repository.snapshot();
  }

  async confirmHazard(input) {
    requireObject(input);
    const now = this.clock().toISOString();
    const kind = HAZARD_KINDS.has(input.kind) ? input.kind : 'other';
    const hazard = {
      id: `hazard:${randomUUID()}`,
      candidateId: input.candidateId ? String(input.candidateId) : null,
      state: 'verified_hazard',
      physicalHazardConfirmed: true,
      kind,
      title: requireText(input.title, 'title', { max: 140 }),
      place: requireText(input.place, 'place', { max: 120 }),
      coordinate: requireCoordinate(input.coordinate),
      evidenceNote: requireText(input.evidenceNote, 'evidenceNote', { max: 800 }),
      evidence: {
        type: requireText(input.evidenceType, 'evidenceType', { max: 60 }),
        observer: requireText(input.observer, 'observer', { max: 120 }),
        observerRole: String(input.observerRole ?? '').slice(0, 120),
        observedAt: requireText(input.observedAt, 'observedAt', { max: 60 }),
        reference: String(input.evidenceReference ?? '').slice(0, 500)
      },
      recommendedAction: String(input.recommendedAction ?? 'Assign remediation, capture completion evidence and schedule re-observation.').slice(0, 800),
      priority: { score: Math.max(0, Math.min(100, Number(input.priorityScore ?? 88))), band: String(input.priorityBand ?? 'urgent'), components: {} },
      createdAt: now,
      updatedAt: now,
      createdBy: String(input.actor ?? 'local-operator'),
      provenance: ['Operator-verified field or imagery evidence']
    };
    await this.repository.mutate((state) => ({
      ...state,
      hazards: [hazard, ...state.hazards],
      audit: [{ type: 'hazard.verified', entityId: hazard.id, at: now, actor: hazard.createdBy }, ...state.audit].slice(0, 500)
    }));
    this.onChanged({ type: 'hazard.verified', hazard });
    return hazard;
  }

  async decideIncident(incidentId, input) {
    requireObject(input);
    const decision = String(input.decision ?? '');
    if (!DECISIONS.has(decision)) throw new TypeError('invalid_incident_decision');
    const now = this.clock().toISOString();
    const verifiedEvidence = decision === 'verified' ? {
      type: requireText(input.evidenceType, 'evidenceType', { max: 60 }),
      observer: requireText(input.observer, 'observer', { max: 120 }),
      observerRole: String(input.observerRole ?? '').slice(0, 120),
      observedAt: requireText(input.observedAt, 'observedAt', { max: 60 }),
      reference: String(input.evidenceReference ?? '').slice(0, 500)
    } : null;
    const record = {
      decision,
      note: String(input.note ?? '').slice(0, 800),
      evidence: verifiedEvidence,
      actor: String(input.actor ?? 'local-operator'),
      at: now
    };
    await this.repository.mutate((state) => ({
      ...state,
      incidentDecisions: { ...state.incidentDecisions, [String(incidentId)]: record },
      audit: [{ type: `incident.${decision}`, entityId: String(incidentId), at: now, actor: record.actor }, ...state.audit].slice(0, 500)
    }));
    this.onChanged({ type: 'incident.decision', incidentId: String(incidentId), record });
    return record;
  }

  async createIntervention(input) {
    requireObject(input);
    const intervention = createIntervention({
      id: `task:${randomUUID()}`,
      targetType: requireText(input.targetType, 'targetType', { max: 40 }),
      targetId: requireText(input.targetId, 'targetId', { max: 160 }),
      title: requireText(input.title, 'title', { max: 180 }),
      recommendation: String(input.recommendation ?? '').slice(0, 1000),
      priority: String(input.priority ?? 'elevated'),
      coordinate: input.coordinate ? requireCoordinate(input.coordinate) : null,
      createdAt: this.clock().toISOString(),
      actor: String(input.actor ?? 'local-operator')
    });
    await this.repository.mutate((state) => ({
      ...state,
      interventions: [intervention, ...state.interventions]
    }));
    this.onChanged({ type: 'intervention.created', intervention });
    return intervention;
  }

  async transitionIntervention(id, input) {
    requireObject(input);
    let updated;
    await this.repository.mutate((state) => {
      const index = state.interventions.findIndex((item) => item.id === id);
      if (index < 0) throw new Error('intervention_not_found');
      updated = transitionIntervention(state.interventions[index], requireText(input.state, 'state', { max: 40 }), {
        actor: String(input.actor ?? 'local-operator'),
        reason: String(input.note ?? 'operator_transition').slice(0, 500),
        at: this.clock().toISOString(),
        patch: input.assignee !== undefined ? { assignee: String(input.assignee || '').slice(0, 120) || null } : {}
      });
      const interventions = [...state.interventions];
      interventions[index] = updated;
      return { ...state, interventions };
    });
    this.onChanged({ type: 'intervention.updated', intervention: updated });
    return updated;
  }

  async addWatchPlace(input) {
    requireObject(input);
    const now = this.clock().toISOString();
    const place = {
      id: `watch:${randomUUID()}`,
      name: requireText(input.name, 'name', { max: 100 }),
      coordinate: requireCoordinate(input.coordinate),
      createdAt: now,
      actor: String(input.actor ?? 'local-operator')
    };
    await this.repository.mutate((state) => ({ ...state, watchPlaces: [place, ...state.watchPlaces].slice(0, 50) }));
    this.onChanged({ type: 'watch.created', place });
    return place;
  }

  async removeWatchPlace(id) {
    await this.repository.mutate((state) => ({ ...state, watchPlaces: state.watchPlaces.filter((item) => item.id !== id) }));
    this.onChanged({ type: 'watch.removed', id });
    return { id };
  }
  async watchEvent(id, actor='local-operator') {
    const eventId=String(id);
    await this.repository.mutate((state)=>({...state,watchedEventIds:[...new Set([...(state.watchedEventIds??[]),eventId])]}));
    await this.auditService?.record({actor:{id:String(actor),role:'operator'},type:'event.watch_started',entityType:'fire_event',entityId:eventId});
    this.onChanged({type:'event.watch_started',eventId}); return{eventId,watched:true};
  }

  async unwatchEvent(id, actor='local-operator') {
    const eventId=String(id);
    await this.repository.mutate((state)=>({...state,watchedEventIds:(state.watchedEventIds??[]).filter((item)=>item!==eventId)}));
    await this.auditService?.record({actor:{id:String(actor),role:'operator'},type:'event.watch_stopped',entityType:'fire_event',entityId:eventId});
    this.onChanged({type:'event.watch_stopped',eventId}); return{eventId,watched:false};
  }

}
