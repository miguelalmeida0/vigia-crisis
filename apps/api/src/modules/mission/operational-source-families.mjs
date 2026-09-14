export function operationalSourceFamilies({knowledge,roadState,at=new Date().toISOString()}={}){
 const now=Date.parse(at),families=new Map();
 const add=(family,evidence)=>{if(!families.has(family))families.set(family,[]);families.get(family).push(evidence);};
 const predicates={'capabilities.emergencyDepartment':'health','capabilities.fireResponse':'fire_civil_protection','designation.kind':'reception_designation'};
 for(const facts of knowledge?.factsByEntity?.values()??[])for(const f of facts){
  const family=predicates[f.predicate];if(!family||f.state!=='ACCEPTED'||f.supersededBy||f.universe&&f.universe!=='OPERATIONAL'||!['OWNER','OFFICIAL','MUNICIPAL','MUNICIPALITY','GOVERNMENT'].includes(f.source?.authority))continue;
  const source=knowledge.sourceCache.get(f.source.url),checked=Date.parse(source?.lastFetch),ttl=source?.pollIntervalMs??86400000;
  if(source?.status!=='AVAILABLE'||!Number.isFinite(checked)||checked>now||now-checked>ttl||f.validUntil&&Date.parse(f.validUntil)<=now||f.validFrom&&Date.parse(f.validFrom)>now)continue;
  if(f.predicate.startsWith('capabilities.')&&f.value!==true)continue;
  add(family,{factId:f.id,entityId:f.entityId,provider:f.source.provider,url:f.source.url,publishedAt:f.source.publishedAt??null,checkedAt:source.lastFetch});
 }
 const road=roadState?.context?.(at);if(road?.roadCoverage?.connected===true&&['PARTIAL','CURRENT'].includes(road.roadCoverage.state)&&Date.parse(road.roadCoverage.validUntil)>now&&road.roadReports?.some(r=>r.admitted===true))add('road_restrictions',{url:road.roadCoverage.sourceUrl,provider:road.roadCoverage.source,checkedAt:road.roadCoverage.checkedAt,accepted:road.roadReports.length});
 return {families:[...families].map(([family,evidence])=>({family,evidence:evidence.slice(0,3),acceptedFacts:evidence.length})),count:families.size,criterion:'Accepted non-scenario authoritative capability/designation facts or current official road observations; source refresh remains distinct from observation time.',sensingSubstitution:false};
}
