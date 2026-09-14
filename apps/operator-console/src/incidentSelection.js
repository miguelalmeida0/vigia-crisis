function evidenceIds(entry){
  const intelligence=entry?.intelligence?.value??null,data=intelligence?.data??{},graph=data.evidenceGraph?.value??data.currentAssessment?.value?.evidenceGraph??null,buckets=data.evidenceBuckets?.value?.buckets??{};
  const graphIds=Array.isArray(graph?.evidence)?graph.evidence.map(item=>String(item?.id??item?.evidenceId??'')).filter(Boolean):[];
  const bucketIds=Object.values(buckets).flatMap(items=>Array.isArray(items)?items:[]).map(item=>String(item?.id??item?.evidenceId??'')).filter(Boolean);
  return new Set([...graphIds,...bucketIds]);
}

export function applyIncidentSelection(state,id){
  const next=String(id??'').trim();
  if(!next)return false;
  const changed=String(state.selectedIncidentId??'')!==next;
  if(changed){
    const memory={...(state.incidentWorkspaceMemory??{})},prior=state.selectedIncidentId;
    if(prior)memory[prior]={selectedEvidenceId:state.selectedEvidenceId??null,approvedQuestionId:state.approvedQuestionId??null,selectedOperationId:state.selectedOperationId??null};
    state.incidentWorkspaceMemory=Object.fromEntries(Object.entries(memory).slice(-50));
    const saved=Object.hasOwn(memory,next)?memory[next]:null;
    state.approvedQuestionId=saved?.approvedQuestionId??null;
    state.selectedOperationId=saved?.selectedOperationId??null;
  }
  state.selectedIncidentId=next;
  if(changed)state.selectedEvidenceId=state.incidentWorkspaceMemory?.[next]?.selectedEvidenceId??null;
  return changed;
}

export function revalidateSelectedEvidence(state,id,entry){
  if(String(state.selectedIncidentId??'')!==String(id??''))return false;
  const selected=String(state.selectedEvidenceId??'');
  if(!selected)return false;
  const allowed=evidenceIds(entry);
  if(allowed.has(selected))return false;
  state.selectedEvidenceId=null;
  return true;
}

export function createLatestIncidentRequestGuard(){
  let generation=0,active=null;
  return Object.freeze({
    start(id){
      active?.controller.abort();
      const request={id:String(id),generation:++generation,controller:new AbortController()};
      active=request;
      return request;
    },
    isCurrent(request){return Boolean(request&&active===request&&request.generation===generation&&!request.controller.signal.aborted);},
    complete(request){if(active!==request)return false;active=null;return true;},
    activeId(){return active?.id??null;},
    cancel(){active?.controller.abort();active=null;generation+=1;}
  });
}
