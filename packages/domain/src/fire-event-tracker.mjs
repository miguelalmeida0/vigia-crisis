import { createHash } from 'node:crypto';
import { haversineKm } from './geo.mjs';
import { inspectTimestamp } from './timestamp-firewall.mjs';
import { chooseEventHypothesis, eventAssociation } from './event-association.mjs';
import { fireEventGeometry, fireEventGeometryState, thermalObservationFootprint } from './fire-event-geometry.mjs';
import { fireEventState } from './fire-event-state.mjs';
import { normalizePhysicalObservation } from './physical-observation.mjs';

const DEFAULTS = Object.freeze({ maxGapHours: 32, ambiguityMargin: .08, currentThermalMinutes: 90 });
const PHYSICAL_TYPES=new Set(['thermal','camera','ground_sensor','drone','field']);

function cleanTimestamp(value, now) { const result = inspectTimestamp(value, { now }); return result.valid ? result.value : null; }
function observationTime(observation) { return Date.parse(observation.at); }
function minutesBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 60_000); }
function sourceRank(type) { return PHYSICAL_TYPES.has(type) ? 0 : type === 'report' ? 1 : 2; }
function optionalNumber(value){if(value===null||value===undefined||(typeof value==='string'&&value.trim()==='')||typeof value==='boolean')return null;const number=Number(value);return Number.isFinite(number)?number:null;}

export function buildEventObservations({ fires = [], thermalDetections = [], now = new Date() } = {}) {
  const observations = [];
  for (const fire of fires) {
    const startedAt = cleanTimestamp(fire.startedAt ?? fire.updatedAt, now); const updatedAt = cleanTimestamp(fire.updatedAt, now);
    const provenance = { ...(fire.provenance ?? {}), synthetic: fire.provenance?.synthetic === true, origin: fire.provenance?.origin ?? 'ptdata_public_report', rawSourceProductId: fire.provenance?.rawSourceProductId ?? fire.rawSourceProductId ?? null };
    const common = { source: 'civil-protection', provenance, coordinate: fire.coordinate, incidentId: String(fire.id), replayCaseId: fire.replayCaseId ?? null, municipality: fire.municipality, district: fire.district, parish: fire.parish, status: fire.status, reportedStartedAt: startedAt, extinctionAt: cleanTimestamp(fire.extinctionAt, new Date('2100-01-01T00:00:00Z')), burnedAreaHa: optionalNumber(fire.burnedAreaHa), resources: { operatives: fire.operatives, ground: fire.ground, aerial: fire.aerial, available: fire.resourceDataAvailable === true } };
    if (startedAt) observations.push({ id: `report:${fire.id}:start`, type: 'report', at: startedAt, ...common });
    if (updatedAt && updatedAt !== startedAt) observations.push({ id: `report:${fire.id}:update:${updatedAt}`, type: 'report_update', at: updatedAt, ...common });
  }
  for (const detection of thermalDetections) {
    const at = cleanTimestamp(detection.observedAt, now); if (!at) continue;
    try { const observation=normalizePhysicalObservation({ id: `thermal:${detection.id}`, type: 'thermal', source: detection.source ?? detection.sourceKey ?? 'satellite', provenance: { ...(detection.provenance ?? {}), synthetic: detection.provenance?.synthetic === true }, at, receivedAt: detection.receivedAt ?? now.toISOString(), providerReceivedAt:detection.providerReceivedAt??null,providerDiscoveredAt:detection.providerDiscoveredAt??null,productSensingStartAt:detection.productSensingStartAt??null,productSensingEndAt:detection.productSensingEndAt??null,vigiaAcquisitionStartedAt:detection.vigiaAcquisitionStartedAt??null,downloadStartedAt:detection.downloadStartedAt??null,downloadCompletedAt:detection.downloadCompletedAt??null,archivePersistedAt:detection.archivePersistedAt??null,parseStartedAt:detection.parseStartedAt??null,vigiaAcquiredAt:detection.vigiaAcquiredAt??detection.receivedAt??null,vigiaParsedAt:detection.vigiaParsedAt??null,vigiaCanonicalizedAt:detection.vigiaCanonicalizedAt??null,vigiaIngestedAt:detection.vigiaIngestedAt??null, coordinate: detection.coordinate, thermalId: String(detection.id), replayCaseId: detection.replayCaseId ?? null, satellite: detection.satellite, instrument: detection.instrument ?? 'thermal', sourceKey: detection.sourceKey ?? null, sourceFamily: detection.sourceFamily ?? detection.instrument ?? 'thermal', independenceGroup: detection.independenceGroup ?? detection.satellite ?? detection.instrument ?? 'thermal', measurementType:detection.measurementType??null,frpMw: optionalNumber(detection.frpMw), frpUncertaintyMw: optionalNumber(detection.frpUncertaintyMw), brightnessK: optionalNumber(detection.brightnessK), confidence: detection.confidence ?? null, scanKm: optionalNumber(detection.scanKm), trackKm: optionalNumber(detection.trackKm), nominalResolutionKm: optionalNumber(detection.nominalResolutionKm), footprint: detection.footprint ?? null, qualityFlags: Array.isArray(detection.qualityFlags) ? detection.qualityFlags : [], hotspotType: detection.hotspotType ?? null, hotspotClass: detection.hotspotClass ?? 'unclassified' }, { receivedAt: now });observation.footprint??=thermalObservationFootprint(observation);observations.push(observation); } catch (error) { if (error?.code === 'production_integrity_violation') throw error; }
  }
  return observations.filter((item) => Array.isArray(item.coordinate) && item.coordinate.length === 2 && item.coordinate.every(Number.isFinite))
    .sort((a, b) => observationTime(a) - observationTime(b) || sourceRank(a.type) - sourceRank(b.type) || a.id.localeCompare(b.id));
}

