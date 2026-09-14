import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { json } from '../../http/responses.mjs';
import { visualizationClientKey } from '../../http/route-security-policy.mjs';
import { RequestGate, SingleFlight } from '../../shared/request-gate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const DEFAULT_FILES=Object.freeze({
  handoff:path.join(root, 'data/validation/measurement-debt/measurement-debt-handoff.json'),
  consensus:path.join(root,'data/validation/prevention/consensus-topology-evaluation-v1.json'),
  falseNegativeRecovery:path.join(root,'data/validation/detection/v4-false-negative-recovery-program-v1.json'),
  scienceHandoff:path.join(root,'data/validation/category-leadership/category-leadership-science-handoff.json'),
  scienceRescueHandoff:path.join(root,'data/validation/category-leadership/science-rescue-handoff.json')
});
const validationGate=new RequestGate({maxConcurrent:4,maxConcurrentPerClient:2,maxRequestsPerWindow:120});
const validationSingleFlight=new SingleFlight({maxKeys:16});
const artifactCache=new Map();

function readArtifact(file) {
  if(artifactCache.has(file))return artifactCache.get(file);
  const pending=validationSingleFlight.run(file,async()=>JSON.parse(await readFile(file,'utf8'))).catch((error)=>{artifactCache.delete(file);throw error;});
  artifactCache.set(file,pending);return pending;
}
const gated=({req,context},work)=>validationGate.run(visualizationClientKey(req,context),work);

function governedEvidenceError(error,dependencies){
  if(error?.code!=='ENOENT')throw error;
  throw Object.assign(new Error('validation_evidence_dependency_unavailable'),{statusCode:424,details:{schemaVersion:'vigia.validation-evidence-unavailable.v1',state:'EVIDENCE_UNAVAILABLE',dependencies:[...dependencies].sort(),qualification:'Governed validation evidence is absent. No synthetic or inferred replacement was served.'}});
}
const governed=({request,dependencies,work})=>gated(request,async()=>{try{return await work();}catch(error){return governedEvidenceError(error,dependencies);}});

async function handoff(read,files) {
  const value = await read(files.handoff);
  if (value.schemaVersion !== 'vigia.measurement-debt-handoff.v1') throw new Error('measurement_debt_handoff_invalid');
  return value;
}

const summary = (value) => {
  const items = value.evidenceDebtItems ?? [], open = items.filter((item) => !['MEASURED','RESOLVED'].includes(item.current_state));
  return {
    total:items.length,
    open:open.length,
    systemResolvable:open.filter((item) => item.system_resolvable).length,
    watching:open.filter((item) => String(item.watch_state).startsWith('ARMED') || String(item.watch_state).startsWith('WAITING')).length,
    measurementCampaigns:(value.campaigns ?? []).filter((campaign) => !['MEASURED','COMPLETE'].includes(campaign.progress?.state)).length,
    fieldRequired:open.filter((item) => item.field_required).length,
    externallyBlocked:open.filter((item) => item.current_state === 'EXTERNALLY_BLOCKED').length,
    resolved:items.filter((item) => ['MEASURED','RESOLVED'].includes(item.current_state)).length
  };
};

export async function preventionConsensusFor(findingId,{read=readArtifact,files=DEFAULT_FILES}={}){
  let evidence;try{evidence=await read(files.consensus);}catch(error){return governedEvidenceError(error,['prevention-consensus']);}const assessment=(evidence.assessments??evidence.zones??[]).find((item)=>String(item.finding_id)===String(findingId));if(!assessment)return null;
  const evaluation=(evidence.frozenEvaluation?.rows??[]).find((item)=>String(item.findingId)===String(findingId))??null;
  return{schemaVersion:'vigia.prevention-consensus-assessment.v4',findingId:assessment.finding_id,state:assessment.claim_state,legacyState:assessment.legacy_claim_state,assessment,zone:assessment,workflow:assessment.workflow,interventionGeometry:assessment.intervention_geometry,measurementSupportGeometry:assessment.measurement_support_geometry,measurementPlan:assessment.measurement_plan,evidenceDebt:assessment.evidence_debt,claimLevel:assessment.claim_level,evaluation,promotionDecision:evidence.frozenEvaluation?.aggregate?.promotion_decision,policyHash:evidence.promotionContract?.policyHash,evidenceHash:evidence.evidenceHash,qualification:evidence.scientificClaimBoundary};
}

