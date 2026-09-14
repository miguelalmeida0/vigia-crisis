import { randomUUID } from 'node:crypto';
import { assertCan, assertGlobalIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';
import { createEvidenceEnvelope } from '../../../../../packages/domain/src/evidence-envelope.mjs';
import { createRemediation, transitionRemediation } from '../../../../../packages/domain/src/remediation.mjs';
import { requireObject, requireText } from '../../shared/validation.mjs';

export class RemediationService {
  constructor({ repository, auditService, clock = () => new Date(), onChanged = () => {} }) { this.repository = repository; this.auditService = auditService; this.clock = clock; this.onChanged = onChanged; }
  list(actor) { assertCan(actor, 'read:evidence');assertGlobalIncidentScope(actor);return this.repository.snapshot().interventions; }

  async create(actor, input) {
    assertCan(actor, 'create:intervention');assertGlobalIncidentScope(actor);requireObject(input); const state = this.repository.snapshot();
    const hazard = state.hazards.find((item) => item.id === input.hazardId && item.state === 'verified_hazard'); if (!hazard) throw new Error('verified_hazard_required');
    const remediation = createRemediation({
      id: `remediation:${randomUUID()}`, hazardId: hazard.id, title: requireText(input.title, 'title', { max: 180 }), ownerId: requireText(input.ownerId, 'ownerId', { max: 100 }),
      priority: input.priority, dueAt: requireText(input.dueAt, 'dueAt', { max: 60 }), coordinate: hazard.coordinate, recommendation: input.recommendation ?? hazard.recommendedAction,
      createdAt: this.clock().toISOString(), createdBy: actor.id
    });
    await this.repository.mutate((current) => ({ ...current, interventions: [remediation, ...current.interventions] }));
    await this.auditService.record({ actor, type: 'remediation.created', entityType: 'remediation', entityId: remediation.id, payload: { hazardId: hazard.id, ownerId: remediation.ownerId } });
    this.onChanged({ type: 'remediation.created', remediation }); return remediation;
  }

  async transition(actor, id, input) {
    assertGlobalIncidentScope(actor);requireObject(input); const nextState = requireText(input.state, 'state', { max: 40 });
    if (['assigned', 'closed', 'verified'].includes(nextState)) assertCan(actor, nextState === 'closed' ? 'approve:closure' : 'create:intervention');
    else assertCan(actor, actor.role === 'field_inspector' ? 'submit:evidence' : 'create:intervention');
    let updated;
    await this.repository.mutate((state) => {
      const index = state.interventions.findIndex((item) => item.id === id); if (index < 0) throw new Error('remediation_not_found');
      updated = transitionRemediation(state.interventions[index], nextState, { actorId: actor.id, at: this.clock().toISOString(), ownerId: input.ownerId, note: input.note, completionEvidencePackageId: input.completionEvidencePackageId, reobservationId: input.reobservationId });
      const interventions = [...state.interventions]; interventions[index] = updated; return { ...state, interventions };
    });
    await this.auditService.record({ actor, type: `remediation.${nextState}`, entityType: 'remediation', entityId: id }); this.onChanged({ type: 'remediation.updated', remediation: updated }); return updated;
  }

  async submitCompletion(actor, id, input) {
    assertCan(actor, 'submit:evidence');assertGlobalIncidentScope(actor);requireObject(input); let remediation; let evidencePackage;
    await this.repository.mutate((state) => {
      const index = state.interventions.findIndex((item) => item.id === id); if (index < 0) throw new Error('remediation_not_found');
      remediation = state.interventions[index]; if (remediation.ownerId !== actor.id) throw new Error('forbidden');
      evidencePackage = createEvidenceEnvelope({ ...input, id: `evidence-package:${randomUUID()}`, requestId: `completion:${id}`, observerId: actor.id, observerRole: actor.role, receivedAt: this.clock().toISOString(), evidenceType: 'completion_evidence', coordinate: input.coordinate ?? remediation.coordinate });
      const updated = transitionRemediation(remediation, 'awaiting_reobservation', { actorId: actor.id, at: this.clock().toISOString(), completionEvidencePackageId: evidencePackage.id, note: input.note });
      const interventions = [...state.interventions]; interventions[index] = updated; remediation = updated;
      return { ...state, interventions, evidencePackages: [evidencePackage, ...state.evidencePackages] };
    });
    await this.auditService.record({ actor, type: 'remediation.completion_submitted', entityType: 'remediation', entityId: id, payload: { evidencePackageId: evidencePackage.id } });
    this.onChanged({ type: 'remediation.completion_submitted', remediation, evidencePackage }); return { remediation, evidencePackage };
  }

  async reobserve(actor, id, input) {
    assertCan(actor, 'approve:closure');assertGlobalIncidentScope(actor);requireObject(input); const outcome = String(input.outcome ?? ''); if (!['verified_removed', 'still_present', 'uncertain'].includes(outcome)) throw new Error('invalid_reobservation_outcome');
    let remediation; const attachments = (input.attachments ?? []).map((item) => ({ id: String(item.id ?? ''), type: String(item.type ?? 'image'), name: String(item.name ?? 're-observation'), url: String(item.url ?? ''), size: Number(item.size ?? 0) })).slice(0, 6);
    if (outcome === 'verified_removed' && !attachments.length) throw new Error('reobservation_evidence_required');
    const reobservation = { id: `reobservation:${randomUUID()}`, remediationId: id, outcome, observedAt: String(input.observedAt ?? this.clock().toISOString()), source: String(input.source ?? 'operator_review'), note: String(input.note ?? '').slice(0, 1000), actorId: actor.id, attachments };
    await this.repository.mutate((state) => {
      const index = state.interventions.findIndex((item) => item.id === id); if (index < 0) throw new Error('remediation_not_found');
      remediation = state.interventions[index];
      if (outcome === 'verified_removed') {
        remediation = transitionRemediation(remediation, 'verified', { actorId: actor.id, at: this.clock().toISOString(), reobservationId: reobservation.id, note: input.note });
        remediation = transitionRemediation(remediation, 'closed', { actorId: actor.id, at: this.clock().toISOString(), note: 'Closed after verified re-observation.' });
      } else if (remediation.state === 'awaiting_reobservation') remediation = transitionRemediation(remediation, 'in_progress', { actorId: actor.id, at: this.clock().toISOString(), note: input.note });
      const interventions = [...state.interventions]; interventions[index] = remediation;
      return { ...state, interventions, reobservations: [reobservation, ...state.reobservations] };
    });
    await this.auditService.record({ actor, type: `remediation.reobserved.${outcome}`, entityType: 'remediation', entityId: id, payload: { reobservationId: reobservation.id } });
    this.onChanged({ type: 'remediation.reobserved', remediation, reobservation }); return { remediation, reobservation };
  }
}
