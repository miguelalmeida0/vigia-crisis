import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildFuelConnectivityGraph, buildInterventionCandidate } from '../packages/domain/src/fuel-connectivity-graph.mjs';

const runtimeUrl=process.env.VIGIA_RUNTIME_URL??'http://127.0.0.1:4177';
const response=await fetch(`${runtimeUrl}/api/v10/prevention/findings`,{signal:AbortSignal.timeout(10_000)});
if(!response.ok)throw new Error(`prevention_inventory_http_${response.status}`);
const snapshot=await response.json(),findings=Array.isArray(snapshot.findings)?snapshot.findings:[];
if(!findings.length)throw new Error('prevention_inventory_empty');

const corpus=JSON.parse(await readFile(new URL('../data/validation/prevention/portugal-sentinel2-review-corpus-v3.json',import.meta.url),'utf8'));
const proof=findings.map((finding)=>{
  const graph=buildFuelConnectivityGraph(finding),candidate=buildInterventionCandidate(finding,graph);
  return{findingId:finding.findingId,municipality:finding.municipality,detectorVersion:finding.detectorVersion,findingVersion:finding.findingVersion,currentObservationId:finding.currentObservationId,comparisonObservationId:finding.comparisonObservationId,sourceQuality:finding.sourceQuality,geometry:finding.geometry,graph,candidate};
});
const values=(selector)=>proof.map(selector).filter(Number.isFinite);
const summary=(numbers)=>numbers.length?{count:numbers.length,min:Number(Math.min(...numbers).toFixed(4)),max:Number(Math.max(...numbers).toFixed(4)),mean:Number((numbers.reduce((sum,value)=>sum+value,0)/numbers.length).toFixed(4))}:{count:0,min:null,max:null,mean:null};
const handoffUrl=new URL('../data/validation/operations/truth-autopilot-handoff.json',import.meta.url);
let truthAutopilotHandoff='UNAVAILABLE',truthAutopilot=null;try{truthAutopilot=JSON.parse(await readFile(handoffUrl,'utf8'));truthAutopilotHandoff='AVAILABLE';}catch{}
const sentinel2Gap=truthAutopilot?.coverageTruth?.gaps?.find((item)=>item.sourceFamily==='sentinel2_msi')??null;
const artifact={
  schema:'vigia.preignition-avoidance.release-evidence.v1',
  capturedAt:new Date().toISOString(),
  runtime:{url:runtimeUrl,httpStatus:response.status,universe:'PRODUCTION',source:'live /api/v10/prevention/findings'},
  releaseClaim:'Modeled physical connectivity reduction only. No fire-risk reduction, intervention efficacy or autonomous clearing claim.',
  inventory:{findings:findings.length,pixelVerifiedFindings:findings.filter((item)=>item.sourceQuality?.state==='PIXEL_VERIFIED').length,fuelConnectivityGraphs:proof.length,interventionCandidates:proof.filter((item)=>item.candidate).length,counterfactuals:proof.filter((item)=>item.candidate?.connectivity?.before&&item.candidate?.connectivity?.after).length,totalGraphNodes:proof.reduce((sum,item)=>sum+item.graph.nodes.length,0),totalGraphEdges:proof.reduce((sum,item)=>sum+item.graph.edges.length,0),qualifiedExpertReviews:findings.reduce((sum,item)=>sum+Number(item.reviewSummary?.domainExpert??0),0),preventionMissions:Number(snapshot.validation?.preventionMissionCount??0),verifiedPostInterventionChanges:Number(snapshot.validation?.postInterventionVerifiedCount??0)},
  distributions:{modeledConnectivityReduction:summary(values((item)=>item.candidate?.connectivity?.modeledConnectivityReduction)),interventionReviewPriority:summary(values((item)=>item.candidate?.reviewPriority?.score)),mappedAssetConnectedPathsBefore:summary(values((item)=>item.candidate?.affectedAssetPaths?.before)),mappedAssetConnectedPathsAfter:summary(values((item)=>item.candidate?.affectedAssetPaths?.after))},
  historicalBacktest:{status:'UNMEASURED_NO_REPEAT_SCENE_GRAPH_CORPUS',reason:'The governed corpus contains real current detector candidates and audited detector negatives, but no attributable historical before/intervention/after graph sequence with sufficient observation opportunity.',governedCorpus:{samples:corpus.inventory?.samples??corpus.samples?.length??0,detectorCandidates:corpus.inventory?.candidates??findings.length,rejectedDecisionAuditSamples:corpus.inventory?.rejectedDecisionAuditSamples??0,fullContextReviewable:corpus.inventory?.fullContextReviewable??0,qualifiedExpertReviewed:corpus.inventory?.domainExpertReviewed??0},excludedFromOutcomeMetrics:true},
  expertEvidence:{status:'UNMEASURED_NO_QUALIFIED_EXPERT_LABELS',twoIndependentQuestions:true,interRaterAgreement:null,adjudicationQueue:[],precision:null},
  postInterventionVerification:{contract:'Next usable optical observation -> exact-area comparison -> before/after connectivity graph -> attributable VERIFIED_CHANGE transition.',truthAutopilotHandoff,handoffGeneratedAt:truthAutopilot?.generatedAt??null,currentSentinel2Opportunity:sentinel2Gap?{state:sentinel2Gap.reasonCode,providerState:sentinel2Gap.providerState,expiresAt:sentinel2Gap.expiresAt}:null,verifiedChangeCount:Number(snapshot.validation?.postInterventionVerifiedCount??0),outcomeClaim:'UNMEASURED_NO_REAL_INTERVENTION'},
  limitations:['Graph links are deterministic samples of persisted detector component geometry, not a fire-spread model.','Mapped structure, road and critical-asset completeness varies.','The candidate is a review location; ownership, ecology, access, safety and legal constraints require qualified human and field review.','Historical stability and intervention outcome remain unmeasured until repeat-scene and real intervention evidence exist.'],
  proof
};
const output=new URL('../data/validation/release/pre-ignition-avoidance-evidence.json',import.meta.url);
await mkdir(new URL('../data/validation/release/',import.meta.url),{recursive:true});
await writeFile(output,`${JSON.stringify(artifact,null,2)}\n`);
console.log(JSON.stringify({output:output.pathname,...artifact.inventory,modeledReduction:artifact.distributions.modeledConnectivityReduction,reviewPriority:artifact.distributions.interventionReviewPriority,historicalBacktest:artifact.historicalBacktest.status,truthAutopilotHandoff},null,2));
