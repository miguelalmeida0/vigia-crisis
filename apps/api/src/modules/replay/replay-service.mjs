import { readFile } from 'node:fs/promises';
import { runPortugalReplay } from '../../../../../scripts/lib/portugal-replay.mjs';
import { haversineKm } from '../../../../../packages/domain/src/geo.mjs';
import { thermalObservationFootprint } from '../../../../../packages/domain/src/fire-event-geometry.mjs';
import { sentinel3ReplayOverlay } from './sentinel3-replay-overlay.mjs';

function unique(values) { return [...new Set(values)]; }
function byCase(metrics = []) { return new Map(metrics.map((item) => [item.id, item])); }
function round(value,digits=2){return Number.isFinite(value)?Number(value.toFixed(digits)):null;}
function centroid(rows=[]){if(!rows.length)return null;return[rows.reduce((sum,item)=>sum+item.coordinate[0],0)/rows.length,rows.reduce((sum,item)=>sum+item.coordinate[1],0)/rows.length];}
function thermalFrames(records=[]){const groups=new Map();for(const record of records.filter((item)=>item.kind==='thermal')){const at=record.payload.observedAt??record.arrivalAt;if(!groups.has(at))groups.set(at,[]);groups.get(at).push(record);}let previous=null;return[...groups.entries()].sort(([a],[b])=>Date.parse(a)-Date.parse(b)).map(([at,items])=>{const observations=items.map((record)=>record.payload),center=centroid(observations),previousObservations=previous?.observations??[];const persisting=observations.filter((item)=>previousObservations.some((prior)=>haversineKm(item.coordinate,prior.coordinate)<=1)).length,noLonger=Math.max(0,previousObservations.length-persisting),aggregateFrp=observations.reduce((sum,item)=>sum+(Number(item.frpMw)||0),0),frame={at,visibleAt:items.map((item)=>item.arrivalAt).sort().at(-1),observationIds:items.map((item)=>item.id),observations:observations.map((item)=>({id:item.id,coordinate:item.coordinate,frpMw:item.frpMw??null,source:item.satellite??item.sourceKey,sourceFamily:item.sourceFamily??null,confidence:item.confidence??null,footprint:item.footprint??thermalObservationFootprint({type:'thermal',at:item.observedAt,coordinate:item.coordinate,satellite:item.satellite,instrument:item.instrument,scanKm:item.scanKm,trackKm:item.trackKm,nominalResolutionKm:item.nominalResolutionKm,frpMw:item.frpMw})})),supportGeometry:{type:'FeatureCollection',features:observations.map((item)=>item.footprint??thermalObservationFootprint({type:'thermal',id:item.id,at:item.observedAt,coordinate:item.coordinate,satellite:item.satellite,instrument:item.instrument,scanKm:item.scanKm,trackKm:item.trackKm,nominalResolutionKm:item.nominalResolutionKm,frpMw:item.frpMw})).filter(Boolean)},centroid:center,aggregateFrpMw:round(aggregateFrp),activePixelCount:observations.length,sourceFamilies:[...new Set(observations.map((item)=>item.sourceFamily??item.satellite??item.instrument))],change:{newSupport:Math.max(0,observations.length-persisting),persistingSupport:persisting,noLongerObservedSupport:noLonger,centroidMovementKm:previous?.centroid&&center?round(haversineKm(previous.centroid,center)):null,frpChangeMw:previous?round(aggregateFrp-previous.aggregateFrpMw):null}};previous=frame;return frame;});}

export class ReplayService {
  constructor({ corpusFile, sourceManifestFile, benchmarkFile, sentinel3FrpGateway=null, acquisitionStore=null, physicalTruthStore=null }) {
    this.files = { corpusFile, sourceManifestFile, benchmarkFile };
    this.corpus = null;
    this.sourceManifest = null;
    this.benchmark = null;
    this.replayPromise = null;
    this.localInitializationPromise = null;
    this.overlayInitializationPromise = null;
    this.sentinel3FrpGateway=sentinel3FrpGateway;this.acquisitionStore=acquisitionStore;this.physicalTruthStore=physicalTruthStore;this.sentinel3Overlay={state:'not_configured'};
  }

