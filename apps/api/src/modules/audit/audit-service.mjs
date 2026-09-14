import { createHash, randomUUID } from 'node:crypto';
import { assertCan } from '../../../../../packages/domain/src/authorization.mjs';
import {auditHash} from './audit-chain.mjs';

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

export class AuditService {
  constructor({ repository, actionStore = null, clock = () => new Date() }) { this.repository = repository; this.actionStore = actionStore; this.clock = clock; }

  async record({ actor, type, entityType, entityId, payload = {} }) {
    let event;
    await this.repository.mutate((state) => {
      const previous = state.audit?.[0]?.hash ?? 'GENESIS';
      const base = { id: `audit:${randomUUID()}`, at: this.clock().toISOString(), actorId: actor?.id ?? 'system', actorRole: actor?.role ?? 'system', type, entityType, entityId, payload, previousHash: previous };
      event = { ...base, hash: hash(JSON.stringify(base)) };
      return { ...state, audit: [event, ...(state.audit ?? [])].slice(0, 2_000) };
    },{fields:['audit'],returnSnapshot:false});
    const durability=await this.actionStore?.commitOperatorAction?.(event)??{persisted:false,state:'json_only'};
    return { ...event, durability };
  }

  list(actor, { limit = 100 } = {}) {
    assertCan(actor, 'read:evidence');
    return ((this.repository.snapshotFields?.(['audit'])??this.repository.snapshot()).audit ?? []).slice(0, Math.min(500, Number(limit) || 100));
  }

  verifyChain() {
    const events = (this.repository.snapshotFields?.(['audit'])??this.repository.snapshot()).audit ?? [];
    let failedIndex=null;
    const failures=[];
    events.forEach((event,index)=>{const{hash:eventHash,...base}=event,expectedHash=auditHash(base),expectedPreviousHash=events[index+1]?.hash??null,hashValid=typeof eventHash==='string'&&eventHash===expectedHash,linkValid=index===events.length-1||event.previousHash===expectedPreviousHash;if(!hashValid||!linkValid)failures.push({index,id:event.id??null,at:event.at??null,reason:!eventHash?'UNSIGNED_LEGACY_RECEIPT':!hashValid?'HASH_MISMATCH':'CHAIN_DISCONTINUITY',hashValid,linkValid,expectedHash,actualHash:eventHash??null,expectedPreviousHash,actualPreviousHash:event.previousHash??null,nextEntryId:events[index+1]?.id??null});});
    failedIndex=failures[0]?.index??null;
    return { valid:failures.length===0, count: events.length, head: events[0]?.hash ?? null, failedIndex, failureCount:failures.length, failures:failures.slice(0,20) };
  }
}
