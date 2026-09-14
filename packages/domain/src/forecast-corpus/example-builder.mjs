import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { FORECAST_CORPUS_HORIZONS, FORECAST_EXAMPLE_REJECTIONS, PERIMETER_SOURCE_CLASSES } from './constants.mjs';
import { validateCorpusGeometry } from './geometry-qa.mjs';
import { validateHistoricalContextPack } from './context-pack-qa.mjs';
import { availableAtCutoff } from './knowledge-time.mjs';
import { validateWeatherRun } from './weather-qa.mjs';

const eligibleClass = (value) => PERIMETER_SOURCE_CLASSES.slice(0, 3).includes(value);
const clocksCausal = (state) => Number.isFinite(Date.parse(state?.clocks?.observedAt)) && Number.isFinite(Date.parse(state?.clocks?.availableToVigiaAt)) && Date.parse(state.clocks.observedAt) <= Date.parse(state.clocks.availableToVigiaAt);
function futureLabelIndex(states){return states.map((state,order)=>({state,order,observedAt:Date.parse(state?.clocks?.observedAt),availableAt:Date.parse(state?.clocks?.availableToVigiaAt)})).filter((item)=>clocksCausal(item.state)).sort((left,right)=>left.observedAt-right.observedAt||left.order-right.order);}
function lowerBound(rows,value){let low=0,high=rows.length;while(low<high){const middle=(low+high)>>1;if(rows[middle].observedAt<value)low=middle+1;else high=middle;}return low;}
const futureLabel = (index, issuedAt, cutoff, horizon) => {
  const issued=Date.parse(issuedAt),available=Date.parse(cutoff),offset=horizon*3_600_000,target=issued+offset,tolerance=Math.max(30*60_000,offset*.25),start=lowerBound(index,target-tolerance),candidates=[];
  for(let position=start;position<index.length&&index[position].observedAt<=target+tolerance;position+=1){const item=index[position];if(item.observedAt>issued&&item.availableAt>available)candidates.push(item);}
  candidates.sort((left,right)=>Math.abs(left.observedAt-target)-Math.abs(right.observedAt-target)||left.order-right.order);return candidates[0]?.state??null;
};
export function buildForecastExamples({ incidents = [], horizons = FORECAST_CORPUS_HORIZONS, policyVersion = '1.0.0' } = {}) {
  const examples = [], rejections = [];
  for (const incident of [...incidents].sort((a, b) => a.id.localeCompare(b.id))) {
    const states = [...(incident.perimeterStates ?? [])].sort((a, b) => Date.parse(a.clocks.availableToVigiaAt) - Date.parse(b.clocks.availableToVigiaAt));
    const labelIndex=futureLabelIndex(states);
    for (let index = 0; index < Math.max(1, states.length); index += 1) {
      const current = states[index], cutoff = current?.clocks.availableToVigiaAt ?? incident.discoveryTime, invariantReasons = [];
      const history = current ? states.slice(0, index + 1).filter((state) => clocksCausal(state) && availableAtCutoff(state.clocks, cutoff) && Date.parse(state.clocks.observedAt) <= Date.parse(cutoff)) : [];
      if (current && !clocksCausal(current)) invariantReasons.push('KNOWLEDGE_TIME_VIOLATION');
      if (!eligibleClass(incident.perimeterSourceClass)) invariantReasons.push('NO_PROGRESS_SEQUENCE');
      if (history.length < 3) invariantReasons.push('INSUFFICIENT_HISTORY');
      const geometryQa = current ? validateCorpusGeometry({ geometry: current.geometry, originalHash: current.originalGeometryHash }) : { passed: false };
      if (!geometryQa.passed) invariantReasons.push('INVALID_GEOMETRY');
      const domainBbox = geometryQa.bbox, weather = (incident.weatherRuns ?? []).filter((run) => Date.parse(run.issueTime) <= Date.parse(cutoff)).sort((a, b) => Date.parse(b.issueTime) - Date.parse(a.issueTime))[0];
      const weatherQa = weather ? validateWeatherRun(weather, { informationCutoff: cutoff, domainBbox }) : null;
      if (!weatherQa?.passed) invariantReasons.push('NO_ISSUE_TIME_WEATHER');
      const fuelQa = incident.fuelPack ? validateHistoricalContextPack(incident.fuelPack, { incidentDate: incident.discoveryTime, informationCutoff: cutoff, domainBbox }) : null;
      if (!fuelQa?.passed) invariantReasons.push('NO_FUEL_PACK');
      const terrainQa = incident.terrainPack ? validateHistoricalContextPack(incident.terrainPack, { incidentDate: incident.discoveryTime, informationCutoff: cutoff, domainBbox }) : null;
      if (!terrainQa?.passed) invariantReasons.push('NO_TERRAIN_PACK');
      if (incident.associationState === 'AMBIGUOUS') invariantReasons.push('AMBIGUOUS_INCIDENT');
      if (incident.outsideDomain) invariantReasons.push('OUTSIDE_DOMAIN');
      for (const horizon of horizons) {
      const reasons=[...invariantReasons],label=current?futureLabel(labelIndex,current.clocks.observedAt,cutoff,horizon):null;
      if (!label) reasons.push('NO_FUTURE_LABEL');
      const id = semanticHash('forecast-example-candidate', { incidentId: incident.id, currentStateId: current?.id ?? null, cutoff, horizon, policyVersion });
      const exactReasons = uniqueSorted(reasons).filter((reason) => FORECAST_EXAMPLE_REJECTIONS.includes(reason));
      if (exactReasons.length) { rejections.push({ id, incidentId: incident.id, informationCutoff: cutoff, horizonHours: horizon, reasons: exactReasons, qa: { geometry: geometryQa, weather: weatherQa, fuel: fuelQa, terrain: terrainQa } }); continue; }
      const core = { id, incidentId: incident.id, region: incident.region, season: incident.season, informationCutoff: cutoff, issuedAt: cutoff, horizonHours: horizon, operationalMode: 'NRT', features: history.map((state) => ({ id: state.id, kind: 'ISSUE_TIME_PERIMETER', role: 'FEATURE', geometry: state.geometry, observedAt: state.clocks.observedAt, availableToVigiaAt: state.clocks.availableToVigiaAt, processingMode: state.processingMode ?? 'NRT', bronzeRefs: state.bronzeRefs, silverRef: state.id })), weatherRuns: [weather], fuelPack: incident.fuelPack, terrainPack: incident.terrainPack, label: { id: label.id, geometry: label.geometry, observedAt: label.clocks.observedAt, availableToVigiaAt: label.clocks.availableToVigiaAt, role: 'TARGET_LABEL', bronzeRefs: label.bronzeRefs }, upstreamObservationIds: uniqueSorted(incident.upstreamObservationIds), physicalPixelIds: uniqueSorted(incident.physicalPixelIds), causalFamilies: uniqueSorted(incident.causalFamilies), provenanceComplete: history.every((state) => state.bronzeRefs?.length) && Boolean(label.bronzeRefs?.length), policyVersion };
      if (!core.provenanceComplete) rejections.push({ id, incidentId: incident.id, informationCutoff: cutoff, horizonHours: horizon, reasons: ['LEAKAGE_RISK'], detail: 'BRONZE_SILVER_LINEAGE_INCOMPLETE' }); else examples.push(core);
      }
    }
  }
  const core = { schemaVersion: 'vigia.forecast-example-build.v1', policyVersion, examples: examples.sort((a, b) => a.id.localeCompare(b.id)), rejections: rejections.sort((a, b) => a.id.localeCompare(b.id)) };
  return immutable({ ...core, fingerprint: semanticHash('forecast-example-build', core) });
}
