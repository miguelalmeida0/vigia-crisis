import { immutable,semanticHash } from '../intelligence/shared.mjs';

export const FORECAST_PROMOTION_POLICY=Object.freeze({id:'fire-spread-shadow-v1',version:'1.0.0',minimumRegions:2,minimumSeasons:2,minimumNegativeControls:20,requiredHorizonsHours:[1,3,6,12,24],maximumCalibrationError:.1,maximumTailUnderpredictionRatioVsBestBaseline:1.05,requiredBaselineWins:['NO_GROWTH_PERSISTENCE','RECENT_GROWTH_PERSISTENCE']});
export function evaluateForecastPromotion({corpus,leakage,evaluation={},replay={},ablations={},policy=FORECAST_PROMOTION_POLICY}={}){const horizons=evaluation.horizons??{},baselineWins=evaluation.baselineWins??[],gates=[
  {id:'ZERO_FUTURE_INFORMATION_LEAKAGE',pass:leakage?.passed===true,value:leakage?.violations?.length??null},
  {id:'NEGATIVE_CONTROLS_PRESENT',pass:(corpus?.negativeControls??0)>=policy.minimumNegativeControls,value:corpus?.negativeControls??0,required:policy.minimumNegativeControls},
  {id:'TWO_REGIONS_PRESENT',pass:(corpus?.regions?.length??0)>=policy.minimumRegions,value:corpus?.regions?.length??0,required:policy.minimumRegions},
  {id:'TWO_SEASONS_PRESENT',pass:(corpus?.seasons?.length??0)>=policy.minimumSeasons,value:corpus?.seasons?.length??0,required:policy.minimumSeasons},
  {id:'INCIDENT_SPLIT_ISOLATION',pass:evaluation.incidentSplitIsolation===true,value:evaluation.incidentSplitIsolation??null},
  {id:'UPSTREAM_OBSERVATION_SPLIT_ISOLATION',pass:evaluation.upstreamObservationSplitIsolation===true,value:evaluation.upstreamObservationSplitIsolation??null},
  {id:'ALL_HORIZONS_EVALUATED',pass:policy.requiredHorizonsHours.every((hour)=>horizons[hour]?.caseCount>0),value:Object.fromEntries(policy.requiredHorizonsHours.map((hour)=>[hour,horizons[hour]?.caseCount??0]))},
  {id:'BEATS_STRONG_BASELINES',pass:policy.requiredBaselineWins.every((id)=>baselineWins.includes(id)),value:baselineWins},
  {id:'EXTREME_UNDERPREDICTION_NOT_WORSE',pass:Number.isFinite(evaluation.tailUnderpredictionRatioVsBestBaseline)&&evaluation.tailUnderpredictionRatioVsBestBaseline<=policy.maximumTailUnderpredictionRatioVsBestBaseline,value:evaluation.tailUnderpredictionRatioVsBestBaseline??null},
  {id:'PROBABILITY_CALIBRATED',pass:Number.isFinite(evaluation.meanAbsoluteCalibrationError)&&evaluation.meanAbsoluteCalibrationError<=policy.maximumCalibrationError,value:evaluation.meanAbsoluteCalibrationError??null},
  {id:'SOURCE_ABLATION_COMPLETE',pass:ablations.complete===true,value:ablations.complete??false},
  {id:'STRATIFIED_PERFORMANCE_COMPLETE',pass:evaluation.stratifiedComplete===true,value:evaluation.stratifiedComplete??false},
  {id:'SHADOW_REPLAY_DETERMINISTIC',pass:replay.valid===true&&replay.identical===true,value:{valid:replay.valid??false,identical:replay.identical??false}}
];const decision=gates.every((item)=>item.pass)?'ADVANCE_TO_SHADOW':'DO_NOT_ADVANCE',core={schemaVersion:'vigia.forecast-promotion-decision.v1',policy:{...policy},decision,gates,failedGates:gates.filter((item)=>!item.pass).map((item)=>item.id),shortestCorrectivePath:gates.filter((item)=>!item.pass).map((item)=>({gate:item.id,current:item.value,required:item.required??true}))};return immutable({...core,decisionHash:semanticHash('forecast-promotion-decision',core)});}
