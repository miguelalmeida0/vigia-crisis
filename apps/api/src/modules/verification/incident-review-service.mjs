import { assertCan, assertIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';
import { requireObject } from '../../shared/validation.mjs';

export class IncidentReviewService {
  constructor({ repository, auditService, clock = () => new Date(), onChanged = () => {} }) { this.repository = repository; this.auditService = auditService; this.clock = clock; this.onChanged = onChanged; }
  async review(actor, incidentId, input) {
    assertCan(actor, 'review:incident'); assertIncidentScope(actor, incidentId); requireObject(input); const decision = String(input.decision ?? '');
    if (!['verified', 'rejected', 'uncertain'].includes(decision)) throw new Error('invalid_incident_decision');
    const state = this.repository.snapshot();
    if (decision === 'verified') {
      const accepted = state.evidenceRequests.find((item) => item.targetId === `incident:${incidentId}` && item.state === 'accepted');
      if (!accepted) throw new Error('accepted_evidence_required');
    }
    const record = { decision, note: String(input.note ?? '').slice(0, 1200), actor: actor.id, at: this.clock().toISOString(), evidenceRequestId: input.evidenceRequestId ?? null };
    await this.repository.mutate((current) => ({ ...current, incidentDecisions: { ...current.incidentDecisions, [String(incidentId)]: record } }));
    await this.auditService.record({ actor, type: `incident.${decision}`, entityType: 'incident', entityId: String(incidentId), payload: { note: record.note } });
    this.onChanged({ type: 'incident.reviewed', incidentId, record }); return record;
  }
}
