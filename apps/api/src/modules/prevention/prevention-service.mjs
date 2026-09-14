import { buildPreventionCandidates } from './candidate-engine.mjs';
import { preventionValidationMetrics } from '../../../../../packages/domain/src/prevention-review.mjs';
import { preventionFindingVersion } from '../../../../../packages/domain/src/prevention-review.mjs';
import { computeFindingAttentionPriority } from '../../../../../packages/domain/src/prevention-priority.mjs';
const EXPERT_REVIEWER_TYPES=new Set(['DOMAIN_EXPERT_REVIEW','REMOTE_SENSING_EXPERT_REVIEW','WILDFIRE_EXPERT_REVIEW','FORESTRY_EXPERT_REVIEW']);
const publicFinding=(item)=>({findingId:item.findingId??item.id,kind:item.kind,state:item.state??null,calibrationState:item.calibrationState??null,place:item.place??null,municipality:item.municipality??null,district:item.district??null,affectedAreaHa:item.affectedAreaHa??null,corridorLengthM:item.corridorLengthM??null,attentionPriority:item.attentionPriority??null,firstObservableInterval:item.firstObservableInterval??null,reviewSummary:item.reviewSummary?{count:item.reviewSummary.count??0,domainExpert:item.reviewSummary.domainExpert??0,latest:item.reviewSummary.latest?{decision:item.reviewSummary.latest.decision,reviewerType:item.reviewSummary.latest.reviewerType,reviewedAt:item.reviewSummary.latest.reviewedAt}:null}:null,rationale:item.rationale??null,sourceQuality:item.sourceQuality?{state:item.sourceQuality.state??null,notice:item.sourceQuality.notice??null}:null});
const publicCandidate=(item)=>({id:item.id,kind:item.kind,title:item.title??null,place:item.place??null,municipality:item.municipality??null,district:item.district??null,band:item.band??null,score:item.score??null,rationale:item.rationale??null,screeningOnly:true});
export function publicPreventionSnapshot(value){return{meta:value.meta,summary:value.summary,findings:(value.findings??[]).map(publicFinding),candidates:(value.candidates??[]).map(publicCandidate),verifiedHazards:[],models:(value.models??[]).map((item)=>({id:item.id,name:item.name??item.id,version:item.version??null,state:item.state??null})),validation:value.validation?{state:value.validation.state??null,reviewedFindings:value.validation.reviewedFindings??null,domainExpertReviewedFindings:value.validation.domainExpertReviewedFindings??null}:null,restricted:true,notice:'Evidence identifiers, precise workflow locators, owners, detector runs, review exchange and verified-hazard operations require authenticated operator access.'};}

function reviewedFindings(findings, reviews) {
  return findings.map((finding) => {
    const version=preventionFindingVersion(finding),applicable = reviews.filter((review) => review.findingId === finding.findingId && review.detectorVersion === finding.detectorVersion&&review.findingVersion===version);
    const latest = applicable.at(-1);
    return { ...finding,findingVersion:version,attentionPriority:computeFindingAttentionPriority(finding), reviewSummary: { count: applicable.length, developer: applicable.filter((review) => review.reviewerType === 'DEVELOPER_REVIEW').length, domainExpert: applicable.filter((review) => EXPERT_REVIEWER_TYPES.has(review.reviewerType)).length, latest: latest ? { decision: latest.decision, reason: latest.reason, reviewerType: latest.reviewerType, reviewedAt: latest.reviewedAt } : null } };
  });
}

export class PreventionService {
  constructor({ worldService, repository, detectorRegistry, preventionReviewContextService=null,preventionReviewExchange=null }) { this.worldService = worldService; this.repository = repository; this.detectorRegistry = detectorRegistry;this.preventionReviewContextService=preventionReviewContextService;this.preventionReviewExchange=preventionReviewExchange; }
  async snapshot(options={}) {
    const world = await this.worldService.snapshot(options); const operator = this.repository.snapshot();
    const candidates = buildPreventionCandidates(world, this.detectorRegistry, operator);
    const rawFindings = operator.preventionFindings ?? [],enrichedFindings=rawFindings.map((item)=>this.preventionReviewContextService?.enrich(item)??item), reviews = operator.preventionReviews ?? [], findings = reviewedFindings(enrichedFindings, reviews);
    const verifiedHazards = operator.hazards.map((hazard) => ({ ...hazard, remediation: operator.interventions.find((task) => task.hazardId === hazard.id) ?? null }));
    const value={ meta: { generatedAt: world.meta.generatedAt, mode: world.meta.mode, notice: 'Fuel-continuity outputs are uncalibrated screening candidates from verified native pixels. They are not verified hazards.' }, summary: { screeningFindings:findings.filter((item)=>item.calibrationState==='SCREENING_CANDIDATE').length,candidates: candidates.length, urgent: candidates.filter((item) => item.band === 'urgent').length, verifiedHazards: verifiedHazards.length, openInterventions: operator.interventions.filter((item) => item.state !== 'closed').length, activeEvidenceRequests: operator.evidenceRequests.filter((item) => !['accepted', 'rejected', 'cancelled'].includes(item.state)).length }, findings,candidates, verifiedHazards, models: this.detectorRegistry.models(), detectorRuns:operator.detectorRuns??[], preventionReviews: reviews.map(({ reviewerId, ...review }) => review),reviewContext:this.preventionReviewContextService?.snapshot()??null,reviewExchange:this.preventionReviewExchange?.snapshot()??{state:'not_configured'}, validation: preventionValidationMetrics(enrichedFindings, reviews) };
    return options.publicProjection?publicPreventionSnapshot(value):value;
  }
  async find(id,options={}) { const snapshot = await this.snapshot(options); return snapshot.findings.find((item) => item.findingId === id) ?? snapshot.candidates.find((item) => item.id === id) ?? snapshot.verifiedHazards.find((item) => item.id === id) ?? null; }
}
