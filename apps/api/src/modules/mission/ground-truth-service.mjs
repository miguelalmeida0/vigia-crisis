import { assertCan, can, hasGlobalIncidentScope, incidentIdForResource, incidentInScope } from '../../../../../packages/domain/src/authorization.mjs';

const REQUEST_TERMINAL=new Set(['accepted','rejected','cancelled']);
const PUBLIC_SOURCE_STATES=new Set(['current','healthy','ready','reachable','stale','degraded','failed','unavailable','not_configured','unknown','loading']);
const PUBLIC_SOURCE_TIMES=['fetchedAt','upstreamAt','lastSuccessAt','latestObservationAt','updatedAt'];
const PUBLIC_SOURCE_COUNTS=['accepted','rejected','observations','cataloguedProducts','acquiredProducts','positiveProducts','healthyFeedCount','feedCount'];
export function publicSourceProjection(sources={}){return Object.fromEntries(Object.entries(sources??{}).map(([key,value])=>{const row=value&&typeof value==='object'&&!Array.isArray(value)?value:{},state=String(row.state??'unknown').toLowerCase(),projected={state:PUBLIC_SOURCE_STATES.has(state)?state:'unknown',configured:row.configured===true,errorPresent:Object.entries(row).some(([name,item])=>/error|failure/i.test(name)&&Boolean(item))||['failed','degraded'].includes(state)};for(const name of PUBLIC_SOURCE_TIMES)if(Number.isFinite(Date.parse(row[name]??'')))projected[name]=new Date(row[name]).toISOString();for(const name of PUBLIC_SOURCE_COUNTS)if(Number.isFinite(Number(row[name])))projected[name]=Math.max(0,Number(row[name]));return[key,projected];}));}
function median(values){const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!rows.length)return null;const middle=Math.floor(rows.length/2);return rows.length%2?rows[middle]:(rows[middle-1]+rows[middle])/2;}
function elapsedMinutes(start,end){const value=(Date.parse(end??'')-Date.parse(start??''))/60_000;return Number.isFinite(value)&&value>=0?value:null;}
export function evidenceOperationEffectiveness(state={},now=new Date()){
  const requests=state.evidenceRequests??[],needs=state.evidenceNeeds??[],packages=state.evidencePackages??[];
  const resolvedRequests=requests.filter((item)=>REQUEST_TERMINAL.has(item.state));
  const evidenced=requests.filter((item)=>item.evidencePackageId||['submitted','accepted','rejected'].includes(item.state));
  const internallyActionableClasses=new Set(['INTERNALLY_CLOSABLE_NOW','ASSOCIATION_CLOSABLE']);
  const blockedClasses=new Set(['WAITING_REMOTE_SENSOR','WAITING_EXPERT_REVIEW','EXTERNALLY_BLOCKED','UNRESOLVABLE']);
  const actionable=requests.filter((item)=>internallyActionableClasses.has(item.actionDisposition?.class));
  const completedActionable=requests.filter((item)=>item.actionDisposition?.class==='EVIDENCE_PRODUCING_COMPLETED'||['submitted','accepted','rejected'].includes(item.state));
  const completedWithEvidence=completedActionable.filter((item)=>item.evidencePackageId||['submitted','accepted','rejected'].includes(item.state));
  const unresolvedNeeds=needs.filter((item)=>item.state!=='RESOLVED');
  const overdue=requests.filter((item)=>!REQUEST_TERMINAL.has(item.state)&&Number.isFinite(Date.parse(item.dueAt??''))&&Date.parse(item.dueAt)<now.getTime());
  const acknowledgement=median(requests.map((item)=>elapsedMinutes(item.createdAt,item.acknowledgedAt)));
  const resolution=median(resolvedRequests.map((item)=>elapsedMinutes(item.createdAt,item.resolvedAt)));
  return{
    requestsCreated:requests.length,requestsResolved:resolvedRequests.length,requestsProducingNewEvidence:evidenced.length,evidencePackages:packages.length,
    unknownsClosed:needs.filter((item)=>item.state==='RESOLVED').length,unknownsClosedWithEvidence:needs.filter((item)=>item.id&&item.state==='RESOLVED'&&requests.some((request)=>request.evidenceNeedId===item.id&&request.evidencePackageId)).length,unknownsOpen:unresolvedNeeds.length,unownedWork:unresolvedNeeds.filter((item)=>!item.ownerId).length,overdue:overdue.length,
    medianAcknowledgementMinutes:acknowledgement===null?null:Number(acknowledgement.toFixed(1)),medianResolutionMinutes:resolution===null?null:Number(resolution.toFixed(1)),
    evidenceYieldPercent:requests.length?Number((evidenced.length/requests.length*100).toFixed(1)):null,
    internallyActionableRequests:actionable.length,actionableRequests:actionable.length,waitingRemoteSensor:requests.filter((item)=>item.actionDisposition?.class==='WAITING_REMOTE_SENSOR').length,waitingExpertReview:requests.filter((item)=>item.actionDisposition?.class==='WAITING_EXPERT_REVIEW').length,associationClosable:requests.filter((item)=>item.actionDisposition?.class==='ASSOCIATION_CLOSABLE').length,blockedRequests:requests.filter((item)=>blockedClasses.has(item.actionDisposition?.class)).length,completedActionableAttempts:completedActionable.length,completedActionableWithEvidence:completedWithEvidence.length,
    actionableEvidenceYieldPercent:completedActionable.length?Number((completedWithEvidence.length/completedActionable.length*100).toFixed(1)):null,
    backlogDisposition:Object.fromEntries([...new Set(requests.map((item)=>item.actionDisposition?.class??'UNCLASSIFIED'))].sort().map((name)=>[name,requests.filter((item)=>(item.actionDisposition?.class??'UNCLASSIFIED')===name).length])),
    requestCreationState:state.actionBacklogReconciliation?.automaticRequestCreation??'UNMEASURED',
    measurementBasis:'Global yield retains every historical request. Actionable yield is evidence-producing completed attempts divided by all completed actionable attempts; open work and unavailable/superseded requests are reported separately, never counted as successes.'
  };
}

