import { portugalFocusGeoJson } from '../../map/portugal-geometry.js';

function point(item, kind, selected, extras = {}) {
  if (!Array.isArray(item?.coordinate)) return null;
  return { type: 'Feature', id: `${kind}:${item.id}`, properties: { id: String(item.id), kind, selected: selected?.kind === kind && String(selected.id) === String(item.id) ? 1 : 0, label: item.municipality ?? item.place ?? item.name ?? item.title ?? kind, score: Number(item.priority ?? item.operatives ?? 0), level: Number(item.dangerLevel ?? 0), stage: item.truthStage ?? item.state ?? '', freshness: item.freshness?.state ?? '', ...extras }, geometry: { type: 'Point', coordinates: item.coordinate } };
}
function collection(features) { return { type: 'FeatureCollection', features: features.filter(Boolean) }; }

export function buildMapData(state) {
  const data = state.bootstrap; if (!data) return { country: portugalFocusGeoJson(), points: collection([]), spread: collection([]), assets: collection([]) };
  const selected = state.selected; const prevention = data.prevention; const detection = data.detection; const operations = data.operations;
  const liveEventPoints = (state.live?.events ?? []).map((item) => point(item, 'event', selected, { stage: item.evidenceState, freshness: item.reportState?.sourceActivity ?? item.evolutionState, evolution: item.behaviorState ?? 'unknown', evidence: item.evidenceState, knowledge: item.knowledgeState ?? 'unknown', physicalFreshness: item.physicalState?.freshness ?? 'unobserved', lifecycle: item.evolutionState ?? 'current', score: item.priority?.rank ?? 0, leadMinutes: item.leadTime?.minutes ?? null, physicalFamilyCount:item.physicalSourceProfile?.familyCount??0, twoPhysicalSourceFamilies:item.physicalSourceProfile?.twoPhysicalSourceFamilies?1:0 }));
  const findingPoints=(prevention.findings??[]).map((item)=>point({...item,id:item.findingId},'finding',selected,{stage:item.calibrationState,freshness:'screening',score:item.structuresWithinPolicyRadius??0}));
  const replaySteps = state.replayCase?.controlledClock?.steps ?? [];
  const replayIndex = Math.max(0, Math.min(replaySteps.length - 1, state.replayTimeIndex ?? replaySteps.length - 1));
  const replayTargetMs = Date.parse(replaySteps[replayIndex] ?? '');
  const replayEvidence = (state.replayCase?.evidence ?? []).filter((item) => Number.isFinite(replayTargetMs) && Date.parse(item.visibleAt) <= replayTargetMs);
  const replayCatalogue = state.replay?.cases ?? [];
  const visibleReplayReports = state.replayCase && Number.isFinite(replayTargetMs)
    ? replayCatalogue.filter((item) => String(item.id) === String(state.replayCase.case?.id) && Date.parse(item.alertAt) <= replayTargetMs)
    : replayCatalogue;
  const replayCases = visibleReplayReports.map((item) => point(item, 'replay', selected, { stage: item.physicalFirst ? 'physical-first' : 'report-first', physicalFirst: item.physicalFirst ? 1 : 0, associated: item.benchmark?.associated ? 1 : 0, fragmented: item.benchmark?.fragmented ? 1 : 0, reportVisible: 1, leadMinutes: item.physicalLeadMinutes ?? null }));
  const replayThermal = replayEvidence.filter((item) => item.kind === 'thermal').map((item) => point(item, 'thermal', selected, { label: `${item.source} · ${item.frpMw ?? '—'} MW`, stage: 'official-archive', freshness: 'historical', frpMw: item.frpMw ?? null }));
  const candidatePoints = (prevention.candidates ?? []).map((item) => point(item, 'prevention', selected));
  const hazardPoints = (operations.hazards ?? []).map((item) => point(item, 'hazard', selected));
  const incidentPoints = (detection.incidents ?? []).map((item) => point(item, 'incident', selected));
  const thermalPoints = (data.world.thermalDetections ?? []).map((item) => point(item, 'thermal', selected));
  const fieldPoints = (operations.evidenceRequests ?? []).map((item) => point(item, 'prevention', selected, { label: item.title, requestState: item.state }));
  const remediationPoints = (operations.remediations ?? []).map((item) => point(item, 'hazard', selected, { label: item.title, remediationState: item.state }));
  let points = [];
  if (state.view === 'live') points = [...findingPoints,...liveEventPoints];
  else if (state.view === 'replay') points = [...replayCases, ...replayThermal];
  else if (state.view === 'command') points = [...liveEventPoints.slice(0,8), ...candidatePoints.slice(0, 8), ...hazardPoints];
  else if (state.view === 'observe') points = [...findingPoints,...candidatePoints, ...hazardPoints];
  else if (state.view === 'incidents') points = state.selected?.kind==='replay'?[...replayCases,...replayThermal,...liveEventPoints]:liveEventPoints;
  else if (state.view === 'field') points = [...fieldPoints, ...remediationPoints];
  else if (state.view === 'consequence') points = incidentPoints.filter((item) => item.properties.selected);
  else points = remediationPoints;
  const envelopes = state.consequence?.spread?.envelopes ?? []; const selectedEnvelope = envelopes[state.timelineIndex ?? 1];
  const spread = selectedEnvelope ? [selectedEnvelope.high ?? selectedEnvelope.outer, selectedEnvelope.central, selectedEnvelope.low].filter(Boolean).map((feature, index) => ({ ...feature, properties: { ...(feature.properties ?? {}), sensitivity: index === 0 ? 'high' : index === 1 ? 'central' : 'low' } })) : [];
  const assets = (state.exposure?.assets ?? []).map((item) => point(item, 'asset', selected));
  const slots = state.live?.thermal?.replaySlots ?? [];
  const selectedEvent = state.selected?.kind === 'event' ? (state.live?.events ?? []).find((item) => String(item.id) === String(state.selected.id)) : null;
  const eventTimeline = selectedEvent?.timeline ?? []; const eventIndex = Math.max(0, Math.min(eventTimeline.length - 1, state.liveTimeIndex ?? eventTimeline.length - 1));
  const targetMs = Date.parse(eventTimeline[eventIndex]?.at ?? '');
  const liveTime = slots.length && Number.isFinite(targetMs) ? slots.reduce((best, slot) => Math.abs(Date.parse(slot)-targetMs) < Math.abs(Date.parse(best)-targetMs) ? slot : best, slots[0]) : slots.at(-1) ?? 'latest';
  const thermalOverlay = state.view === 'live' && state.liveThermalEnabled === true && state.live?.thermal?.state === 'current'
    ? { url: `/api/v10/events/thermal/overlay?provider=auto&time=${encodeURIComponent(liveTime)}`, bbox: [-9.75, 36.7, -6, 42.3], acquiredAt: liveTime, provider: state.live.thermal.selectedProvider }
    : null;
  const liveEventGeometry = ['live','incidents','command'].includes(state.view) ? (state.live?.events ?? []).filter((item) => item.observedGeometry && (String(item.id) === String(selectedEvent?.id) || item.evolutionState === 'growing')).slice(0,4).map((item) => {
    const isSelected = String(item.id) === String(selectedEvent?.id); const snapshots = item.geometryTimeline ?? [];
    const replayGeometry = isSelected && Number.isFinite(targetMs) ? [...snapshots].reverse().find((snapshot) => Date.parse(snapshot.at) <= targetMs)?.geometry : null;
    const geometry = replayGeometry ?? item.observedGeometry;
    return { ...geometry, properties: { ...geometry.properties, eventId:item.id, selected:isSelected?1:0, evolution:item.behaviorState ?? 'unknown', evidence:item.evidenceState, knowledge:item.knowledgeState ?? 'unknown', geometryFreshness:item.geometryFreshness ?? 'unknown', movementBearing:item.movement?.bearingDeg ?? null, movementKm:item.movement?.distanceKm ?? null, replayAt:isSelected&&eventTimeline[eventIndex]?.at?eventTimeline[eventIndex].at:null } };
  }) : [];
  const replayEventId = state.replayCase?.benchmark?.reportEventId;
  const replayEventGeometry = (state.view === 'replay' || (state.view === 'incidents' && state.selected?.kind === 'replay')) ? (state.replayCase?.derived?.events ?? []).filter((item) => item.observedGeometry && (!replayEventId || String(item.id) === String(replayEventId))).slice(0,4).map((item) => {
    const snapshots = item.geometryTimeline ?? [];
    const snapshot = Number.isFinite(replayTargetMs) ? [...snapshots].reverse().find((entry) => Date.parse(entry.at) <= replayTargetMs) : null;
    const geometry = Number.isFinite(replayTargetMs) ? snapshot?.geometry : item.observedGeometry;
    if (!geometry) return null;
    return { ...geometry, properties: { ...(geometry.properties ?? {}), eventId: item.id, selected: String(item.id) === String(replayEventId) ? 1 : 0, evolution: item.behaviorState ?? 'unknown', evidence: item.evidenceState, knowledge: item.knowledgeState ?? 'unknown', geometryFreshness: 'historical', movementBearing: null, movementKm: null, replayAt: replaySteps[replayIndex] ?? null, perimeterAuthority: false } };
  }) : [];
  const findingGeometry=['live','observe'].includes(state.view)?(prevention.findings??[]).filter((item)=>item.geometry).map((item)=>({...item.geometry,properties:{findingId:item.findingId,selected:String(item.findingId)===String(state.selected?.id)?1:0,evolution:'screening',geometryFreshness:'screening',phenomenon:'fuel-continuity'}})):[];
  const fireGeometry = state.view === 'replay' || (state.view==='incidents'&&state.selected?.kind==='replay') ? replayEventGeometry : liveEventGeometry;
  const eventGeometry=[...findingGeometry,...fireGeometry];
  return { country: portugalFocusGeoJson(), points: collection(points), spread: collection(spread), assets: collection(assets), thermalOverlay, eventGeometry: collection(eventGeometry) };
}
