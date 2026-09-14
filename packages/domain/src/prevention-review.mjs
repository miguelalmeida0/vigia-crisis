import { createHash } from 'node:crypto';

const DECISIONS = new Set(['ACCEPT_CANDIDATE', 'REJECT_CANDIDATE', 'ABSTAIN']);
const INTERVENTION_DECISIONS = new Set(['YES', 'NO', 'ABSTAIN']);
const REVIEWER_TYPES = new Set(['DEVELOPER_REVIEW','REMOTE_SENSING_EXPERT_REVIEW','WILDFIRE_EXPERT_REVIEW','FORESTRY_EXPERT_REVIEW','DOMAIN_EXPERT_REVIEW']);
const EXPERT_REVIEWER_TYPES = new Set(['REMOTE_SENSING_EXPERT_REVIEW','WILDFIRE_EXPERT_REVIEW','FORESTRY_EXPERT_REVIEW','DOMAIN_EXPERT_REVIEW']);
const REASONS = new Set([
  'PHYSICAL_CHANGE_SUPPORTED',
  'TRUE_FUEL_CONTINUITY_CHANGE',
  'SEASONAL_VEGETATION',
  'AGRICULTURE',
  'FORESTRY_OPERATION',
  'CLEARING',
  'REGISTRATION_ERROR',
  'REGISTRATION_FAILURE',
  'CLOUD_SHADOW',
  'LAND_COVER_CONFUSION',
  'ASSET_MAP_ERROR',
  'STRUCTURE_MAP_ERROR',
  'INSUFFICIENT_RESOLUTION',
  'OTHER'
]);

function required(value, code) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(code);
  return text;
}

export function preventionFindingVersion(finding = {}) {
  const physicalState = {
    findingId:finding.findingId, detectorVersion:finding.detectorVersion, geometry:finding.geometry,
    currentObservationId:finding.currentObservationId, comparisonObservationId:finding.comparisonObservationId,
    affectedAreaHa:finding.affectedAreaHa, corridorLengthM:finding.corridorLengthM,
    nearestStructureM:finding.nearestStructureM, structuresWithinPolicyRadius:finding.structuresWithinPolicyRadius,
    sourceQuality:finding.sourceQuality, firstObservableInterval:finding.firstObservableInterval,
    roadCrossings:finding.roadCrossings,criticalAssetProximityM:finding.criticalAssetProximityM,
    terrainContext:finding.terrainContext,landCoverContext:finding.landCoverContext,
    reviewContextBinding:finding.reviewContextBinding
  };
  return `finding-v2:${createHash('sha256').update(JSON.stringify(physicalState)).digest('hex')}`;
}

export function createPreventionReview(input = {}) {
  const decision = required(input.decision, 'prevention_review_decision_required');
  const reviewerType = required(input.reviewerType, 'prevention_reviewer_type_required');
  const reason = required(input.reason, 'prevention_review_reason_required');
  if (!DECISIONS.has(decision)) throw new Error('invalid_prevention_review_decision');
  if (!REVIEWER_TYPES.has(reviewerType)) throw new Error('invalid_prevention_reviewer_type');
  if (!REASONS.has(reason)) throw new Error('invalid_prevention_review_reason');
  const interventionDecision=String(input.interventionDecision??'ABSTAIN').trim().toUpperCase();
  if(!INTERVENTION_DECISIONS.has(interventionDecision))throw new Error('invalid_intervention_review_decision');
  return {
    id: required(input.id, 'prevention_review_id_required'),
    findingId: required(input.findingId, 'prevention_review_finding_required'),
    detectorVersion: required(input.detectorVersion, 'prevention_review_detector_version_required'),
    modelVersion: required(input.modelVersion ?? input.detectorVersion, 'prevention_review_model_version_required'),
    findingVersion: required(input.findingVersion, 'prevention_review_finding_version_required'),
    scenePair: {
      currentObservationId: required(input.scenePair?.currentObservationId, 'prevention_review_current_scene_required'),
      comparisonObservationId: required(input.scenePair?.comparisonObservationId, 'prevention_review_comparison_scene_required')
    },
    reviewerType,
    reviewerId: required(input.reviewerId, 'prevention_reviewer_id_required'),
    reviewerQualifications: [...new Set((input.reviewerQualifications ?? []).map(String).map((value) => value.trim()).filter(Boolean))].slice(0, 12),
    decision,
    reason,
    note: String(input.note ?? '').trim().slice(0, 1600),
    organization:String(input.organization??'').trim().slice(0,160),
    graphVersion:String(input.graphVersion??'UNAVAILABLE_LEGACY_REVIEW'),
    candidateVersion:String(input.candidateVersion??'UNAVAILABLE_LEGACY_REVIEW'),
    interventionDecision,
    interventionReason:String(input.interventionReason??input.note??reason).trim().slice(0,1600),
    sourceQuality: structuredClone(input.sourceQuality ?? {}),
    landCoverContext: structuredClone(input.landCoverContext ?? { state:'UNMEASURED' }),
    reviewedAt: new Date(required(input.reviewedAt, 'prevention_review_time_required')).toISOString()
  };
}

