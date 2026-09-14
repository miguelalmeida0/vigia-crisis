import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFuelConnectivityGraph, buildInterventionCandidate } from '../src/fuel-connectivity-graph.mjs';
import { createPreventionMission, transitionPreventionMission } from '../src/prevention-mission.mjs';
import { createPreventionReview, preventionFindingVersion, preventionValidationMetrics } from '../src/prevention-review.mjs';

const finding={findingId:'finding:real-1',detectorVersion:'fuel_continuity_change_screen_v1',geometry:{type:'MultiPolygon',coordinates:[[[[-7.27,40.96],[-7.25,40.96],[-7.25,40.98],[-7.27,40.98],[-7.27,40.96]]]]},currentObservationId:'S2-current',comparisonObservationId:'S2-prior',affectedAreaHa:30.75,corridorLengthM:1664.4,structuresWithinPolicyRadius:3,nearestStructureM:42,roadCrossings:1,sourceQuality:{state:'PIXEL_VERIFIED',validPixelFraction:.98},terrainContext:{state:'MEASURED_LOCAL_CONTEXT'},landCoverContext:{state:'MEASURED_GEOMETRY_BOUND',dominantClass:'grassland'},roadContext:{intersectingRoadIds:['osm:way:1'],nearestCriticalAssets:[{id:'osm:asset:1',label:'Substation',distanceMeters:112}]},reviewContextBinding:{geometrySha256:'real-geometry-sha'}};

test('fuel connectivity graph binds every edge to persisted physical geometry',()=>{
  const graph=buildFuelConnectivityGraph(finding),again=buildFuelConnectivityGraph(finding);
  assert.equal(graph.version,again.version);assert.equal(graph.sceneProvenance.currentObservationId,'S2-current');assert.ok(graph.nodes.length>=5);assert.ok(graph.edges.every((edge)=>edge.physicalBasis&&edge.geometry.type==='LineString'));assert.equal(graph.assetRelation.mappedStructurePaths,3);assert.match(graph.quality.qualification,/not a fire-behavior/);
});

test('intervention candidate reports inspectable connectivity counterfactual without a fire-risk claim',()=>{
  const graph=buildFuelConnectivityGraph(finding),candidate=buildInterventionCandidate(finding,graph);
  assert.equal(candidate.graphVersion,graph.version);assert.equal(candidate.geometry.type,'LineString');assert.ok(candidate.affectedAssetPaths.after<candidate.affectedAssetPaths.before);assert.ok(candidate.connectivity.after.connectedFuelAreaHa<candidate.connectivity.before.connectedFuelAreaHa);assert.match(candidate.claimBoundary,/not fire-risk reduction/);assert.equal(candidate.reviewPriority.name,'INTERVENTION_REVIEW_PRIORITY');assert.ok(Number.isFinite(candidate.reviewPriority.score));
});

test('prevention mission requires attributable mitigation and post-intervention physical evidence',()=>{
  const candidate=buildInterventionCandidate(finding),created=createPreventionMission({id:'mission:1',findingId:finding.findingId,candidateVersion:candidate.version,graphVersion:candidate.graphVersion,place:'Mêda',coordinate:candidate.candidateBreakLocation,actorId:'expert:1'}),accepted=transitionPreventionMission(created,'EXPERT_ACCEPTED',{actorId:'expert:1',reason:'Candidate merits management review.'});
  assert.equal(accepted.state,'EXPERT_ACCEPTED');assert.throws(()=>transitionPreventionMission({...accepted,state:'OBSERVED'},'MITIGATION_REPORTED',{actorId:'field:1',reason:'Reported'}),/mitigation_evidence_required/);assert.throws(()=>transitionPreventionMission({...accepted,state:'POST_INTERVENTION_OBSERVATION_PENDING'},'VERIFIED_CHANGE',{actorId:'analyst:1',reason:'Looks different'}),/post_intervention_physical_evidence_required/);
});

test('prevention mission transitions preserve immutable identity and provenance',()=>{
  const candidate=buildInterventionCandidate(finding),created=createPreventionMission({id:'mission:immutable',findingId:finding.findingId,candidateVersion:candidate.version,graphVersion:candidate.graphVersion,place:'Mêda',coordinate:candidate.candidateBreakLocation,actorId:'expert:1'});
  const transitioned=transitionPreventionMission(created,'EXPERT_ACCEPTED',{actorId:'expert:1',reason:'Governed review accepted.',patch:{id:'mission:attacker',findingId:'finding:other',candidateVersion:'candidate:other',graphVersion:'graph:other',coordinate:[0,0],createdAt:'1900-01-01T00:00:00Z',events:[],verification:{claimBoundary:'overwritten'}}});
  assert.equal(transitioned.id,created.id);assert.equal(transitioned.findingId,created.findingId);assert.equal(transitioned.candidateVersion,created.candidateVersion);assert.equal(transitioned.graphVersion,created.graphVersion);assert.deepEqual(transitioned.coordinate,created.coordinate);assert.equal(transitioned.createdAt,created.createdAt);assert.equal(transitioned.verification.claimBoundary,created.verification.claimBoundary);assert.equal(transitioned.events.length,2);
});

test('expert validation separates finding truth, intervention review and adjudication',()=>{
  const base={findingId:finding.findingId,detectorVersion:finding.detectorVersion,modelVersion:finding.detectorVersion,findingVersion:preventionFindingVersion(finding),scenePair:{currentObservationId:'S2-current',comparisonObservationId:'S2-prior'},reviewerQualifications:['wildfire_prevention_domain_expert'],reason:'TRUE_FUEL_CONTINUITY_CHANGE',note:'Native pixels support the observed change.',graphVersion:'graph:1',candidateVersion:'candidate:1',reviewedAt:'2026-08-13T10:00:00Z'};
  const yes=createPreventionReview({...base,id:'review:1',reviewerType:'WILDFIRE_EXPERT_REVIEW',reviewerId:'expert:1',decision:'ACCEPT_CANDIDATE',interventionDecision:'YES',interventionReason:'The physical graph question merits field review.'}),no=createPreventionReview({...base,id:'review:2',reviewerType:'FORESTRY_EXPERT_REVIEW',reviewerId:'expert:2',decision:'ACCEPT_CANDIDATE',interventionDecision:'NO',interventionReason:'Mapped access context is insufficient.',reviewedAt:'2026-08-13T11:00:00Z'}),metrics=preventionValidationMetrics([finding],[yes,no]);
  assert.equal(yes.interventionDecision,'YES');assert.equal(no.interventionDecision,'NO');assert.equal(metrics.interventionReviewAcceptanceRate,.5);assert.equal(metrics.adjudicationQueue.length,1);assert.equal(metrics.interRaterAgreement,0);
});
