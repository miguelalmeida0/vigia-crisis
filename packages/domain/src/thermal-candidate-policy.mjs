function confidenceValue(value) {
  const text = String(value ?? '').toLowerCase(); const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric > 1 ? Math.min(1, numeric / 100) : Math.max(0, numeric);
  if (['h', 'high'].includes(text)) return 1;
  if (['n', 'nominal', 'medium'].includes(text)) return .72;
  if (['l', 'low'].includes(text)) return .3;
  return .55;
}

export const THERMAL_CANDIDATE_POLICY_VERSION = 'vigia-thermal-candidate-policy-v1';
export const THERMAL_CANDIDATE_THRESHOLD_VERSION = 'vigia-thermal-thresholds-v1';
export const THERMAL_CANDIDATE_V2_CANDIDATE_VERSION = 'vigia-thermal-candidate-policy-v2-candidate-land-context';
export const THERMAL_CANDIDATE_V2_CANDIDATE_THRESHOLD_VERSION = 'vigia-thermal-thresholds-v2-candidate-72h-low-frp-land-v1';
export const THERMAL_CANDIDATE_V2_VERSION = 'vigia-thermal-candidate-policy-v2-land-context';
export const THERMAL_CANDIDATE_V2_THRESHOLD_VERSION = 'vigia-thermal-thresholds-v2-72h-low-frp-land-v1';
export const THERMAL_CANDIDATE_V3_CANDIDATE_VERSION = 'vigia-thermal-candidate-policy-v3-candidate-persistent-site-memory';
export const THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION = 'vigia-thermal-thresholds-v3-candidate-history-4d-14d-p90-4mw-v1';
export const THERMAL_CANDIDATE_V3_VERSION = 'vigia-thermal-candidate-policy-v3-persistent-site-memory';
export const THERMAL_CANDIDATE_V3_THRESHOLD_VERSION = 'vigia-thermal-thresholds-v3-history-4d-14d-p90-4mw-v1';
export const THERMAL_CANDIDATE_V4_CANDIDATE_VERSION = 'vigia-thermal-candidate-policy-v4-candidate-causal-site-context';
export const THERMAL_CANDIDATE_V4_CANDIDATE_THRESHOLD_VERSION = 'vigia-thermal-thresholds-v4-osm-100m-6mw-exact-boundary-v1';
export const THERMAL_CANDIDATE_V4_VERSION = 'vigia-thermal-candidate-policy-v4-causal-site-context';
export const THERMAL_CANDIDATE_V4_THRESHOLD_VERSION = 'vigia-thermal-thresholds-v4-osm-100m-6mw-exact-boundary-v1';
const V4_HEAT_CONTEXT_CLASSES = new Set(['DIRECT_HIGH_TEMPERATURE_INDUSTRIAL','THERMAL_POWER','WASTE_PROCESSING','INDUSTRIAL_WORKS','INDUSTRIAL_LANDUSE','QUARRY']);
const PORTUGAL_MAINLAND_MASK=[[-9.04,41.89],[-8.67,42.14],[-8.26,42.29],[-8.01,41.79],[-7.42,41.79],[-7.25,41.92],[-6.67,41.89],[-6.38,41.38],[-6.85,41.11],[-6.86,40.33],[-7.03,40.18],[-7.07,39.71],[-7.50,39.63],[-7.10,39.03],[-7.37,38.37],[-7.03,38.08],[-7.17,37.80],[-7.54,37.43],[-7.45,37.10],[-7.86,36.84],[-8.38,36.98],[-8.90,36.87],[-8.75,37.65],[-8.84,38.27],[-9.29,38.36],[-9.53,38.74],[-9.45,39.39],[-9.05,39.76],[-8.98,40.16],[-8.77,40.76],[-8.79,41.18],[-8.99,41.54],[-9.04,41.89]];
function inMainland(coordinate){if(!Array.isArray(coordinate)||coordinate.length!==2)return null;const[x,y]=coordinate;let inside=false;for(let i=0,j=PORTUGAL_MAINLAND_MASK.length-1;i<PORTUGAL_MAINLAND_MASK.length;j=i++){const[xi,yi]=PORTUGAL_MAINLAND_MASK[i],[xj,yj]=PORTUGAL_MAINLAND_MASK[j],intersects=((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi;if(intersects)inside=!inside;}return inside;}

export function assessThermalCandidate(event, { now = new Date() } = {}) {
  const points = (event.observations ?? []).filter((item) => item.type === 'thermal');
  if (!points.length) return { state: 'not_applicable', grade: null, score: null, flags: [] };
  const sensors = new Set(points.map((item) => item.satellite || item.instrument || 'unknown'));
  const maxFrp = Math.max(...points.map((item) => Number(item.frpMw)).filter(Number.isFinite), 0);
  const meanConfidence = points.reduce((sum, item) => sum + confidenceValue(item.confidence), 0) / points.length;
  const firstMs = Date.parse(points[0].at); const lastMs = Date.parse(points.at(-1).at);
  const durationHours = Number.isFinite(firstMs) && Number.isFinite(lastMs) ? Math.max(0, (lastMs - firstMs) / 3_600_000) : 0;
  const ageMinutes = Number.isFinite(lastMs) ? Math.max(0, (now.getTime() - lastMs) / 60_000) : null;
  const flags = [];
  const nonWildfire = points.filter((item) => [1,2,3].includes(Number(item.hotspotType)) || ['active_volcano','other_static_land_source','offshore_detection'].includes(item.hotspotClass));
  if (points.length === 1) flags.push('single_observation');
  if (nonWildfire.length) flags.push('firms_non_wildfire_type');
  if (meanConfidence < .5) flags.push('low_sensor_confidence');
  if (maxFrp > 0 && maxFrp < 4) flags.push('low_frp');
  if (durationHours >= 6 && event.thermal?.direction === 'steady') flags.push('persistent_heat_source_possible');
  if (ageMinutes !== null && ageMinutes > 180) flags.push('stale_observation');
  let score = Math.min(1, .22 + Math.min(.36, points.length * .11) + Math.min(.16, sensors.size * .08) + meanConfidence * .18 + Math.min(.12, maxFrp / 100));
  if (flags.includes('firms_non_wildfire_type')) score -= .65;
  if (flags.includes('persistent_heat_source_possible')) score -= .25;
  if (flags.includes('stale_observation')) score -= .3;
  if (flags.includes('single_observation') && flags.includes('low_sensor_confidence')) score -= .18;
  score = Math.max(0, Math.min(1, score));
  const grade = score >= .72 ? 'high' : score >= .48 ? 'moderate' : 'low';
  const decision = flags.includes('firms_non_wildfire_type') ? 'SUPPRESS_PROVIDER_NON_WILDFIRE'
    : flags.includes('stale_observation') ? 'ABSTAIN_STALE'
      : ['high','moderate'].includes(grade) ? 'QUALIFY_FIRE_CANDIDATE' : 'ABSTAIN_LOW_SIGNAL';
  return {
    state: 'screened', grade, score: Number(score.toFixed(3)), scoreKind: 'uncalibrated_screening_score', calibrated: false, fireProbability: null, flags,
    policyVersion: THERMAL_CANDIDATE_POLICY_VERSION, thresholdVersion: THERMAL_CANDIDATE_THRESHOLD_VERSION,
    decision, qualifiesAsFireCandidate: decision === 'QUALIFY_FIRE_CANDIDATE',
    observationCount: points.length, sensorCount: sensors.size, maxFrpMw: maxFrp || null,
    ageMinutes, durationHours:Number(durationHours.toFixed(3)), operationalClaim: false,
    conclusion: flags.includes('firms_non_wildfire_type') ? 'FIRMS classifies at least one contributing hotspot as a non-wildfire/static/offshore source; suppress from wildfire escalation unless independent evidence contradicts that classification.' : grade === 'high' ? 'Strong thermal screening signal; the score is not a calibrated fire probability and independent confirmation is still required.'
      : grade === 'moderate' ? 'Moderate thermal screening signal; corroboration is required before escalation.'
        : 'Weak or stale thermal screening signal; suppress from high-severity alerting until additional evidence arrives.'
  };
}

export function assessThermalCandidateV2Candidate(event,{now=new Date()}={}){
  const assessment=assessThermalCandidate(event,{now});
  if(assessment.state!=='screened')return assessment;
  const persistentLowFrp=assessment.durationHours>=72&&Number(assessment.maxFrpMw??Infinity)<=6;
  const landStates=(event.observations??[]).filter((item)=>item.type==='thermal').map((item)=>inMainland(item.coordinate)).filter((item)=>item!==null),offshore=landStates.length>0&&landStates.every((item)=>item===false);
  if(!persistentLowFrp&&!offshore)return{...assessment,policyVersion:THERMAL_CANDIDATE_V2_CANDIDATE_VERSION,thresholdVersion:THERMAL_CANDIDATE_V2_CANDIDATE_THRESHOLD_VERSION,candidateOnly:true};
  const decision=offshore?'SUPPRESS_OFFSHORE_LAND_CONTEXT':'SUPPRESS_PERSISTENT_LOW_FRP',flag=offshore?'outside_portugal_mainland_mask_v1':'persistent_low_frp_recurrence_72h';
  return{...assessment,policyVersion:THERMAL_CANDIDATE_V2_CANDIDATE_VERSION,thresholdVersion:THERMAL_CANDIDATE_V2_CANDIDATE_THRESHOLD_VERSION,decision,qualifiesAsFireCandidate:false,flags:[...new Set([...assessment.flags,flag])],candidateOnly:true,operationalClaim:false,conclusion:offshore?'Every contributing coordinate lies outside the versioned simplified Portugal mainland mask. Suppress as an offshore-context thermal signal; the mask is a screening feature, not coastline survey truth.':'Persistent low-FRP recurrence across at least 72 hours is suppressed as a likely static heat source. This V2 rule is a retrospective candidate and is not the live operational policy until a fresh confirmatory holdout is frozen.'};
}

export function assessThermalCandidateV2(event,options={}){
  const candidate=assessThermalCandidateV2Candidate(event,options),suppressed=candidate.decision==='SUPPRESS_OFFSHORE_LAND_CONTEXT'||candidate.decision==='SUPPRESS_PERSISTENT_LOW_FRP';
  return{...candidate,policyVersion:THERMAL_CANDIDATE_V2_VERSION,thresholdVersion:THERMAL_CANDIDATE_V2_THRESHOLD_VERSION,candidateOnly:false,promotionEvidence:'vigia.area-time-detection-benchmark.v1',conclusion:suppressed?`${candidate.conclusion} The rule passed the frozen confirmatory engineering gate; it remains a screening decision, not a calibrated fire probability.`:candidate.conclusion};
}

/**
 * V3 is deliberately limited to features that are available before a decision:
 * low-intensity recurrence, elapsed history, and spatial stationarity. Provider
 * hotspot type and reference labels are never accepted as policy inputs.
 *
 * `thermalMemory` is a causal, as-of-decision summary. Callers must not include
 * observations later than the decision timestamp. The candidate is evaluated
 * offline until a new subject-exclusive confirmatory lock is opened.
 */
export function assessThermalCandidateV3Candidate(event,{now=new Date()}={}){
  const assessment=assessThermalCandidateV2Candidate(event,{now});
  if(assessment.state!=='screened'||assessment.decision==='SUPPRESS_OFFSHORE_LAND_CONTEXT')return{
    ...assessment,
    policyVersion:THERMAL_CANDIDATE_V3_CANDIDATE_VERSION,
    thresholdVersion:THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION,
    candidateOnly:true
  };
  const memory=event.thermalMemory??{};
  const distinctDays=Number(memory.distinctObservationDays??0);
  const historyHours=Number(memory.durationHours??0);
  const observationCount=Number(memory.observationCount??0);
  const radiusKm=Number(memory.stationarityRadiusKm);
  const frpP90Mw=Number(memory.frpP90Mw);
  const stableLowIntensity=distinctDays>=4&&historyHours>=14*24&&observationCount>=4&&Number.isFinite(radiusKm)&&radiusKm<=1.5&&Number.isFinite(frpP90Mw)&&frpP90Mw<=4;
  if(!stableLowIntensity)return{
    ...assessment,
    policyVersion:THERMAL_CANDIDATE_V3_CANDIDATE_VERSION,
    thresholdVersion:THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION,
    candidateOnly:true,
    temporalMemory:{observationCount,distinctObservationDays:distinctDays,durationHours:historyHours,stationarityRadiusKm:Number.isFinite(radiusKm)?radiusKm:null,frpP90Mw:Number.isFinite(frpP90Mw)?frpP90Mw:null}
  };
  return{
    ...assessment,
    policyVersion:THERMAL_CANDIDATE_V3_CANDIDATE_VERSION,
    thresholdVersion:THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION,
    decision:'SUPPRESS_PERSISTENT_STATIONARY_LOW_INTENSITY',
    qualifiesAsFireCandidate:false,
    flags:[...new Set([...(assessment.flags??[]),'persistent_stationary_low_intensity_history'])],
    candidateOnly:true,
    operationalClaim:false,
    temporalMemory:{observationCount,distinctObservationDays:distinctDays,durationHours:historyHours,stationarityRadiusKm:radiusKm,frpP90Mw},
    conclusion:'At least four low-intensity observations on four distinct days recur at a stationary site across 14 days or more. Suppress as persistent heat pending independent contradictory evidence. This rule does not use the provider hotspot class or benchmark reference label.'
  };
}

export function assessThermalCandidateV3(event,options={}){
  const candidate=assessThermalCandidateV3Candidate(event,options);
  return{
    ...candidate,
    policyVersion:THERMAL_CANDIDATE_V3_VERSION,
    thresholdVersion:THERMAL_CANDIDATE_V3_THRESHOLD_VERSION,
    candidateOnly:false,
    promotionEvidence:'vigia.detector-v3-frozen-confirmatory.v1',
    promotionEvidenceHash:'sha256:2ac8eeed7a629406395428f4af1b471cedcd03911c60305ad82bae65a9d2594b'
  };
}

function v3MemorySuppression(assessment,event,{policyVersion,thresholdVersion}){
  const memory=event.thermalMemory??{},distinctDays=Number(memory.distinctObservationDays??0),historyHours=Number(memory.durationHours??0),observationCount=Number(memory.observationCount??0),radiusKm=Number(memory.stationarityRadiusKm),frpP90Mw=Number(memory.frpP90Mw);
  const stableLowIntensity=distinctDays>=4&&historyHours>=14*24&&observationCount>=4&&Number.isFinite(radiusKm)&&radiusKm<=1.5&&Number.isFinite(frpP90Mw)&&frpP90Mw<=4;
  if(!stableLowIntensity)return{...assessment,policyVersion,thresholdVersion,candidateOnly:true};
  return{...assessment,policyVersion,thresholdVersion,decision:'SUPPRESS_PERSISTENT_STATIONARY_LOW_INTENSITY',qualifiesAsFireCandidate:false,flags:[...new Set([...(assessment.flags??[]),'persistent_stationary_low_intensity_history'])],candidateOnly:true,operationalClaim:false,temporalMemory:{observationCount,distinctObservationDays:distinctDays,durationHours:historyHours,stationarityRadiusKm:radiusKm,frpP90Mw},conclusion:'At least four low-intensity observations on four distinct days recur at a stationary site across 14 days or more. Suppress as persistent heat pending independent contradictory evidence. This rule does not use the provider hotspot class or benchmark reference label.'};
}

/**
 * V4 adds only causal, pre-decision geospatial context. The OSM context snapshot
 * is not a reference label; absence never suppresses a candidate. The exact
 * boundary can reverse the simplified V2 mask where it is demonstrably wrong.
 */
export function assessThermalCandidateV4Candidate(event,{now=new Date()}={}){
  const siteContext=event.siteContext??{},v4Identity={policyVersion:THERMAL_CANDIDATE_V4_CANDIDATE_VERSION,thresholdVersion:THERMAL_CANDIDATE_V4_CANDIDATE_THRESHOLD_VERSION};
  let assessment=assessThermalCandidateV3Candidate(event,{now});
  if(assessment.decision==='SUPPRESS_OFFSHORE_LAND_CONTEXT'&&siteContext.insidePortugal===true){
    assessment=v3MemorySuppression(assessThermalCandidate(event,{now}),event,v4Identity);
  }
  if(assessment.state!=='screened')return{...assessment,...v4Identity,candidateOnly:true};
  if(siteContext.insidePortugal===false&&assessment.qualifiesAsFireCandidate){
    return{...assessment,...v4Identity,decision:'SUPPRESS_OUTSIDE_EXACT_PORTUGAL_BOUNDARY',qualifiesAsFireCandidate:false,flags:[...new Set([...(assessment.flags??[]),'outside_exact_portugal_boundary_osm_v1'])],candidateOnly:true,operationalClaim:false,siteContext,conclusion:'The observation lies outside the frozen exact Portugal boundary context. Suppress as offshore/out-of-territory thermal evidence; OSM context remains a screening feature, not ground truth.'};
  }
  const heat=siteContext.heatContext,maxFrp=Number(assessment.maxFrpMw??Infinity),mappedHeat=heat&&V4_HEAT_CONTEXT_CLASSES.has(heat.contextClass)&&Number(heat.distanceKm)<=.1&&maxFrp<=6;
  if(!mappedHeat)return{...assessment,...v4Identity,candidateOnly:true,siteContext};
  return{...assessment,...v4Identity,decision:'SUPPRESS_MAPPED_PERSISTENT_HEAT_CONTEXT',qualifiesAsFireCandidate:false,flags:[...new Set([...(assessment.flags??[]),'mapped_heat_context_within_100m_low_frp'])],candidateOnly:true,operationalClaim:false,siteContext,conclusion:'A ≤6 MW signal lies within 100 metres of a causally acquired mapped industrial, quarry, waste, works, or thermal-power feature. Suppress pending independent contradictory evidence. OSM context is incomplete and is not the reference label.'};
}

export function assessThermalCandidateV4(event,options={}){
  const candidate=assessThermalCandidateV4Candidate(event,options);
  return{...candidate,policyVersion:THERMAL_CANDIDATE_V4_VERSION,thresholdVersion:THERMAL_CANDIDATE_V4_THRESHOLD_VERSION,candidateOnly:false,promotionEvidence:'vigia.detector-v4-frozen-confirmatory.v1',promotionEvidenceHash:'sha256:4e415f50c7367850f6baa90b0ead871976a6ed9b907587d168985a8172166e74'};
}
