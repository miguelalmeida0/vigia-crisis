import { semanticHash } from '../intelligence/shared.mjs';
import { rows } from './decision-work.mjs';
import { OPERATIONAL_WILDFIRE_CONTRACT_V1 } from './operational-contract.mjs';

// Only explicit subject/property assertions are comparable. No extraction from
// narrative text, nearby records or unlabeled geometry is attempted.
export function assertionContradictions(item,asOf) {
  const graph=item.evidenceGraph,assertions=[];
  for(const observation of rows(graph?.observations)){
    const assertion=observation.value?.assertion,source=rows(graph.sources).find(s=>s.id===observation.sourceId),evidence=rows(graph.evidence).find(e=>e.observationId===observation.id);
    const age=Date.parse(asOf)-Date.parse(observation.observedAt);
    if(!assertion?.subjectId||!['road_status','incident_status'].includes(assertion.property)||!Number.isFinite(age)||age<0||age>OPERATIONAL_WILDFIRE_CONTRACT_V1.freshness.maxAgeMs
      ||evidence?.contradictionStatus==='RESOLVED'||source?.status!=='ACTIVE'||!['VERIFIED','ATTRIBUTED'].includes(evidence?.provenanceStrength))continue;
    assertions.push({assertion,source,evidence,observation});
  }
  const result=[],opposites={road_status:[['OPEN','BLOCKED'],['OPEN','CLOSED']],incident_status:[['ACTIVE','EXTINGUISHED'],['ACTIVE','CLOSED']]};
  for(let i=0;i<assertions.length;i++)for(let j=i+1;j<assertions.length;j++){
    const a=assertions[i],b=assertions[j];
    if(a.source.id===b.source.id||a.assertion.subjectId!==b.assertion.subjectId||a.assertion.property!==b.assertion.property)continue;
    if(!opposites[a.assertion.property].some(pair=>pair.includes(a.assertion.value)&&pair.includes(b.assertion.value)&&a.assertion.value!==b.assertion.value))continue;
    if(rows(a.observation.value?.resolvesEventIds).includes(b.evidence.provenance?.operationalEventId)||rows(b.observation.value?.resolvesEventIds).includes(a.evidence.provenance?.operationalEventId))continue;
    const evidenceIds=[a.evidence.id,b.evidence.id].sort();
    result.push({id:semanticHash('explicit-assertion-conflict',{evidenceIds}),subject:a.assertion.subjectId,property:a.assertion.property,assertionA:a.assertion,assertionB:b.assertion,
      sourceA:a.source.id,sourceB:b.source.id,authorityRelationship:'Different attributable sources; authority never silently overrides a material disagreement.',freshnessRelationship:'Both assertions are inside the contract freshness window at the same as-of time.',
      severity:'HUMAN_REVIEW_REQUIRED',resolutionOptions:['Review the exact source assertions.','Admit an explicit supersession or attributable resolution.'],evidenceIds,automaticResolution:false});
  }
  return result;
}
