import {geographicContext} from '../../../../../packages/domain/src/operational-twin/geographic-context.mjs';
import {applicableIpmaWarnings} from '../../../../../packages/domain/src/operational-twin/warning-applicability.mjs';
import {incidentQuestions} from '../../../../../packages/domain/src/operational-twin/operator-questions.mjs';
import { canonicalIncidentId } from '../../../../../packages/domain/src/authorization.mjs';
import { incidentBriefing } from '../../../../../packages/domain/src/operational-twin/incident-briefing.mjs';
import { operationalSourceRegistry } from '../world/operational-source-registry.mjs';

/** Runs after the scoped physical projection. No extra provider acquisition or browser data assembly. */
export async function withIncidentBriefing(data,{twin,incidentId,world,service,asOf}) {
  if(!incidentId)return data;
  const physical=data.physicalWorld?.value?.incidents?.find(i=>canonicalIncidentId(i.incidentId)===canonicalIncidentId(incidentId));
  if(!physical)return {...data,incidentIntelligence:{state:'UNAVAILABLE',value:null,reason:'No authorized selected incident context.'}};
  const item=twin?.incidents?.find(i=>canonicalIncidentId(i.incident.id)===canonicalIncidentId(physical.incidentId));
  let spatial=null;try{spatial=await service?.project({physical,item})??null;}catch{spatial={state:'UNAVAILABLE',relationships:[],reason:'Geospatial context could not be read. Other incident observations remain available.'};}
  const sources=operationalSourceRegistry(world,asOf,service?.sourceRecords()??[]);
  const identity=data.canonicalIncident?.value?.incident??data.operationalTwin?.value?.incident??item?.incident;
  const district=identity?.operatorIdentity?.district??physical.district;
  if(world&&district){const direct=Array.isArray(world.directWarnings)?world.directWarnings:[],use=direct.length>0||world.sources?.ipmaWarnings?.state==='current';physical.warnings=applicableIpmaWarnings({records:use?direct:world.warnings,location:physical.location,district,source:world.sources?.[use?'ipmaWarnings':'warnings']??{},asOf});physical.district=district;physical.questions=incidentQuestions(physical);}
  physical.geographicContext=geographicContext({location:physical.location,features:(spatial?.relationships??[]).map(r=>r.feature),observedGeometry:spatial?.perimeter?.current,asOf});
  service?.situationService?.observePhysical({physical:{...physical,name:identity?.operatorIdentity?.label??identity?.label??identity?.name??physical.name,district:identity?.operatorIdentity?.district??physical.district,incidentObservedAt:identity?.openedAt??null},spatial,sources,asOf});
  return {...data,incidentIntelligence:{state:'READY',authority:'ATTRIBUTED_OBSERVATIONS_AND_DETERMINISTIC_RELATIONSHIPS',value:incidentBriefing({physical,sources,spatial,asOf})}};
}
