function eventRows(runtime){return runtime?.events?.events??[];}
function sourceRows(runtime){return runtime?.events?.sources??runtime?.bootstrap?.sources??{};}
function observations(event){return event?.physicalSourceProfile?.observationCount??event?.observations?.length??null;}
function change(category,entityId,label,from,to,basis,changedAt){return{id:`${category}:${entityId}:${changedAt}:${label}`,category,entityId,label,from:from??null,to:to??null,basis,changedAt};}

export function deriveRuntimeChanges(previous,current,changedAt=new Date().toISOString()){
  const before=eventRows(previous),after=eventRows(current),rows=[];
  if(before.length){
    const prior=new Map(before.map(item=>[String(item.id),item]));
    for(const item of after){
      const old=prior.get(String(item.id));
      if(!old){rows.push(change('NEW FACT',item.id,'New canonical event',null,item.label??item.id,'Event ID was absent from the prior canonical projection.',changedAt));continue;}
      const oldObs=observations(old),newObs=observations(item);
      if(item.lastSeenAt!==old.lastSeenAt||newObs!==oldObs)rows.push(change('NEW FACT',item.id,'Attributable evidence advanced',`${old.lastSeenAt??'time unavailable'} · ${oldObs??'count unmeasured'}`,`${item.lastSeenAt??'time unavailable'} · ${newObs??'count unmeasured'}`,'Provider observation time or attributable observation count changed.',changedAt));
      else{
        const oldView=old.candidateAssessment?.conclusion??old.knowledgeState??old.evidenceState;
        const newView=item.candidateAssessment?.conclusion??item.knowledgeState??item.evidenceState;
        if(oldView!==newView)rows.push(change('RECOMPUTED VIEW',item.id,'Assessment recomputed',oldView,newView,'No newer attributable observation was present; the derived view changed.',changedAt));
      }
    }
  }
  const priorSources=sourceRows(previous),nextSources=sourceRows(current);
  if(Object.keys(priorSources).length){for(const[key,item]of Object.entries(nextSources)){const old=priorSources[key],from=old?.state??(old?.configured===false?'not_configured':'unknown'),to=item?.state??(item?.configured===false?'not_configured':'unknown');if(old&&from!==to)rows.push(change('SOURCE STATUS CHANGE',key,`${item.label??key} status`,from,to,'Provider health state changed; this does not by itself assert a fire observation.',changedAt));}}
  return rows.slice(0,50);
}

export function humanDecisionChange({entityId,label,from=null,to,basis,changedAt=new Date().toISOString()}){return change('HUMAN DECISION',entityId,label,from,to,basis,changedAt);}

