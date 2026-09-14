import { createHash } from 'node:crypto';

export function id(prefix, ...parts) { return `${prefix}:${createHash('sha256').update(parts.map(String).join('|')).digest('hex').slice(0, 32)}`; }
export function json(value) { return JSON.stringify(value ?? {}); }
export function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function normalizedFamily(value){return String(value??'').toLowerCase().replaceAll('-','_');}
export function observationMatchesOpportunity(observation,opportunity){
  if(!observation?.id||!Number.isFinite(Date.parse(observation.at??'')))return false;
  const sameFamily=normalizedFamily(observation.sourceFamily)===normalizedFamily(opportunity.source_family)||String(observation.sensorId??observation.sourceId??'')===opportunity.source_family;
  if(!sameFamily)return false;
  const at=Date.parse(observation.at),created=Date.parse(opportunity.created_at),expires=Date.parse(opportunity.expires_at),start=Date.parse(opportunity.window_start??''),end=Date.parse(opportunity.window_end??'');
  if(at<created||at>expires||(Number.isFinite(start)&&at<start)||(Number.isFinite(end)&&at>end))return false;
  const expectedProductId=opportunity.payload?.coverageAssumptions?.productId;
  if(opportunity.opportunity_type==='CONFIRMED_PROVIDER_PRODUCT'&&expectedProductId){
    const observedProductId=observation.provenance?.rawSourceProductId??observation.rawSourceProductId??null;
    return String(observedProductId??'')===String(expectedProductId);
  }
  return true;
}
export function alertMutationAlreadyApplied(current,{action,ownerActorId=null,resolutionCode=null,suppressUntil=null}={}){
  if(action==='ACKNOWLEDGE')return Boolean(current.acknowledged_at);
  if(['ASSIGN','REASSIGN'].includes(action))return current.lifecycle_state==='OWNED'&&String(current.owner_actor_id??'')===String(ownerActorId??'');
  if(action==='RESOLVE')return current.lifecycle_state==='RESOLVED'&&String(current.resolution_code??'')===String(resolutionCode??'');
  if(action==='SUPPRESS')return current.lifecycle_state==='SUPPRESSED'&&Number.isFinite(Date.parse(current.suppression_until??''))&&Date.parse(current.suppression_until)===Date.parse(suppressUntil??'');
  return false;
}
export function rowAlert(row) {
  if (!row) return null;
  return {
    id: row.id, subjectType: row.subject_type, subjectId: row.subject_id, eventId: row.canonical_event_id,
    territoryId: row.territory_id, policyId: row.policy_id, policyVersion: row.policy_version, alertType: row.alert_type,
    evidenceVersion: row.evidence_version, lifecycleState: row.lifecycle_state, priority: row.priority,
    title: row.title, reasonCode: row.reason_code, physicalState: row.physical_state, freshness: row.freshness,
    payload: row.payload, openedAt: row.opened_at?.toISOString?.() ?? row.opened_at,
    acknowledgeDueAt: row.acknowledge_due_at?.toISOString?.() ?? row.acknowledge_due_at,
    escalateAt: row.escalate_at?.toISOString?.() ?? row.escalate_at,
    acknowledgedAt: row.acknowledged_at?.toISOString?.() ?? row.acknowledged_at, acknowledgedBy: row.acknowledged_by,
    ownerActorId: row.owner_actor_id, suppressionUntil: row.suppression_until?.toISOString?.() ?? row.suppression_until,
    resolutionCode: row.resolution_code, resolvedAt: row.resolved_at?.toISOString?.() ?? row.resolved_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}
export async function writeAudit(client,{aggregateType,aggregateId,action,actorId,payload={},at}){
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[aggregateType,aggregateId]);
  const prior=await client.query('SELECT record_hash FROM operations_audit_record WHERE aggregate_type=$1 AND aggregate_id=$2 ORDER BY sequence DESC LIMIT 1 FOR UPDATE',[aggregateType,aggregateId]),previousHash=prior.rows[0]?.record_hash??null;
  const recordId=id('audit',aggregateType,aggregateId,action,at,previousHash??'genesis'),material={recordId,aggregateType,aggregateId,action,actorId,previousHash,payload,at},recordHash=`sha256:${createHash('sha256').update(canonical(material)).digest('hex')}`;
  await client.query('INSERT INTO operations_audit_record(id,aggregate_type,aggregate_id,action,actor_id,previous_hash,record_hash,payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) ON CONFLICT(id) DO NOTHING',[recordId,aggregateType,aggregateId,action,actorId,previousHash,recordHash,json(payload),at]);
  return{id:recordId,previousHash,recordHash};
}
