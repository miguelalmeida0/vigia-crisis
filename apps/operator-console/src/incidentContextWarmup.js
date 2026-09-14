const warmed=new Set(),inFlight=new Map();let queue=Promise.resolve();

function projections(api,id){
  return[
    ()=>api.operatorIncident(id),
    ()=>api.operatorIntelligence(id),
    ()=>api.operatorEvidenceDebt(id),
    ()=>api.operatorOperations(id)
  ];
}

async function captured(request){
  const attemptedAt=new Date().toISOString();
  try{return{ok:true,value:await request(),attemptedAt};}
  catch(error){return{ok:false,value:null,attemptedAt,error:String(error?.message??error).slice(0,200)};}
}

async function warm(api,id,accept){
  const startedAt=new Date().toISOString(),keys=['detail','intelligence','debt','operations'],values=await Promise.all(projections(api,id).map(captured)),results=Object.fromEntries(keys.map((key,index)=>[key,values[index]])),payload={id,startedAt,results};
  if(values.every(result=>result.ok))warmed.add(id);
  accept?.(payload);
  return payload;
}

export function warmIncidentContext(api,incidentIds=[],accept=null){
  const requests=[];
  for(const rawId of incidentIds){
    const id=String(rawId??'').trim();
    if(!id||warmed.has(id))continue;
    if(!inFlight.has(id)){const request=queue.then(()=>warm(api,id,accept));queue=request.catch(()=>null);inFlight.set(id,request.finally(()=>inFlight.delete(id)));}
    requests.push(inFlight.get(id));
  }
  return Promise.allSettled(requests);
}
