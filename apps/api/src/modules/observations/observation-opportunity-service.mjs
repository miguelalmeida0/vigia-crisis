import { readJson } from '../../shared/json-file.mjs';
import { createHash } from 'node:crypto';
import { createObservationOpportunity, currentObservationOpportunity, rankObservationOpportunities, scheduledObservationOpportunity } from '../../../../../packages/domain/src/observation-opportunity.mjs';
import { predictOrbitalPasses } from '../../../../../packages/domain/src/orbital-opportunity.mjs';

function manualOpportunity() {
  return {
    id: 'manual-field-dispatch', sourceId: 'manual-operations', label: 'Manual field inspection', kind: 'MANUAL', methodType: 'field_unit',
    availability: 'MANUAL_REQUEST', ownerId: null, evidenceRole: 'physical_confirmation', informationGain: { state: 'UNMEASURED', value: null },
    latency: { state: 'UNMEASURED', value: null }, reliability: { state: 'UNMEASURED', value: null }, cost: { state: 'UNMEASURED', value: null },
    commitment: null, limitation: 'Availability remains unknown until an assigned field owner acknowledges the request.'
  };
}
function linkedEvidenceNeedId(event){return event.actionNeed?.needsRouting&&event.actionNeed?.kind?`evidence-need:${createHash('sha256').update(`${event.id}:${event.actionNeed.kind}`).digest('hex').slice(0,18)}`:null;}
function validTime(value){return Number.isFinite(Date.parse(value??''));}
function providerOpportunity(event,spec,evidenceNeedId,now){
  const source=spec.source??{},rawIds=source.rawSourceProductIds??(source.rawSourceProductId?[source.rawSourceProductId]:[]),product=source.latestProduct??source.latestCatalogProduct??null;
  const productId=rawIds.at(-1)??product?.rawSourceProductId??null,observedAt=product?.observedAt??product?.sourceTimestamp??source.latestSourceObservation??source.latestPhysicalObservation??source.upstreamAt??null;
  const attributable=(event.observations??[]).find((item)=>String(item.sourceFamily)===spec.sourceFamily&&String(item.provenance?.rawSourceProductId??item.rawSourceProductId??'')===String(productId??''));
  if(productId&&attributable&&validTime(attributable.at??observedAt))return createObservationOpportunity({eventId:event.id,sourceFamily:spec.sourceFamily,platform:spec.platform,windowStart:attributable.at??observedAt,windowEnd:attributable.at??observedAt,opportunityType:'CONFIRMED_PROVIDER_PRODUCT',authority:`ATTRIBUTABLE_ARCHIVED_PRODUCT:${productId}`,coverageAssumptions:{eventCoordinate:event.coordinate,providerCoverage:source.currentCoverage??source.catalogueWindow?.aoi??null,productId,attributableObservationId:attributable.id,providerConclusion:source.observationConclusion??null,providerState:source.state??'unknown'},qualityDependencies:{requiresSuccessfulParse:true,requiresUsableCoverage:true,requiresQualityReview:true,requiresAttributableObservationOrGovernedNoDetection:true},blockerReason:null,evidenceNeedId,expiresAt:new Date(Math.max(Date.parse(attributable.at??observedAt)+24*3_600_000,now.getTime()+60_000)).toISOString(),canCloseEvidenceNeed:true},{now});
  const prediction=source.nextExpectedOpportunity;
  if(prediction&&validTime(prediction.windowStart)&&validTime(prediction.windowEnd)&&prediction.authority)return createObservationOpportunity({eventId:event.id,sourceFamily:spec.sourceFamily,platform:spec.platform,windowStart:prediction.windowStart,windowEnd:prediction.windowEnd,opportunityType:'PREDICTED_ORBITAL_PASS',authority:String(prediction.authority),coverageAssumptions:{eventCoordinate:event.coordinate,...(prediction.coverageAssumptions??{})},qualityDependencies:{requiresSuccessfulAcquisition:true,requiresUsableCoverage:true,requiresQualityReview:true,...(prediction.qualityDependencies??{})},blockerReason:null,evidenceNeedId,expiresAt:prediction.windowEnd,canCloseEvidenceNeed:true,calculationVersion:prediction.calculationVersion??'vigia.observation-opportunity.orbital-pass.v1'},{now});
  const cadence=source.expectedObservationCadence;
  if(cadence&&validTime(cadence.windowStart)&&validTime(cadence.windowEnd)&&cadence.authority)return createObservationOpportunity({eventId:event.id,sourceFamily:spec.sourceFamily,platform:spec.platform,windowStart:cadence.windowStart,windowEnd:cadence.windowEnd,opportunityType:'EXPECTED_CADENCE',authority:String(cadence.authority),coverageAssumptions:{eventCoordinate:event.coordinate,...(cadence.coverageAssumptions??{})},qualityDependencies:{requiresPassConfirmation:true,requiresSuccessfulAcquisition:true,requiresUsableCoverage:true,...(cadence.qualityDependencies??{})},blockerReason:'Cadence is an expected observation interval, not a confirmed event-specific pass.',evidenceNeedId,expiresAt:cadence.windowEnd,canCloseEvidenceNeed:false,calculationVersion:cadence.calculationVersion??'vigia.observation-opportunity.expected-cadence.v1'},{now});
  return createObservationOpportunity({eventId:event.id,sourceFamily:spec.sourceFamily,platform:spec.platform,opportunityType:'UNKNOWN',authority:'VIGIA_SOURCE_STATUS_ONLY',coverageAssumptions:{eventCoordinate:event.coordinate,providerState:source.state??'unknown'},qualityDependencies:{requiresEventSpecificPassPrediction:true,requiresUsableCoverage:true,requiresProviderProduct:true},blockerReason:'No attributable provider product, event-specific orbital prediction, or governed observation cadence is available. Poll cadence is not treated as an observation window.',evidenceNeedId,canCloseEvidenceNeed:false},{now});
}
function remoteOpportunity(id,label,methodType,source,{publicCatalogue=false,cadenceMinutes=null}={}){
  const connected=['current','stale'].includes(source?.state),catalogue=publicCatalogue||connected;
  const availability=connected&&cadenceMinutes?'ESTIMATED_CADENCE':catalogue?'PASS_DEPENDENT':'CREDENTIAL_REQUIRED';
  return{id,sourceId:id,label,kind:'FUTURE',methodType,availability,ownerId:null,evidenceRole:'physical_observation_opportunity',informationGain:{state:'UNMEASURED',value:null},latency:cadenceMinutes&&connected?{state:'ESTIMATED_CADENCE',value:cadenceMinutes,unit:'minutes',source:'published_product_cadence'}:{state:'PASS_DEPENDENT',value:null},reliability:{state:'UNMEASURED',value:null},cost:{state:'UNMEASURED',value:null},commitment:null,accessState:connected?'CONNECTED':catalogue?'CATALOGUE_AVAILABLE':'CREDENTIAL_REQUIRED',limitation:connected&&cadenceMinutes?'Published cadence is known; acquisition time, usable coverage and delivery are not confirmed.':catalogue?'The source is pass-dependent. No event-specific overpass time or usable coverage is asserted.':'Provider access is not configured; no observation opportunity is asserted.'};
}
function remoteOpportunities(sources={}){return[
  remoteOpportunity('remote:viirs','VIIRS next useful observation','satellite_thermal',sources.firms),
  remoteOpportunity('remote:sentinel3','Sentinel-3 SLSTR next useful observation','satellite_thermal',sources.sentinel3),
  remoteOpportunity('remote:mtg','MTG structured FRP next product','geostationary_thermal',sources.mtg,{cadenceMinutes:10}),
  remoteOpportunity('remote:sentinel2','Sentinel-2 next optical opportunity','satellite_optical',sources.sentinel2,{publicCatalogue:true})
];}

