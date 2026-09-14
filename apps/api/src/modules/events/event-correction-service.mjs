import { assertCan, assertIncidentScope, incidentInScope } from '../../../../../packages/domain/src/authorization.mjs';
import { requireObject } from '../../shared/validation.mjs';

function reason(value) { const clean = String(value ?? '').trim().slice(0, 1200); if (!clean) throw new Error('correction_reason_required'); return clean; }
export class EventCorrectionService {
  constructor({ eventRepository, auditService, clock = () => new Date(), onChanging=()=>{},onChanged = () => {},onChangeFailed=()=>{} }) { Object.assign(this, { eventRepository, auditService, clock,onChanging,onChanged,onChangeFailed }); }
  async list(actor) { assertCan(actor, 'read:evidence'); const corrections = await this.eventRepository.corrections(); return { corrections: corrections.filter((item) => incidentInScope(actor, item.sourceEventId) && (!item.targetEventId || incidentInScope(actor, item.targetEventId))) }; }
  async merge(actor, input) {
    assertCan(actor, 'correct:event_association'); requireObject(input); assertIncidentScope(actor, input.sourceEventId); assertIncidentScope(actor, input.targetEventId);
    const event={type:'event.association.correcting',correction:{sourceEventId:String(input.sourceEventId??''),targetEventId:String(input.targetEventId??'')}},correctionReason=reason(input.reason),changeLease=await this.onChanging(event);
    try{const correction = await this.eventRepository.mergeEvents({ sourceEventId: String(input.sourceEventId ?? ''), targetEventId: String(input.targetEventId ?? ''), actorId: actor.id, reason: correctionReason }, this.clock());await this.#record(actor, correction);await this.onChanged({ type: 'event.association.corrected', correction },changeLease);return correction;}catch(error){await this.onChangeFailed(event,changeLease);throw error;}
  }
  async split(actor, input) {
    assertCan(actor, 'correct:event_association'); requireObject(input); assertIncidentScope(actor, input.sourceEventId);
    const event={type:'event.association.correcting',correction:{sourceEventId:String(input.sourceEventId??'')}},ids = Array.isArray(input.observationIds) ? input.observationIds.map(String) : [],correctionReason=reason(input.reason),changeLease=await this.onChanging(event);
    try{const correction = await this.eventRepository.splitEvent({ sourceEventId: String(input.sourceEventId ?? ''), observationIds: ids, actorId: actor.id, reason: correctionReason }, this.clock());await this.#record(actor, correction);await this.onChanged({ type: 'event.association.corrected', correction },changeLease);return correction;}catch(error){await this.onChangeFailed(event,changeLease);throw error;}
  }
  async reject(actor, input) {
    assertCan(actor, 'correct:event_association'); requireObject(input); assertIncidentScope(actor, input.sourceEventId);
    const event={type:'event.association.correcting',correction:{sourceEventId:String(input.sourceEventId??'')}},correctionReason=reason(input.reason),changeLease=await this.onChanging(event);
    try{const correction = await this.eventRepository.rejectAssociation({ sourceEventId: String(input.sourceEventId ?? ''), observationId: String(input.observationId ?? ''), actorId: actor.id, reason: correctionReason }, this.clock());await this.#record(actor, correction);await this.onChanged({ type: 'event.association.corrected', correction },changeLease);return correction;}catch(error){await this.onChangeFailed(event,changeLease);throw error;}
  }
  async #record(actor, correction) {
    await this.auditService?.record({ actor, type: `event.association.${correction.kind}`, entityType: 'fire_event', entityId: correction.sourceEventId, payload: { targetEventId: correction.targetEventId, observationIds: correction.observationIds, reason: correction.reason } });
    return correction;
  }
}
