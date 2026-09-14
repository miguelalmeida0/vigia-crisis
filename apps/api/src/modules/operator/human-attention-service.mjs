import { randomUUID } from 'node:crypto';
import { assertCan,incidentInScope } from '../../../../../packages/domain/src/authorization.mjs';

import { captureDecisionContext } from '../../../../../packages/domain/src/operational-twin/decision-context.mjs';

const rows=value=>Array.isArray(value)?value:[];
const ACTIONS=new Set(['ASSUME_OWNERSHIP','REASSIGN','ESCALATE','RELEASE_OWNERSHIP']);
const inScope=(actor,item)=>rows(item?.affectedIncidentIds).length?item.affectedIncidentIds.some(id=>incidentInScope(actor,id)):incidentInScope(actor,item?.incidentId);

export class HumanAttentionService{
  constructor({repository,operationalIntelligenceService,operationalRecoveryService,clock=()=>new Date()}={}){
    if(!repository||!operationalIntelligenceService||!operationalRecoveryService)throw new Error('human_attention_dependencies_required');
    Object.assign(this,{repository,operationalIntelligenceService,operationalRecoveryService,clock});
  }
  async snapshot(actor){
    assertCan(actor,'read:incident_command');
    const twin=await this.operationalIntelligenceService.getCurrentTwin(),recovery=await this.operationalRecoveryService.project(twin),items=rows(recovery.humanAttention?.items).filter(item=>inScope(actor,item)).map(item=>({...item,affectedIncidentIds:rows(item.affectedIncidentIds).filter(id=>incidentInScope(actor,id))})),pending=items.filter(item=>item.state==='ACKNOWLEDGEMENT_REQUIRED'),myWork=items.filter(item=>String(item.owner??'')===String(actor.id)||String(item.owner??'')===String(actor.name??''));
    return{...recovery.humanAttention,count:pending.length,acknowledgedCount:items.length-pending.length,myWorkCount:myWork.length,total:items.length,items};
  }
  async acknowledge(actor,attentionId,input={}){
    const result=await this.action(actor,attentionId,{...input,action:'ASSUME_OWNERSHIP',idempotencyKey:input.idempotencyKey??input.acknowledgementId??`legacy-ack:${attentionId}:${actor.id}`});
    return{schemaVersion:'vigia.human-attention-acknowledgement-result.v2',state:result.idempotent?'ALREADY_ACKNOWLEDGED':'ACKNOWLEDGED',acknowledgement:result.workItem,receipt:result.receipt,counters:result.counters,truthBoundary:result.truthBoundary};
  }
  async action(actor,attentionId,input={}){
    assertCan(actor,'command:incident');
    const action=String(input.action??'').toUpperCase();if(!ACTIONS.has(action))throw Object.assign(new Error('human_attention_action_invalid'),{statusCode:400});
    const projection=await this.snapshot(actor),item=projection.items.find(entry=>entry.attentionId===attentionId);if(!item)throw Object.assign(new Error('human_attention_item_not_found'),{statusCode:404});
    const idempotencyKey=String(input.idempotencyKey??'').trim();if(!idempotencyKey)throw Object.assign(new Error('human_attention_idempotency_key_required'),{statusCode:400});
    const before=this.repository.snapshot(),duplicate=rows(before.humanAttentionActions).find(entry=>entry.idempotencyKey===idempotencyKey);
    if(duplicate){const current=rows(before.humanAttentionWorkStates).find(entry=>entry.attentionId===attentionId)??null;return{schemaVersion:'vigia.human-attention-action-result.v1',state:current?.state??item.state,idempotent:true,workItem:current,receipt:duplicate.receipt,counters:{needsAttention:projection.count,myWork:projection.myWorkCount},truthBoundary:projection.truthBoundary};}
    const now=this.clock().toISOString(),actorId=String(actor.id),actorLabel=String(actor.name??actor.id),prior=rows(before.humanAttentionWorkStates).find(entry=>entry.attentionId===attentionId)??null;
    if(action==='REASSIGN'&&!String(input.owner??'').trim())throw Object.assign(new Error('human_attention_reassignment_owner_required'),{statusCode:400});
    if(action==='ESCALATE'&&!String(input.reason??'').trim())throw Object.assign(new Error('human_attention_escalation_reason_required'),{statusCode:400});
    const nextState=action==='RELEASE_OWNERSHIP'?'ACKNOWLEDGEMENT_REQUIRED':action==='ESCALATE'?'ESCALATED':'IN_PROGRESS',owner=action==='RELEASE_OWNERSHIP'?null:action==='REASSIGN'?String(input.owner).trim():prior?.owner??actorLabel,acknowledgedAt=action==='RELEASE_OWNERSHIP'?null:prior?.acknowledgedAt??now,history=[...rows(prior?.history),{action,state:nextState,at:now,actorId,owner,reason:input.reason?String(input.reason):null}].slice(-100),workItem={schemaVersion:'vigia.human-attention-work-state.v1',attentionId,state:nextState,status:nextState,owner,ownerId:action==='REASSIGN'?String(input.owner).trim():action==='RELEASE_OWNERSHIP'?null:actorId,acknowledgedAt,assignedAt:action==='RELEASE_OWNERSHIP'?null:prior?.assignedAt??now,updatedAt:now,deadline:item.deadline,sla:item.sla,nextAction:item.nextAction,assignment:owner?{owner,assignedAt:now,assignedBy:actorId}:null,affectedIncidentIds:item.affectedIncidentIds,resolverJobIds:item.resolverJobIds,history,truthEffect:'WORK_STATE_ONLY'},receipt={schemaVersion:'vigia.human-attention-action-receipt.v1',receiptId:`attention-action:${randomUUID()}`,attentionId,action,idempotencyKey,beforeState:prior?.state??item.state,afterState:nextState,owner,at:now,actorId,truthEffect:'WORK_STATE_ONLY'},actionRecord={schemaVersion:'vigia.human-attention-action.v1',idempotencyKey,attentionId,action,at:now,actorId,receipt};
    const decisionTwin=typeof this.operationalIntelligenceService.getTwinAsOf==='function'?await this.operationalIntelligenceService.getTwinAsOf(now):await this.operationalIntelligenceService.getCurrentTwin();
    if(Date.parse(decisionTwin.asOf)>Date.parse(now))throw Object.assign(new Error('decision_context_future_information'),{statusCode:409});
    actionRecord.decisionContext=captureDecisionContext({twin:decisionTwin,actor,incidentId:item.incidentId,action,reason:input.reason,alternativesRejected:input.alternativesRejected});
    await this.repository.mutate(state=>({...state,humanAttentionWorkStates:[...rows(state.humanAttentionWorkStates).filter(entry=>entry.attentionId!==attentionId),workItem],humanAttentionActions:[...rows(state.humanAttentionActions),actionRecord],materialEventAcknowledgements:action==='ASSUME_OWNERSHIP'?[...rows(state.materialEventAcknowledgements),{schemaVersion:'vigia.human-attention-acknowledgement.v2',acknowledgementId:receipt.receiptId,attentionId,incidentId:item.incidentId,resolverJobId:item.resolverJobId,decision:'REVIEWED_AND_ASSUMED_OWNERSHIP',owner,acknowledgedAt,acknowledgedBy:actorId,universe:'LIVE_PRODUCTION',truthEffect:'WORK_STATE_ONLY'}]:rows(state.materialEventAcknowledgements),audit:[...rows(state.audit),{type:action==='ASSUME_OWNERSHIP'?'HUMAN_ATTENTION_ACKNOWLEDGED':`HUMAN_ATTENTION_${action}`,at:now,actorId,attentionId,affectedIncidentIds:item.affectedIncidentIds,receiptId:receipt.receiptId}]}));
    const actorNames=new Set([String(actor.id),String(actor.name??'')].filter(Boolean)),wasPending=item.state==='ACKNOWLEDGEMENT_REQUIRED',isPending=nextState==='ACKNOWLEDGEMENT_REQUIRED',wasMine=actorNames.has(String(item.owner??'')),isMine=actorNames.has(String(owner??'')),counters={needsAttention:Math.max(0,projection.count+Number(isPending)-Number(wasPending)),myWork:Math.max(0,projection.myWorkCount+Number(isMine)-Number(wasMine))};return{schemaVersion:'vigia.human-attention-action-result.v1',state:nextState,idempotent:false,workItem,receipt,counters,truthBoundary:projection.truthBoundary};
  }
}
