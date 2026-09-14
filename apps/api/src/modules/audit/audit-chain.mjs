import {createHash,randomUUID} from 'node:crypto';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const auditHash=base=>createHash('sha256').update(JSON.stringify(base.hashVersion==='canonical-v1'?canonical(base):base)).digest('hex');
export function sealAuditReceipt(receipt,previousHash='GENESIS'){
 const base={id:receipt.id??`audit:${randomUUID()}`,at:receipt.at??receipt.createdAt??new Date().toISOString(),actorId:receipt.actorId??'system',actorRole:receipt.actorRole??'system',type:receipt.type??receipt.eventType??receipt.action??'operational.receipt',entityType:receipt.entityType??'operational_receipt',entityId:receipt.entityId??receipt.incidentId??receipt.workflowId??null,payload:receipt,previousHash,hashVersion:'canonical-v1'};
 return {...base,hash:auditHash(base)};
}
// Only normalize newly added unsigned receipts. Retained historical evidence is
// neither reordered nor rehashed, including legacy discontinuities.
export function sealNewAuditReceipts(previous=[],next=[]){
 const retained=new Map();for(const e of previous){const key=JSON.stringify(e);retained.set(key,(retained.get(key)??0)+1);}
 const added=[],kept=[];for(const e of next){const key=JSON.stringify(e),count=retained.get(key)??0;if(count){retained.set(key,count-1);kept.push(e);}else if(!e.hash)added.push(e);else kept.push(e);}
 if(!added.length)return next;
 let result=kept;
 for(const receipt of added)result=[sealAuditReceipt(receipt,result[0]?.hash??'GENESIS'),...result];
 return result;
}
