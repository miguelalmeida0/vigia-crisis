import { createHash } from 'node:crypto';

const fingerprint=record=>createHash('sha256').update(JSON.stringify([record.source,record.observedAt,record.geometry])).digest('hex');
/** Persist only already-admitted observations. Conflicting same-time revisions are retained, never averaged. */
export async function retainPerimeterObservation(repository,incidentId,current){
  if(!repository)return{previous:null,conflicting:false,state:'HISTORY_UNAVAILABLE'};
  for(let attempt=0;attempt<3;attempt++){
    const stored=await repository.getObject('PERIMETER_OBSERVATION_HISTORY',incidentId);
    const records=stored?.payload?.records??[],key=fingerprint(current);
    const next=records.some(r=>fingerprint(r)===key)?records:[...records,current].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt)).slice(-24);
    if(next!==records){
      try{await repository.putObject('PERIMETER_OBSERVATION_HISTORY',incidentId,{schemaVersion:'vigia.perimeter-observation-history.v1',records:next},{incidentId,knowledgeTime:current.receivedAt??current.observedAt,expectedRevision:stored?.revision??0});}
      catch(error){if(attempt<2&&/revision|conflict/i.test(error.message))continue;throw error;}
    }
    const same=next.filter(r=>r.source===current.source&&r.observedAt===current.observedAt);
    const older=next.filter(r=>r.source===current.source&&Date.parse(r.observedAt)<Date.parse(current.observedAt));
    const previous=older.at(-1)??null,previousConflicting=previous&&new Set(older.filter(r=>r.observedAt===previous.observedAt).map(fingerprint)).size>1;
    return{previous:previousConflicting?null:previous,conflicting:new Set(same.map(fingerprint)).size>1,state:'PERSISTED'};
  }
  throw new Error('perimeter_history_revision_conflict');
}