function eventDistance(event, observation) { return Math.min(...event.observations.slice(-10).map((item) => haversineKm(item.coordinate, observation.coordinate))); }
function normalizePlace(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function placeAffinity(event, observation) {
  if (!['report','report_update'].includes(observation.type)) return false;
  const reports=event.observations.filter((item)=>['report','report_update'].includes(item.type));
  const municipality=normalizePlace(observation.municipality), parish=normalizePlace(observation.parish);
  return reports.some((item)=>{ const sameMunicipality=municipality && normalizePlace(item.municipality)===municipality; const sameParish=parish && normalizePlace(item.parish)===parish; return sameParish || (sameMunicipality && !parish); });
}
function eligible(event, observation, options) {
  const last = event.observations.at(-1); const gapHours = Math.abs(observationTime(observation) - observationTime(last)) / 3_600_000;
  if (gapHours > options.maxGapHours) return null;
  const distanceKm = eventDistance(event, observation); const samePlace=placeAffinity(event,observation); const threshold = observation.type === 'thermal' ? options.thermalDistanceKm : PHYSICAL_TYPES.has(observation.type) ? options.physicalDistanceKm : samePlace ? options.samePlaceReportDistanceKm : options.reportDistanceKm;
  if (distanceKm > threshold) return null;
  const hasReport = event.observations.some((item) => ['report','report_update'].includes(item.type)); const hasPhysical = event.observations.some((item) => PHYSICAL_TYPES.has(item.type));
  const crossSource = (PHYSICAL_TYPES.has(observation.type) && hasReport) || (['report','report_update'].includes(observation.type) && hasPhysical);
  if (crossSource) { const association = eventAssociation([...event.observations, observation]); if (association.state === 'associated' && association.grade === 'weak') return null; }
  const sameIncident = observation.incidentId && event.incidentIds.has(observation.incidentId);
  return { score: (sameIncident ? -10 : 0) + (samePlace ? -1.2 : 0) + distanceKm + gapHours * .12, distanceKm, gapHours, sameIncident: Boolean(sameIncident), samePlace };
}
function temporaryEvent(observation, decision = null) { return { observations: [observation], incidentIds: new Set(observation.incidentId ? [observation.incidentId] : []), manualEventId: observation.manualEventId ?? null, associationDecisions: decision ? [{ observationId: observation.id, at: observation.at, ...decision }] : [] }; }
function reportWindowContains(report,observation){const at=Date.parse(observation.at),start=Date.parse(report.reportedStartedAt??report.at)-12*3_600_000,end=Number.isFinite(Date.parse(report.extinctionAt??''))?Date.parse(report.extinctionAt)+24*3_600_000:Date.parse(report.at)+7*24*3_600_000;return at>=start&&at<=end;}
function reconcileWithVisibleReportAnchors(events,options){
  const all=events.flatMap((event)=>event.observations),reports=all.filter((item)=>item.type==='report');
  if(reports.length<1||all.some((item)=>item.manualEventId))return events;
  const anchors=reports.map((report)=>temporaryEvent(report)),byIncident=new Map(anchors.map((event)=>[event.observations[0].incidentId,event]));
  for(const update of all.filter((item)=>item.type==='report_update')){const target=byIncident.get(update.incidentId);if(target)target.observations.push(update);}
  const originalByObservation=new Map();for(const event of events)for(const observation of event.observations)originalByObservation.set(observation.id,event);
  const unanchored=new Map();
  for(const observation of all.filter((item)=>!['report','report_update'].includes(item.type))){
    const ranked=anchors.map((event)=>{const report=event.observations[0],distanceKm=haversineKm(report.coordinate,observation.coordinate);if(distanceKm>12||!reportWindowContains(report,observation))return null;const hoursFromAlert=Math.abs(Date.parse(observation.at)-Date.parse(report.at))/3_600_000;return{event,report,distanceKm,score:(1-distanceKm/12)*.97+Math.max(0,1-hoursFromAlert/(7*24))*.03};}).filter(Boolean).sort((a,b)=>b.score-a.score||a.distanceKm-b.distanceKm);
    const best=ranked[0],alternative=ranked[1],margin=best&&alternative?best.score-alternative.score:1;
    const original=originalByObservation.get(observation.id),originalPhysical=original?.observations?.filter((item)=>PHYSICAL_TYPES.has(item.type))??[];
    const continuitySeed=best&&originalPhysical.length>=2&&originalPhysical.some((item)=>haversineKm(best.report.coordinate,item.coordinate)<=3);
    const anchorFitSufficient=best&&best.score>=(options.anchorMinimumFit??.74);
    if(best&&(anchorFitSufficient||continuitySeed)&&margin>=(options.anchorAmbiguityMargin??.05)){
      best.event.observations.push(observation);best.event.incidentIds.add(best.report.incidentId);best.event.associationDecisions.push({observationId:observation.id,at:observation.at,state:'associated',calibrated:false,scoreKind:'interpretable_evidence_fit_score',separationMargin:Number(margin.toFixed(3)),best:{eventId:best.report.incidentId,score:Number(best.score.toFixed(3)),nearestDistanceKm:Number(best.distanceKm.toFixed(3)),reasonCodes:['VISIBLE_REPORT_ANCHOR','REPORT_LIFECYCLE_COMPATIBLE']},alternative:alternative?{eventId:alternative.report.incidentId,score:Number(alternative.score.toFixed(3)),nearestDistanceKm:Number(alternative.distanceKm.toFixed(3))}:null,reasonCodes:['VISIBLE_REPORT_ANCHOR','REPORT_LIFECYCLE_COMPATIBLE']});
    }else{
      const key=original??observation.id;if(!unanchored.has(key))unanchored.set(key,{observations:[],incidentIds:new Set(),manualEventId:null,associationDecisions:[]});const target=unanchored.get(key);target.observations.push(observation);const ambiguous=Boolean(best);target.associationDecisions.push({observationId:observation.id,at:observation.at,state:ambiguous?'ambiguous':'new_event',calibrated:false,scoreKind:'interpretable_evidence_fit_score',separationMargin:best?Number(margin.toFixed(3)):null,best:best?{eventId:best.report.incidentId,score:Number(best.score.toFixed(3)),nearestDistanceKm:Number(best.distanceKm.toFixed(3))}:null,alternative:alternative?{eventId:alternative.report.incidentId,score:Number(alternative.score.toFixed(3)),nearestDistanceKm:Number(alternative.distanceKm.toFixed(3))}:null,reasonCodes:ambiguous&&(anchorFitSufficient||continuitySeed)?['COMPETING_REPORT_ANCHORS','INSUFFICIENT_SEPARATION_MARGIN']:ambiguous?['REPORT_ANCHOR_VS_NEW_EVENT_UNCERTAIN','FIT_BELOW_AUTOMATIC_ASSOCIATION_THRESHOLD']:['NO_VISIBLE_REPORT_ANCHOR']});
    }
  }
  return[...anchors.filter((event)=>event.observations.length>0),...unanchored.values()].filter((event)=>event.observations.length>0);
}
function stableId(event) { const first = event.observations[0]; const seed = first.incidentId ? `incident:${first.incidentId}` : `${first.type}:${first.id}:${first.at}`; return `PT-${String(new Date(first.at).getUTCFullYear())}-${createHash('sha1').update(seed).digest('hex').slice(0, 7).toUpperCase()}`; }
function centroid(observations) { const points = observations.map((item) => item.coordinate); return [points.reduce((sum, item) => sum + item[0], 0) / points.length, points.reduce((sum, item) => sum + item[1], 0) / points.length]; }

function trendStats(samples) {
  if (samples.length < 2) return { direction: 'unknown', deltaMw: null, deltaPercent: null, slopeMwPerMin: null };
  const firstMs = Date.parse(samples[0].at); const times = samples.map((item) => (Date.parse(item.at) - firstMs) / 60_000); const values = samples.map((item) => item.frpMw);
  const meanT = times.reduce((sum, value) => sum + value, 0) / times.length; const meanY = values.reduce((sum, value) => sum + value, 0) / values.length;
  const denominator = times.reduce((sum, value) => sum + (value - meanT) ** 2, 0); const slope = denominator > 0 ? times.reduce((sum, value, index) => sum + (value - meanT) * (values[index] - meanY), 0) / denominator : 0;
  const duration = Math.max(1, times.at(-1) - times[0]); const deltaMw = slope * duration; const reference = Math.max(5, Math.abs(meanY) * .18);
  const direction = deltaMw >= reference ? 'rising' : deltaMw <= -reference ? 'cooling' : 'steady'; const first = values[0]; const deltaPercent = Math.abs(first) > .1 ? deltaMw / Math.abs(first) * 100 : null;
  return { direction, deltaMw, deltaPercent, slopeMwPerMin: slope };
}

export function thermalTrend(observations = [], { now = new Date(), currentMinutes = 90 } = {}) {
  const thermal = observations.filter((item) => item.type === 'thermal' && Number.isFinite(item.frpMw)).sort((a, b) => observationTime(a) - observationTime(b));
  if (!thermal.length) return { state: 'none', direction: 'unknown', currentDirection: 'unknown', firstMw: null, latestMw: null, deltaMw: null, deltaPercent: null, samples: 0, currentSamples: 0, lastObservedAt: null, ageMinutes: null, series: [] };
  const first = thermal[0].frpMw; const latest = thermal.at(-1).frpMw; const historical = trendStats(thermal);
  const lastObservedAt = thermal.at(-1).at; const ageMinutes = Math.max(0, (now.getTime() - Date.parse(lastObservedAt)) / 60_000);
  const cutoff = Date.parse(lastObservedAt) - currentMinutes * 60_000; const recent = thermal.filter((item) => Date.parse(item.at) >= cutoff); const current = trendStats(recent);
  const currentDirection = ageMinutes <= currentMinutes && recent.length >= 2 ? current.direction : 'unknown';
  return { state: thermal.length >= 2 ? 'tracked' : 'observed', direction: historical.direction, currentDirection, firstMw: first, latestMw: latest, deltaMw: historical.deltaMw, deltaPercent: historical.deltaPercent, slopeMwPerMin: historical.slopeMwPerMin, currentDeltaMw: current.deltaMw, currentDeltaPercent: current.deltaPercent, currentSlopeMwPerMin: current.slopeMwPerMin, samples: thermal.length, currentSamples: recent.length, trendWindowMinutes: currentMinutes, lastObservedAt, ageMinutes, series: thermal.map((item) => ({ id: item.id, at: item.at, frpMw: item.frpMw, frpUncertaintyMw:item.frpUncertaintyMw??null, sensor: item.satellite || item.instrument || 'VIIRS', instrument:item.instrument??null, sourceFamily:item.sourceFamily??null, independenceGroup:item.independenceGroup??null, confidence: item.confidence ?? null, coordinate: item.coordinate, rawSourceProductId:item.provenance?.rawSourceProductId??null })) };
}

function eventState(event, now, options) {
  const thermal = thermalTrend(event.observations, { now, currentMinutes: options.currentThermalMinutes });
  const state = fireEventState(event.observations, thermal, { now });
  const hasReport = event.observations.some((item) => ['report','report_update'].includes(item.type));
  const physical = event.observations.filter((item) => PHYSICAL_TYPES.has(item.type)); const hasPhysical=physical.length>0; const hasThermal=physical.some((item)=>item.type==='thermal');
  const evidence = hasReport && hasPhysical ? 'multisource' : hasThermal ? 'satellite-only' : hasPhysical ? 'sensor-only' : 'reported';
  return { ...state, evidence, evolution: state.lifecycle, ageMinutes: state.eventAgeMinutes, thermalAgeMinutes: state.physical.ageMinutes };
}

function geometryTimeline(observations) {
  const frameEnds = [];
  for (let index = 0; index < observations.length; index += 1) {
    const current = observations[index];
    if (current.type !== 'thermal') continue;
    const previous = frameEnds.at(-1);
    if (previous?.at === current.at) {
      previous.index = index;
      previous.observationId = current.id;
      previous.observationCount += 1;
    } else frameEnds.push({ at:current.at,index,observationId:current.id,observationCount:1 });
  }
  const maximumFrames = 12;
  const selected = frameEnds.length <= maximumFrames
    ? frameEnds
    : Array.from({ length: maximumFrames }, (_, index) => frameEnds[Math.round(index * (frameEnds.length - 1) / (maximumFrames - 1))]);
  return selected.map((frame) => {
    const geometry = fireEventGeometry(observations.slice(0, frame.index + 1));
    return geometry ? {
      at:frame.at,
      observationId:frame.observationId,
      observationCount:frame.observationCount,
      geometry,
      ...(frameEnds.length > maximumFrames ? {
        representativeFrame:true,
        sourceFrameCount:frameEnds.length,
        qualification:'Representative cumulative geometry frame; complete point observations remain retained in physical truth.'
      } : {})
    } : null;
  }).filter(Boolean);
}

function eventLeadTime(event) { const thermal = event.observations.filter((item) => item.type === 'thermal').map((item) => item.at).sort()[0] ?? null; const report = event.observations.filter((item) => item.type === 'report').map((item) => item.at).sort()[0] ?? null; const minutes = thermal && report ? minutesBetween(thermal, report) : null; return { firstThermalAt: thermal, firstReportAt: report, minutes: minutes !== null && minutes > 0 ? minutes : null, thermalBeforeReport: minutes !== null && minutes > 0 }; }
function eventPlace(event) { const report = [...event.observations].reverse().find((item) => item.municipality); return { municipality: report?.municipality ?? null, district: report?.district ?? null, parish: report?.parish ?? null }; }

export function trackFireEvents(observations, { now = new Date(), ...overrides } = {}) {
  const options = { ...DEFAULTS, ...overrides }; let events = [];
  for (const observation of observations) {
    const forced=observation.manualEventId?events.find((event)=>event.manualEventId===observation.manualEventId):null;
    if(forced){forced.observations.push(observation);if(observation.incidentId)forced.incidentIds.add(observation.incidentId);continue;}
    if(observation.manualEventId){events.push(temporaryEvent(observation));continue;}
    const decision = chooseEventHypothesis(events, observation, options);
    const target = decision.target ?? temporaryEvent(observation, decision);
    if (!decision.target) events.push(target); else {
      target.observations.push(observation); if (observation.incidentId) target.incidentIds.add(observation.incidentId);
      target.associationDecisions ??= []; target.associationDecisions.push({ observationId: observation.id, at: observation.at, ...decision });
    }
  }
  events=reconcileWithVisibleReportAnchors(events,options);
  return events.map((event) => {
    event.observations.sort((a, b) => observationTime(a) - observationTime(b));
    const state = eventState(event, now, options); const leadTime = eventLeadTime(event); const place = eventPlace(event); const thermal = thermalTrend(event.observations, { now, currentMinutes: options.currentThermalMinutes }); const association = eventAssociation(event.observations); const geometryState=fireEventGeometryState(event.observations,{now,currentMinutes:options.currentThermalMinutes,agingMinutes:180});
    const evidenceState = state.evidence === 'multisource' && association.grade === 'weak' ? 'association-uncertain' : state.evidence;
    const decisions = event.associationDecisions ?? [];
    const ambiguous = decisions.filter((item) => item.state === 'ambiguous');
    const associationState=!event.observations.some((item)=>item.type==='report')&&ambiguous.length>0?'ambiguous':'canonical';
    const firstPhysical=event.observations.find((item)=>PHYSICAL_TYPES.has(item.type))??null,firstReport=event.observations.find((item)=>item.type==='report')??null,physicalFirst=Boolean(firstPhysical&&(!firstReport||Date.parse(firstPhysical.at)<=Date.parse(firstReport.at)));
    return { id: stableId(event), coordinate: centroid(event.observations), ...place, firstSeenAt: event.observations[0]?.at ?? null, lastSeenAt: event.observations.at(-1)?.at ?? null, physicalFirst,physicalFirstAt:physicalFirst?firstPhysical.at:null,evidenceState, evolutionState: state.evolution, knowledgeState: state.knowledge, behaviorState: state.behavior, reportState: state.report, physicalState: state.physical, ageMinutes: state.ageMinutes, thermalAgeMinutes: state.thermalAgeMinutes, leadTime, thermal, association, associationState, associationDecisions: decisions, ambiguousAssociations: ambiguous, evidenceNeeds: ambiguous.map((item) => ({ id: `need:association:${item.observationId}`, kind: 'association_disambiguation', state: 'waiting_for_observation', observationId: item.observationId, reasonCodes: item.reasonCodes, best: item.best, alternative: item.alternative, separationMargin: item.separationMargin })), observedGeometry: geometryState.current ?? geometryState.lastObserved ?? fireEventGeometry(event.observations), observedThermalSupport: geometryState.support, geometryFreshness: geometryState.freshness, geometryReferenceTime: geometryState.referenceTime, geometryCurrentUntil: geometryState.currentUntil, movement: geometryState.movement, geometryTimeline: geometryTimeline(event.observations), incidentIds: [...event.incidentIds], sources: [...new Set(event.observations.map((item) => item.source))], observations: event.observations };
  }).sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
}

export function buildFireEvents(input = {}, options = {}) { return trackFireEvents(buildEventObservations({ ...input, now: options.now ?? new Date() }), options); }
