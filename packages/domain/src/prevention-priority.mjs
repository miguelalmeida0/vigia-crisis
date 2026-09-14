import { clamp, round, weightedMean } from './math.mjs';

function normaliseTemperature(value) {
  if (!Number.isFinite(Number(value))) return 0.45;
  return clamp((Number(value) - 18) / 24, 0, 1);
}

function normaliseHumidity(value) {
  if (!Number.isFinite(Number(value))) return 0.45;
  return clamp(1 - Number(value) / 100, 0, 1);
}

function normaliseWind(value) {
  if (!Number.isFinite(Number(value))) return 0.35;
  return clamp(Number(value) / 52, 0, 1);
}

function normaliseRisk(level) {
  return clamp((Number(level) - 1) / 4, 0, 1);
}

export function computePreventionPriority({
  riskLevel,
  temperatureC,
  humidityPercent,
  windSpeedKph,
  exposureSignal = 0.45,
  recentFirePressure = 0,
  observationFreshness = 0.5
}) {
  const factors = {
    fireDanger: normaliseRisk(riskLevel),
    thermalStress: normaliseTemperature(temperatureC),
    atmosphericDryness: normaliseHumidity(humidityPercent),
    windPotential: normaliseWind(windSpeedKph),
    exposure: clamp(exposureSignal, 0, 1),
    recentFirePressure: clamp(recentFirePressure, 0, 1),
    observationFreshness: clamp(observationFreshness, 0, 1)
  };

  const score = weightedMean([
    { value: factors.fireDanger, weight: 0.29 },
    { value: factors.atmosphericDryness, weight: 0.18 },
    { value: factors.thermalStress, weight: 0.13 },
    { value: factors.windPotential, weight: 0.13 },
    { value: factors.exposure, weight: 0.17 },
    { value: factors.recentFirePressure, weight: 0.06 },
    { value: factors.observationFreshness, weight: 0.04 }
  ]);

  const priority = Math.round(score * 100);
  return {
    priority,
    band: priority >= 82 ? 'urgent' : priority >= 68 ? 'high' : priority >= 50 ? 'elevated' : 'watch',
    contextCompleteness: round([riskLevel, temperatureC, humidityPercent, windSpeedKph].filter((value) => Number.isFinite(Number(value))).length / 4, 2),
    factors: Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, round(value, 3)]))
  };
}

export function rankPreventionCandidates(candidates) {
  return [...candidates]
    .sort((a, b) => Number(b.priority) - Number(a.priority) || String(a.id).localeCompare(String(b.id)))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function computeFindingAttentionPriority(finding, { now = new Date() } = {}) {
  const finite = (value) => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const currentAt = Date.parse(finding.firstObservableInterval?.end ?? '');
  const ageDays = Number.isFinite(currentAt) ? Math.max(0,(now.getTime()-currentAt)/86_400_000) : null;
  const valid = finite(finding.sourceQuality?.validPixelFraction), currentCloud=finite(finding.sourceQuality?.currentCloudCover), comparisonCloud=finite(finding.sourceQuality?.comparisonCloudCover);
  const sourceQuality = valid !== null ? clamp(valid*(1-Math.max(currentCloud??0,comparisonCloud??0)/100),0,1) : null;
  const raw = {
    affectedArea: finite(finding.affectedAreaHa)===null?null:clamp(finite(finding.affectedAreaHa)/5,0,1),
    corridorSpan: finite(finding.corridorLengthM)===null?null:clamp(finite(finding.corridorLengthM)/750,0,1),
    structureProximity: finite(finding.nearestStructureM)===null?null:clamp(1-finite(finding.nearestStructureM)/150,0,1),
    structuresInRadius: finite(finding.structuresWithinPolicyRadius)===null?null:clamp(finite(finding.structuresWithinPolicyRadius)/8,0,1),
    roadCrossings: finite(finding.roadCrossings)===null?null:clamp(finite(finding.roadCrossings)/3,0,1),
    criticalAssetProximity: finite(finding.criticalAssetProximityM)===null?null:clamp(1-finite(finding.criticalAssetProximityM)/1_000,0,1),
    changeRecency: ageDays===null?null:clamp(1-ageDays/45,0,1), sourceQuality
  };
  const weights={affectedArea:.14,corridorSpan:.18,structureProximity:.20,structuresInRadius:.15,roadCrossings:.08,criticalAssetProximity:.10,changeRecency:.08,sourceQuality:.07};
  const entries=Object.entries(raw).filter(([,value])=>value!==null).map(([key,value])=>({value,weight:weights[key]}));
  const score=Math.round(weightedMean(entries)*100),measuredWeight=round(entries.reduce((sum,item)=>sum+item.weight,0),3);
  return {score,band:score>=78?'immediate':score>=60?'high':score>=42?'elevated':'watch',scoreKind:'ATTENTION_PRIORITY_NOT_PROBABILITY',factors:Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,value===null?null:round(value,3)])),weights,measuredWeight,unmeasured:Object.entries(raw).filter(([,value])=>value===null).map(([key])=>key),basis:'Explicit physical-change, exposure, recency and source-quality factors. This is not ignition or fire probability.'};
}
