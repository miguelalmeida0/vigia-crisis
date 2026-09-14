import { isReadonly } from '../data/model.js';
import { button, link } from './html.js';
export function workActions(vm,task) {
  const inspect=task.raw.question?link('Inspect source checks',`open-collection-plan:${task.id}`):'';
  const attention=task.raw.humanAttention;if(isReadonly(vm)||!attention?.attentionId)return inspect;
  const id=encodeURIComponent(attention.attentionId),owned=['IN_PROGRESS','ESCALATED','OWNED','ACKNOWLEDGED'].includes(attention.state??attention.workState);
  if(!owned&&!attention.owner)return button('Assume ownership',`human-attention-assume:${id}`,{tone:'primary'})+inspect;
  return button('Reassign',`human-attention-reassign:${id}`,{tone:'primary'})+button('Escalate',`human-attention-escalate:${id}`)+button('Release ownership',`human-attention-release:${id}`)+inspect;
}
