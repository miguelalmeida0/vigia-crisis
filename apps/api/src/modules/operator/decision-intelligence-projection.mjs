// Bound nested references at the API boundary, including query and history
// responses. The pure domain graph and persisted decision context remain whole.
export function boundedDecisionResponse(value) {
  if(Array.isArray(value))return value.slice(0,20).map(boundedDecisionResponse);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key,item])=>Array.isArray(item)
    ?[[key,item.slice(0,20).map(boundedDecisionResponse)],[`${key}Total`,item.length]]
    :[[key,boundedDecisionResponse(item)]]));
}
export function compactDecisionIntelligence(p) {
  return boundedDecisionResponse({schemaVersion:p.schemaVersion,asOf:p.asOf,informationDebt:p.informationDebt,
    graph:{coverage:{...p.graph.coverage,unknown:p.graph.coverage.unknown.slice(0,20),unknownTotal:p.graph.coverage.unknown.length,unknownUpstreamSourceCount:p.graph.coverage.unknownUpstreamSources.length,unknownUpstreamSources:p.graph.coverage.unknownUpstreamSources.slice(0,20),unknownUpstreamSourcesTotal:p.graph.coverage.unknownUpstreamSources.length},nodeCount:p.graph.nodes.length,edgeCount:p.graph.edges.length,reference:'/api/v10/operator/intelligence-query'},
    assessments:p.assessments.slice(0,3).map(a=>({incidentId:a.incidentId,transitionConditions:a.transitionConditions,
      gaps:a.gaps.map(g=>({...g,evidenceIds:g.evidenceIds.slice(0,10),evidenceIdsTotal:g.evidenceIds.length,availableCollectionOptions:g.availableCollectionOptions.slice(0,8),availableCollectionOptionsTotal:g.availableCollectionOptions.length})),
      collectionRecommendations:a.collectionRecommendations.slice(0,3).map(r=>({...r,evidenceIds:r.evidenceIds.slice(0,10),evidenceIdsTotal:r.evidenceIds.length})),collectionRecommendationsTotal:a.collectionRecommendations.length,
      contradictions:a.contradictions.slice(0,5).map(c=>({...c,assertionA:c.assertionA?{state:c.assertionA.state??c.assertionA.value,property:c.assertionA.property,observationId:c.assertionA.observationId}:null,assertionB:c.assertionB?{state:c.assertionB.state??c.assertionB.value,property:c.assertionB.property,observationId:c.assertionB.observationId}:null})),
      contradictionsTotal:a.contradictions.length,
      resolutionPath:{...a.resolutionPath,upstreamDependencies:a.resolutionPath.upstreamDependencies.slice(0,10),upstreamDependenciesTotal:a.resolutionPath.upstreamDependencies.length}})),assessmentsTotal:p.assessments.length,
    readiness:p.readiness.filter(r=>r.state!=='READY').slice(0,10).map(r=>({...r,blockers:r.blockers.slice(0,8),blockersTotal:r.blockers.length,evidenceIds:r.evidenceIds.slice(0,10),evidenceIdsTotal:r.evidenceIds.length})),readinessTotal:p.readiness.filter(r=>r.state!=='READY').length,
    temporal:{conditions:p.temporal.conditions.slice(0,10),conditionsTotal:p.temporal.conditions.length,elapsed:p.temporal.elapsed.slice(0,3),elapsedTotal:p.temporal.elapsed.length},
    coordination:{shared:p.coordination.shared.slice(0,5).map(s=>({dependencyId:s.dependencyId,label:s.label,type:s.type,incidentCount:s.incidentIds.length,dependentCount:s.dependentIds.length,state:s.state})),sharedTotal:p.coordination.shared.length,contention:p.coordination.contention.slice(0,5),contentionTotal:p.coordination.contention.length},
    briefs:p.briefs.slice(0,3).map(b=>({...b,evidenceIds:b.evidenceIds.slice(0,10),evidenceIdsTotal:b.evidenceIds.length})),briefsTotal:p.briefs.length,watches:p.watches.slice(0,10),watchesTotal:p.watches.length,
    invalidation:p.invalidation.slice(0,10),invalidationTotal:p.invalidation.length,
    inventory:{assessments:p.assessments.length,readiness:p.readiness.length,temporalConditions:p.temporal.conditions.length,watches:p.watches.length},truthBoundary:p.truthBoundary});
}