  async initializeLocal() {
    this.localInitializationPromise??=(async()=>{
      const [corpus, sourceManifest, benchmark] = await Promise.all([
        readFile(this.files.corpusFile, 'utf8'),
        readFile(this.files.sourceManifestFile, 'utf8'),
        readFile(this.files.benchmarkFile, 'utf8')
      ]);
      this.corpus = JSON.parse(corpus);
      this.sourceManifest = JSON.parse(sourceManifest);
      this.benchmark = JSON.parse(benchmark);
      if (this.corpus?.metadata?.evidenceClass !== 'official_archival_evidence') throw new Error('replay_official_archive_required');
      if (this.corpus?.metadata?.countryCode !== 'PT') throw new Error('replay_portugal_corpus_required');
      this.sentinel3Overlay={state:this.sentinel3FrpGateway?.historicalReplayConfigured?.()?'loading':'not_configured'};
    })();
    await this.localInitializationPromise;
    return this.overview();
  }

  async initialize() {
    await this.initializeLocal();
    this.overlayInitializationPromise??=this.#initializeSentinel3Overlay();
    await this.overlayInitializationPromise;
    return this.overview();
  }

  async #initializeSentinel3Overlay(){
    if(!this.sentinel3FrpGateway?.historicalReplayConfigured?.()){this.sentinel3Overlay={state:'not_configured'};return;}
    try{
      const snapshot=await this.sentinel3FrpGateway.snapshot(),overlay=sentinel3ReplayOverlay({corpus:this.corpus,snapshot,acquisitionStore:this.acquisitionStore});
      if(!overlay.applied){this.sentinel3Overlay={state:overlay.reason,sourceState:snapshot.state?.state};return;}
      if(!overlay.products.length){this.sentinel3Overlay={...overlay.summary,state:snapshot.state?.state==='unavailable'?'provider_unavailable':overlay.summary.state};return;}
      if(this.physicalTruthStore?.status().configured&&this.physicalTruthStore.status().state!=='ready')await this.physicalTruthStore.initialize();
      if(this.physicalTruthStore?.status().state!=='ready'){this.sentinel3Overlay={...overlay.summary,state:'persistence_required',persistenceState:this.physicalTruthStore?.status().state??'not_configured'};return;}
      const replay=overlay.summary.observationCount?await runPortugalReplay(overlay.corpus):null,sourceIds=[...new Set(overlay.products.map((item)=>item.sourceId))],checkpoints=sourceIds.map((id)=>this.acquisitionStore.getCheckpoint(id));
      await this.physicalTruthStore.commitSnapshot({products:overlay.products,events:replay?.finalEvents??[],checkpoints});await this.acquisitionStore.markProductsIngested(overlay.summary.rawSourceProductIds);
      this.corpus=overlay.corpus;this.sourceManifest={...this.sourceManifest,products:[...(this.sourceManifest.products??[]),...overlay.sourceProducts]};
      if(replay){this.replayPromise=Promise.resolve(replay);this.benchmark={generatedAt:new Date().toISOString(),softwareReplay:replay.softwareReplay,validation:replay.validation};}
      this.sentinel3Overlay={...overlay.summary,state:overlay.summary.observationCount?'historical_two_family_candidate_ready':'product_persisted_no_qualifying_points',persistenceState:'committed'};
    }catch(error){this.sentinel3Overlay={state:'failed',error:String(error.message??error)};}
  }

  #requireReady() {
    if (!this.corpus || !this.sourceManifest || !this.benchmark) throw new Error('replay_service_not_initialized');
  }

  #heroCaseId() {
    const cases = this.benchmark.validation?.metrics?.cases ?? [];
    return [...cases].filter((item) => item.associated && !item.fragmented && Number.isFinite(item.physicalLeadMinutes) && item.physicalLeadMinutes >= 15 && item.physicalLeadMinutes <= 180)
      .sort((a, b) => Math.abs(a.physicalLeadMinutes-41)-Math.abs(b.physicalLeadMinutes-41) || b.associatedPhysicalObservations - a.associatedPhysicalObservations)[0]?.id
      ?? this.corpus.cases.find((item) => item.physicalFirst)?.id
      ?? this.corpus.cases[0]?.id;
  }

  overview() {
    this.#requireReady();
    const metrics = this.benchmark.validation.metrics;
    const caseMetrics = byCase(metrics.cases);
    const heroCaseId = this.#heroCaseId();
    const cases = this.corpus.cases.map((item) => ({ ...item, benchmark: caseMetrics.get(item.id) ?? null, hero: item.id === heroCaseId }))
      .sort((a, b) => Number(b.hero) - Number(a.hero) || Number(b.physicalFirst) - Number(a.physicalFirst) || Number(b.burnedAreaHa) - Number(a.burnedAreaHa));
    return {
      schemaVersion: 'vigia-replay-overview.v1',
      mode: 'HISTORICAL_REPLAY',
      corpus: {
        id: this.corpus.metadata.id,
        evidenceClass: this.corpus.metadata.evidenceClass,
        generatedAt: this.corpus.metadata.generatedAt,
        controlledClock: this.corpus.metadata.controlledClock,
        futureEvidencePolicy: this.corpus.metadata.futureEvidencePolicy,
        arrivalTimeQualification: this.corpus.metadata.arrivalTimeQualification,
        caseSelectionPolicy: this.corpus.metadata.caseSelectionPolicy,
        replayThinningPolicy: this.corpus.metadata.replayThinningPolicy,
        synthetic: false
      },
      heroCaseId,
      ambiguousCaseId: metrics.cases.find((item)=>Number(item.unresolvedObservationCount)>0)?.id??null,
      cases,
      benchmark: { generatedAt: this.benchmark.generatedAt, softwareReplay: this.benchmark.softwareReplay, validation: this.benchmark.validation },
      sources: this.sourceManifest.products.map((item) => ({
        id: item.id,
        provider: item.provider,
        authority: item.authority ?? null,
        platform: item.platform ?? null,
        instrument: item.instrument ?? null,
        kind: item.kind,
        state: 'archived_verified',
        checksumSha256: item.checksumSha256,
        bytes: item.bytes,
        url: item.url,
        providerUpdatedAt: item.providerUpdatedAt ?? item.responseGeneratedAt ?? null
      })),
      sentinel3Overlay:this.sentinel3Overlay,
      limitations: this.sourceManifest.limitations,
      unmeasured: metrics.unmeasured
    };
  }

  async #fullReplay() {
    this.#requireReady();
    this.replayPromise ??= runPortugalReplay(this.corpus);
    return this.replayPromise;
  }

  async caseDetail(id) {
    this.#requireReady();
    const replayCase = this.corpus.cases.find((item) => item.id === id);
    if (!replayCase) throw new Error('replay_case_not_found');
    const replay = await this.#fullReplay();
    const state = replay.caseStates.find((item) => item.caseId === id) ?? { caseId: id, asOf: null, events: [] };
    const records = this.corpus.records.filter((item) => item.caseId === id);
    const arrivals=unique(records.map((item) => item.arrivalAt)).sort(),preludeAt=arrivals[0]?new Date(Date.parse(arrivals[0])-30*60_000).toISOString():null;
    const clockSteps = preludeAt?[preludeAt,...arrivals]:arrivals;
    const benchmarkCase = replay.validation.metrics.cases.find((item) => item.id === id) ?? null;
    const associationByRecord=new Map();for(const event of state.events??[])for(const decision of event.associationDecisions??[]){const observation=event.observations?.find((item)=>item.id===decision.observationId),recordId=observation?.provenance?.replayRecordId;if(recordId)associationByRecord.set(recordId,{canonicalEventId:event.id,state:decision.state,scoreKind:decision.scoreKind,fitScore:decision.best?.score??null,separationMargin:decision.separationMargin??null,best:decision.best??null,alternative:decision.alternative??null,reasonCodes:decision.reasonCodes??[],reasons:decision.best?.reasons??[]});}
    const productsById=new Map(this.sourceManifest.products.map((item)=>[item.id,item]));
    const evidence = records.map((record) => ({
      id: record.id,
      kind: record.kind,
      visibleAt: record.arrivalAt,
      observedAt: record.kind === 'thermal' ? record.payload.observedAt : record.payload.startedAt,
      coordinate: record.payload.coordinate,
      source: record.kind === 'thermal' ? record.payload.satellite : 'ICNF SGIF official report',
      platform: record.kind === 'thermal' ? record.payload.satellite : 'ICNF SGIF',
      sensor: record.kind === 'thermal' ? record.payload.instrument : 'official report archive',
      product: record.payload.sourceKey??record.payload.provenance?.providerProductId??record.payload.provenance?.rawSourceProductId,
      provider: record.payload.provenance?.provider,
      rawSourceProductId: record.payload.provenance?.rawSourceProductId,
      rawProductArchived: Boolean(record.payload.provenance?.rawSourceProductId),
      rawProductUrl: productsById.get(record.payload.provenance?.rawSourceProductId)?.url??record.payload.provenance?.archiveUrl??null,
      checksumSha256: record.payload.provenance?.checksumSha256,
      normalizerVersion: record.payload.provenance?.normalizerVersion??this.corpus.metadata.productionNormalizers?.[record.kind==='thermal'?0:1]??null,
      frpMw: record.payload.frpMw ?? null,
      frpUncertaintyMw: record.payload.frpUncertaintyMw ?? null,
      sourceFamily: record.payload.sourceFamily ?? null,
      independenceGroup: record.payload.independenceGroup ?? null,
      receivedAt: record.payload.receivedAt ?? null,
      confidence: record.payload.confidence ?? null,
      nativeQuality: { confidence:record.payload.confidence??null,qualityFlags:record.payload.qualityFlags??[],scanKm:record.payload.scanKm??null,trackKm:record.payload.trackKm??null },
      footprint: record.payload.footprint ?? null,
      association: associationByRecord.get(record.id)??null,
      synthetic: false
    }));
    const frames=thermalFrames(records),firstThermalAt=records.filter((item)=>item.kind==='thermal').map((item)=>item.arrivalAt).sort()[0]??null,reportAt=records.find((item)=>item.kind==='report')?.arrivalAt??null;
    const knowledgeTimeline=[...(firstThermalAt?[{at:firstThermalAt,kind:'event_creation',label:'Physical-first event created',knowledge:'Physical observation present · public report absent'}]:[]),...frames.slice(1).map((frame)=>({at:frame.visibleAt,kind:'physical_observation',label:`${frame.activePixelCount} thermal pixels observed`,knowledge:`${frame.aggregateFrpMw} MW aggregate FRP · ${frame.sourceFamilies.join(' + ')}`})),...(reportAt?[{at:reportAt,kind:'association',label:'Official report associated',knowledge:`Report joined the canonical physical event · ${replayCase.physicalLeadMinutes??'no'} minute observation-time lead`}]:[])].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    return {
      schemaVersion: 'vigia-replay-case.v1',
      mode: 'HISTORICAL_REPLAY',
      corpusId: this.corpus.metadata.id,
      case: replayCase,
      benchmark: benchmarkCase,
      controlledClock: {
        steps: clockSteps,
        startAt: clockSteps[0] ?? null,
        endAt: clockSteps.at(-1) ?? null,
        futureEvidencePolicy: this.corpus.metadata.futureEvidencePolicy,
        futureEvidenceViolations: replay.softwareReplay.futureEvidenceViolations
      },
      derived: state,
      evidence,
      observedThermalFrames: frames,
      knowledgeTimeline,
      sourceProducts: unique(evidence.map((item) => item.rawSourceProductId)).map((rawId) => this.sourceManifest.products.find((item) => item.id === rawId)).filter(Boolean),
      limitations: this.sourceManifest.limitations,
      probability: { value: null, state: 'UNCALIBRATED', reason: 'No approved cross-sensor calibration profile exists for this corpus.' }
    };
  }
}