export function preventionValidationMetrics(findings = [], reviews = []) {
  const currentVersions = new Map(findings.map((item) => [item.findingId, {detectorVersion:item.detectorVersion,findingVersion:preventionFindingVersion(item)}]));
  const applicable = reviews.filter((item) => {const current=currentVersions.get(item.findingId);return current?.detectorVersion===item.detectorVersion&&item.findingVersion===current.findingVersion;});
  const developer = applicable.filter((item) => item.reviewerType === 'DEVELOPER_REVIEW');
  const expert = applicable.filter((item) => EXPERT_REVIEWER_TYPES.has(item.reviewerType));
  const expertDecided = expert.filter((item) => item.decision !== 'ABSTAIN');
  const developerDecided = developer.filter((item) => item.decision !== 'ABSTAIN');
  const accepted = (rows) => rows.filter((item) => item.decision === 'ACCEPT_CANDIDATE').length;
  const rejected = (rows) => rows.filter((item) => item.decision === 'REJECT_CANDIDATE').length;
  const abstained = (rows) => rows.filter((item) => item.decision === 'ABSTAIN').length;
  const reasons = Object.fromEntries([...REASONS].map((reason) => [reason, applicable.filter((item) => item.reason === reason).length]));
  const expertIntervention=expert.filter((item)=>item.interventionDecision&&item.interventionDecision!=='ABSTAIN');
  const interventionAccepted=expertIntervention.filter((item)=>item.interventionDecision==='YES').length;
  const byFinding=new Map();for(const review of expert){const rows=byFinding.get(review.findingId)??[];rows.push(review);byFinding.set(review.findingId,rows);}
  const disagreements=[...byFinding.entries()].filter(([,rows])=>new Set(rows.map((item)=>`${item.decision}:${item.interventionDecision??'ABSTAIN'}`)).size>1).map(([findingId,rows])=>({findingId,reviewIds:rows.map((item)=>item.id),state:'ADJUDICATION_REQUIRED'}));
  const comparablePairs=[...byFinding.values()].filter((rows)=>rows.length>1),agreementPairs=comparablePairs.filter((rows)=>new Set(rows.map((item)=>`${item.decision}:${item.interventionDecision??'ABSTAIN'}`)).size===1);
  const breakdown = (key, fallback) => Object.fromEntries([...new Set(applicable.map((item) => item[key]?.state ?? item[key]?.class ?? fallback))].sort().map((value) => {
    const rows=applicable.filter((item) => (item[key]?.state ?? item[key]?.class ?? fallback)===value);
    return [value,{reviewed:rows.length,accepted:accepted(rows),rejected:rejected(rows),abstained:abstained(rows)}];
  }));
  return {
    candidateCount: findings.length,
    reviewedCount: applicable.length,
    developerReviewCount: developer.length,
    domainExpertReviewCount: expert.length,
    remoteSensingExpertReviewCount:applicable.filter((item)=>item.reviewerType==='REMOTE_SENSING_EXPERT_REVIEW').length,
    wildfireExpertReviewCount:applicable.filter((item)=>['WILDFIRE_EXPERT_REVIEW','DOMAIN_EXPERT_REVIEW'].includes(item.reviewerType)).length,
    forestryExpertReviewCount:applicable.filter((item)=>item.reviewerType==='FORESTRY_EXPERT_REVIEW').length,
    acceptedCount: accepted(applicable),
    rejectedCount: rejected(applicable),
    abstainedCount: abstained(applicable),
    developerAcceptanceRate: developerDecided.length ? accepted(developerDecided) / developerDecided.length : null,
    candidatePrecision: expertDecided.length ? accepted(expertDecided) / expertDecided.length : null,
    falseCandidateRate: expertDecided.length ? rejected(expertDecided) / expertDecided.length : null,
    recall: null,
    abstentionRate: applicable.length ? applicable.filter((item) => item.decision === 'ABSTAIN').length / applicable.length : null,
    interventionReviewAcceptanceRate:expertIntervention.length?interventionAccepted/expertIntervention.length:null,
    interventionReviewAbstentionRate:expert.length?expert.filter((item)=>item.interventionDecision==='ABSTAIN').length/expert.length:null,
    interRaterAgreement:comparablePairs.length?agreementPairs.length/comparablePairs.length:null,
    adjudicationQueue:disagreements,
    errorTaxonomy: reasons,
    sourceQualityBreakdown: breakdown('sourceQuality','UNMEASURED'),
    landCoverBreakdown: breakdown('landCoverContext','UNMEASURED'),
    precisionBasis: expertDecided.length ? (expert.every((item)=>item.reviewerType==='DOMAIN_EXPERT_REVIEW')?'DOMAIN_EXPERT_REVIEW':'QUALIFIED_DOMAIN_EXPERT_REVIEW') : 'UNMEASURED_NO_DOMAIN_EXPERT_LABELS',
    recallBasis: 'UNMEASURED_NO_EXHAUSTIVE_GROUND_TRUTH'
  };
}

export const PREVENTION_REVIEW_DECISIONS = Object.freeze([...DECISIONS]);
export const PREVENTION_REVIEWER_TYPES = Object.freeze([...REVIEWER_TYPES]);
export const PREVENTION_REVIEW_REASONS = Object.freeze([...REASONS]);
export const INTERVENTION_REVIEW_DECISIONS=Object.freeze([...INTERVENTION_DECISIONS]);
