import { randomUUID } from 'node:crypto';
import { assertCan, assertGlobalIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';
import { requireCoordinate, requireObject, requireText } from '../../shared/validation.mjs';

export class HazardService {
  constructor({ repository, auditService, clock = () => new Date(), onChanged = () => {} }) { this.repository = repository; this.auditService = auditService; this.clock = clock; this.onChanged = onChanged; }
  list(actor) { assertCan(actor, 'read:evidence');assertGlobalIncidentScope(actor);return this.repository.snapshot().hazards; }
  async verify(actor, input) {
    assertCan(actor, 'verify:hazard');assertGlobalIncidentScope(actor);requireObject(input); const state = this.repository.snapshot();
    const request = state.evidenceRequests.find((item) => item.id === input.evidenceRequestId && item.state === 'accepted');
    if (!request || request.targetId !== input.candidateId) throw new Error('accepted_evidence_required');
    const evidencePackage = state.evidencePackages.find((item) => item.id === request.evidencePackageId && item.state === 'accepted');
    if (!evidencePackage) throw new Error('accepted_evidence_package_required');
    const now = this.clock().toISOString();
    const hazard = {
      id: `hazard:${randomUUID()}`, candidateId: requireText(input.candidateId, 'candidateId', { max: 180 }), evidenceRequestId: request.id, evidencePackageId: evidencePackage.id,
      state: 'verified_hazard', physicalHazardConfirmed: true, kind: requireText(input.kind, 'kind', { max: 80 }),
      title: requireText(input.title, 'title', { max: 180 }), place: requireText(input.place, 'place', { max: 120 }), coordinate: requireCoordinate(input.coordinate ?? request.coordinate),
      evidenceNote: evidencePackage.note, recommendedAction: String(input.recommendedAction ?? 'Assign remediation and verify through re-observation.').slice(0, 1000),
      priority: { score: Math.max(0, Math.min(100, Number(input.priorityScore ?? 88))), band: String(input.priorityBand ?? 'urgent') },
      createdAt: now, updatedAt: now, createdBy: actor.id, provenance: [`Accepted evidence package ${evidencePackage.id}`]
    };
    await this.repository.mutate((current) => ({ ...current, hazards: [hazard, ...current.hazards] }));
    await this.auditService.record({ actor, type: 'hazard.verified', entityType: 'hazard', entityId: hazard.id, payload: { evidencePackageId: evidencePackage.id } });
    this.onChanged({ type: 'hazard.verified', hazard }); return hazard;
  }
}