export class ObservationOpportunityService {
  constructor({ filePath, orbitFile = null, reader = readJson, clock = () => new Date(), horizonHours = 168, operationsStore = null } = {}) {
    Object.assign(this, { filePath, orbitFile, reader, clock, horizonHours, operationsStore }); this.records = []; this.orbitSnapshot = null; this.loadedAt = null; this.error = null;
  }
  async refresh() {
    try {
      const payload = this.filePath ? await this.reader(this.filePath, { opportunities: [] }) : { opportunities: [] };
      this.records = Array.isArray(payload?.opportunities) ? payload.opportunities : [];
      this.orbitSnapshot = this.orbitFile ? await this.reader(this.orbitFile, null) : null;
      this.loadedAt = this.clock().toISOString(); this.error = null;
    } catch (error) { this.records = []; this.loadedAt = this.clock().toISOString(); this.error = String(error.message ?? error); }
    return this.snapshot();
  }
  snapshot() {
    const confirmed = this.records.filter((item) => ['confirmed', 'committed'].includes(String(item.scheduleState).toLowerCase())).length;
    return { id: 'observationSchedule', label: 'Observation opportunity planner', state: this.error ? 'unavailable' : confirmed || this.orbitSnapshot ? 'current' : 'planner_ready', fetchedAt: this.loadedAt, upstreamAt: this.orbitSnapshot?.fetchedAt ?? null, count: this.records.length, confirmedCount: confirmed, orbitalElements: this.orbitSnapshot?.satellites?.length ?? 0, passDependentSources:4, error: this.error };
  }
  async plan(event, connectedPlan = {}, sourceStates = {}) {
    if (!this.loadedAt) await this.refresh();
    const now = this.clock();
    const connected = (connectedPlan.options ?? []).map(currentObservationOpportunity).filter(Boolean);
    const current = connected.filter((item)=>item.availability==='AVAILABLE_NOW');
    const future = this.records.map((item) => scheduledObservationOpportunity(item, event.coordinate, { now, horizonHours: this.horizonHours })).filter(Boolean);
    const remote=remoteOpportunities(sourceStates);
    const opportunityV2=[];
    const evidenceNeedId=linkedEvidenceNeedId(event);
    if(event.id) for(const item of current) opportunityV2.push(createObservationOpportunity({eventId:event.id,sourceFamily:item.sourceId,platform:item.label,opportunityType:'FIELD_CAPACITY',authority:'CONFIGURED_ASSET_REGISTRY',coverageAssumptions:{eventCoordinate:event.coordinate,ownerId:item.ownerId},qualityDependencies:{requiresOwnerAcknowledgement:true,requiresAttributableEvidence:true},blockerReason:null,evidenceNeedId,canCloseEvidenceNeed:true},{now}));
    if(event.id) for(const item of future) opportunityV2.push(createObservationOpportunity({eventId:event.id,sourceFamily:item.sourceId,platform:item.label,windowStart:item.scheduledAt,windowEnd:item.scheduledAt,opportunityType:'PREDICTED_ORBITAL_PASS',authority:`CONFIRMED_SCHEDULE:${item.commitment.id}`,coverageAssumptions:{bbox:item.coverage.bbox,eventCoordinate:event.coordinate},qualityDependencies:{requiresSuccessfulAcquisition:true,requiresUsableCoverage:true,requiresQualityReview:true},blockerReason:null,evidenceNeedId,expiresAt:item.scheduledAt,canCloseEvidenceNeed:true},{now}));
    if(event.id&&this.orbitSnapshot&&Array.isArray(event.coordinate)) for(const item of predictOrbitalPasses({eventId:event.id,coordinate:event.coordinate,orbitSnapshot:this.orbitSnapshot,from:now,horizonHours:12})) opportunityV2.push(createObservationOpportunity({...item,evidenceNeedId},{now}));
    if(event.id) for(const spec of [
      {sourceFamily:'viirs',platform:'NASA/NOAA VIIRS via FIRMS',source:sourceStates.firms},
      {sourceFamily:'sentinel3_slstr',platform:'Copernicus Sentinel-3 SLSTR',source:sourceStates.sentinel3},
      {sourceFamily:'sentinel2_msi',platform:'Copernicus Sentinel-2 MSI',source:sourceStates.sentinel2}
    ]) opportunityV2.push(providerOpportunity(event,spec,evidenceNeedId,now));
    await this.operationsStore?.upsertOpportunities?.(opportunityV2);
    const opportunityResults=await this.operationsStore?.reconcileOpportunityResults?.(event)??[];
    const { options, ranking } = rankObservationOpportunities([...current, ...future, manualOpportunity(),...connected.filter((item)=>item.availability!=='AVAILABLE_NOW'),...remote]);
    const recommended = options.find((item) => ['AVAILABLE_NOW','SCHEDULED_CONFIRMED'].includes(item.availability)) ?? null;
    return {
      state: current.length ? 'CURRENT_AVAILABLE' : future.length ? 'FUTURE_SCHEDULED' : remote.some((item)=>['PASS_DEPENDENT','ESTIMATED_CADENCE'].includes(item.availability))?'REMOTE_PASS_DEPENDENT':'MANUAL_ONLY',
      recommended, current, future, remote, opportunitiesV2:opportunityV2, opportunityResults, options, ranking,
      reason: current.length ? 'At least one connected asset is available now.' : future.length ? 'No connected asset is available now; a confirmed future observation covers this event.' : 'Remote sources are pass-dependent or access-blocked. No event-specific acquisition time is confirmed; manual escalation remains available if an owner accepts it.'
    };
  }
}