export function registerMeasurementDebtRoutes(router,{read=readArtifact,files=DEFAULT_FILES}={}) {
  router.get('/api/v10/validation/measurement-debt', async (request) => governed({request,dependencies:['measurement-debt-handoff','prevention-consensus'],work:async()=>{ const {res}=request,value = await handoff(read,files),consensus=await read(files.consensus),assessments=consensus.assessments??[]; json(res, 200, { schemaVersion:'vigia.measurement-debt-workspace.v2', generatedAt:value.generatedAt, summary:summary(value), items:value.evidenceDebtItems, plans:value.measurementPlans, consensusGeometryDebt:{total:assessments.filter((item)=>item.evidence_debt).length,open:assessments.filter((item)=>item.evidence_debt?.current_state==='OPEN').length,items:assessments.map((item)=>item.evidence_debt).filter(Boolean),plans:assessments.map((item)=>item.measurement_plan).filter(Boolean)}, scientificClaimBoundary:value.scientificClaimBoundary, evidenceHash:value.evidenceHash, artifactEvidenceHash:value.artifactEvidenceHash }); }}));
  router.get('/api/v10/validation/prevention-machine-evidence', async (request) => governed({request,dependencies:['measurement-debt-handoff'],work:async()=>{ const {res}=request,value = await handoff(read,files); json(res, 200, { schemaVersion:'vigia.prevention-machine-evidence.v1', generatedAt:value.generatedAt, denominatorFindings:value.preventMetrics?.denominatorFindings, metrics:value.preventMetrics, referenceProductIntegrity:value.referenceProductIntegrity, stability:value.stabilityMetrics, negativeControls:value.negativeControls, retrospectiveAlignment:value.retrospectiveAlignment, matchedTemporalControl:value.matchedTemporalControl, expertValidation:value.preventMetrics?.expertValidation, claimLevels:value.claimLevels, scientificClaimBoundary:value.scientificClaimBoundary, evidenceHash:value.artifactEvidenceHash }); }}));
  router.get('/api/v10/validation/measurement-campaigns', async (request) => governed({request,dependencies:['measurement-debt-handoff'],work:async()=>{ const {res}=request,value = await handoff(read,files); json(res, 200, { schemaVersion:'vigia.measurement-campaigns.v1', generatedAt:value.generatedAt, campaigns:value.campaigns, plans:value.measurementPlans }); }}));
  router.get('/api/v10/validation/prevention-scorecards', async (request) => governed({request,dependencies:['measurement-debt-handoff'],work:async()=>{ const {res}=request,value = await handoff(read,files); json(res, 200, { schemaVersion:'vigia.prevention-science-scorecard.v1', generatedAt:value.generatedAt, metrics:value.preventMetrics, claimLevels:value.claimLevels, qualification:value.scientificClaimBoundary }); }}));
  router.get('/api/v10/validation/false-negative-taxonomy', async (request) => governed({request,dependencies:['measurement-debt-handoff'],work:async()=>{ const {res}=request,value = await handoff(read,files); json(res, 200, { schemaVersion:'vigia.false-negative-taxonomy.v1', generatedAt:value.generatedAt, ...value.falseNegativeClusters }); }}));
  router.get('/api/v10/validation/false-negative-recovery', async (request) => governed({request,dependencies:['false-negative-recovery'],work:async()=>json(request.res,200,await read(files.falseNegativeRecovery))}));
  router.get('/api/v10/validation/prevention-consensus', async (request) => governed({request,dependencies:['prevention-consensus'],work:async()=>json(request.res,200,await read(files.consensus))}));
  router.get('/api/v10/validation/prevention-consensus/zones', async (request) => governed({request,dependencies:['prevention-consensus'],work:async()=>{const {res}=request,value=await read(files.consensus),assessments=value.assessments??value.zones??[];json(res,200,{schemaVersion:'vigia.consensus-assessment-collection.v2',generatedAt:value.generatedAt,policyHash:value.promotionContract?.policyHash,summary:{states:value.consensusTopology?.claimStates,workflowDispositions:value.consensusTopology?.workflowDispositions,interventionReviewCandidates:value.consensusTopology?.interventionReviewCandidates,measurementRequired:value.consensusTopology?.measurementRequired},assessments,zones:assessments,evidenceHash:value.evidenceHash,qualification:value.scientificClaimBoundary});}}));
  router.get('/api/v10/validation/category-leadership-science-handoff', async (request) => governed({request,dependencies:['category-leadership-science-handoff'],work:async()=>json(request.res,200,await read(files.scienceHandoff))}));
  router.get('/api/v10/validation/science-rescue-handoff', async (request) => governed({request,dependencies:['science-rescue-handoff'],work:async()=>json(request.res,200,await read(files.scienceRescueHandoff))}));
  router.get('/api/v10/validation/prevention-consensus/:findingId',async(request)=>governed({request,dependencies:['prevention-consensus'],work:async()=>json(request.res,200,{consensus:await preventionConsensusFor(request.params.findingId,{read,files})})}));
}
