import { createForecastModelRegistry } from '../../../../../packages/domain/src/forecasting/index.mjs';

const common={forecastTask:'PERIMETER_PROGRESSION',codeVersion:'forecasting-v1',features:['initial_perimeter','issue_time'],promotionState:'RESEARCH',forecastHorizonsHours:[1,3,6,12,24],geographicApplicability:['CONUS','PORTUGAL_RESEARCH'],fuelApplicability:['UNSPECIFIED_RESEARCH']};
export function createDefaultForecastModelRegistry(){return createForecastModelRegistry([
  {...common,modelId:'NO_GROWTH_PERSISTENCE',version:'1.0.0',knownFailureModes:['all real growth is underpredicted']},
  {...common,modelId:'RECENT_GROWTH_PERSISTENCE',version:'1.0.0',features:[...common.features,'recent_area_growth'],knownFailureModes:['direction changes','spotting']},
  {...common,modelId:'WIND_ALIGNED_PROGRESSION',version:'1.0.0',features:[...common.features,'deterministic_weather','recent_boundary_velocity'],knownFailureModes:['terrain wind','wind shifts','spotting']},
  {...common,modelId:'OBSERVATION_KINEMATIC_PROGRESSION',version:'1.0.0',features:[...common.features,'feds_goes_viirs_progression'],knownFailureModes:['observation gaps','association error']},
  {...common,modelId:'VIGIA_TRANSPARENT_SPREAD_ENSEMBLE',version:'1.0.0',features:[...common.features,'member_identity','weather_scenario'],knownFailureModes:['uncalibrated','single weather member'],evaluationResult:'NOT_EVALUABLE_AT_BASELINE'},
  {...common,modelId:'FARSITE_FLAMMAP_PHYSICAL_PORT',version:'1.0.0',promotionState:'EXPERIMENTAL',execution:{kind:'ISOLATED_SUBPROCESS',commandId:'farsite'},knownFailureModes:['runner unavailable','fuel incompatibility','weather uncertainty']},
  {...common,modelId:'WINDNINJA_PHYSICAL_PORT',version:'1.0.0',promotionState:'EXPERIMENTAL',execution:{kind:'ISOLATED_SUBPROCESS',commandId:'windninja'},knownFailureModes:['runner unavailable','terrain input incompatibility']}
]);}