export class GroundTruthService {
  constructor({ controlService, worldService, preventionService, detectionService, outcomeService, repository, detectorRegistry, auditService, operationalEventService, livePhysicalIntelligenceService=null,featureFlags = null }) {
    this.controlService = controlService; this.worldService = worldService; this.preventionService = preventionService; this.detectionService = detectionService;
    this.outcomeService = outcomeService; this.repository = repository; this.detectorRegistry = detectorRegistry; this.auditService = auditService; this.operationalEventService = operationalEventService;this.livePhysicalIntelligenceService=livePhysicalIntelligenceService; this.featureFlags = featureFlags ?? { prevention:true, detection:true, livingFire:true, action:true, outcomes:false };
  }

  async bootstrap(actor) {
    const cache={preferCache:true};
    const operatorRead=can(actor,'read:evidence'),globalScope=hasGlobalIncidentScope(actor);
    const [world, prevention, detection] = await Promise.all([this.worldService.snapshot(cache), this.preventionService.snapshot({...cache,publicProjection:!globalScope}), this.detectionService.snapshot({...cache,actor,publicProjection:!operatorRead})]);
    const state = this.repository.snapshot();
    const control = this.controlService.snapshot();
    const exposedControl = { ...control, actors: actor ? [actor] : [] };
    const outcomes = globalScope&&can(actor, 'read:outcomes') ? this.outcomeService.snapshot(actor) : { restricted: true, metrics: null, loops: [] };
    const resourceVisible=(type,id)=>{const incidentId=incidentIdForResource(type,id);return incidentId?incidentInScope(actor,incidentId):hasGlobalIncidentScope(actor);};
    const visibleRequests=(state.evidenceRequests??[]).filter((item)=>resourceVisible(item.targetType,item.targetId)),visibleRequestIds=new Set(visibleRequests.map((item)=>item.id));
    const visibleNeeds=(state.evidenceNeeds??[]).filter((item)=>resourceVisible(item.subjectType,item.subjectId));
    const visiblePackages=(state.evidencePackages??[]).filter((item)=>visibleRequestIds.has(item.requestId));
    const effectiveness=evidenceOperationEffectiveness({...state,evidenceRequests:visibleRequests,evidenceNeeds:visibleNeeds,evidencePackages:visiblePackages});
    const physicalLoop=globalScope?this.livePhysicalIntelligenceService?.status?.()??{}:{},systemActionability=globalScope?(physicalLoop.systemActions??{state:'SCHEDULED',systemActionable:4,systemCompleted:0,evidenceProducing:0,unknownsClosed:0,yieldPercent:null,rows:[],measurementBasis:'The automatic source, association, provenance and remote-matching cycle is scheduled but has not completed in this process.'}):{state:'RESTRICTED',systemActionable:null,systemCompleted:null,evidenceProducing:null,unknownsClosed:null,yieldPercent:null,rows:[],measurementBasis:'Global system-action aggregates require wildcard incident scope.'};
    const actionProof={effectiveness,systemActionability,traceCompleteness:globalScope?physicalLoop.traceCompleteness??null:null};
    const operations=operatorRead?{ evidenceNeeds:visibleNeeds, evidenceRequests:visibleRequests, evidencePackages:visiblePackages, ...actionProof,globalCollectionsRestricted:!globalScope,hazards:globalScope?state.hazards:[], remediations:globalScope?state.interventions:[], reobservations:globalScope?state.reobservations:[], watchPlaces:globalScope?state.watchPlaces:[], watchedEventIds: (state.watchedEventIds??[]).filter((id)=>incidentInScope(actor,id)) }:{ restricted:true,evidenceNeeds:[],evidenceRequests:[],evidencePackages:[],...actionProof,hazards:[],remediations:[],reobservations:[],watchPlaces:[],watchedEventIds:[] };
    return {
      meta: {
        version: '10.0.0', product: 'VIGIA Physical Intelligence Core', generatedAt: world.meta.generatedAt, mode: world.meta.mode, universe: 'production', region: world.meta.region,
        features: this.featureFlags,
        proposition: 'Evidence-gated prototype for separating reports, physical observations, unresolved needs and accountable acquisition work.',
        mutationMode: actor?.authentication?.authenticated ? actor.authentication.mode : 'read_only',
        safety: 'Decision support only. Official civil-protection instructions always take precedence.'
      },
      actor, control: exposedControl, sources: operatorRead?world.sources:publicSourceProjection(world.sources),
      world: { fires: [], riskToday: world.riskToday, riskTomorrow: world.riskTomorrow, weather: world.weather, warnings: world.warnings, earthObservations: world.earthObservations, thermalDetections: [], projection:{kind:'workspace-bootstrap',fireEventsEndpoint:'/api/v10/events',qualification:'High-volume reports and thermal observations are projected through canonical event summaries and loaded in detail only after selection.'} },
      prevention, detection,
      operations,
      outcomes, models: this.detectorRegistry.models(), auditChain: this.auditService.verifyChain()
    };
  }

  async field(actor) {
    assertCan(actor,'read:evidence');
    const state = this.repository.snapshot();
    return {
      actor,
      requests: state.evidenceRequests.filter((item) => item.ownerId === actor.id && !['accepted', 'cancelled'].includes(item.state) && (()=>{const incidentId=incidentIdForResource(item.targetType,item.targetId);return incidentId?incidentInScope(actor,incidentId):hasGlobalIncidentScope(actor);})()),
      remediations: hasGlobalIncidentScope(actor)?state.interventions.filter((item) => item.ownerId === actor.id && !['closed', 'cancelled'].includes(item.state)):[],
      offlineContract: { queueKey: 'vigia.field.queue.v3', syncEndpoint: '/api/v2/field/sync', maxAttachmentBytes: 750_000 }
    };
  }
}
