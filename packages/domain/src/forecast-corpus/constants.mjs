export const PERIMETER_SOURCE_CLASSES = Object.freeze([
  'ISSUE_TIME_SEQUENCE',
  'ARCHIVED_OPERATIONAL_SNAPSHOT',
  'DERIVED_PROGRESS_SEQUENCE',
  'FINAL_ONLY',
  'TIMESTAMP_UNTRUSTWORTHY',
  'UNUSABLE',
]);

export const ARRIVAL_TIME_BASES = Object.freeze([
  'OBSERVED',
  'PROVIDER_PUBLISHED',
  'ARCHIVE_DISCOVERY',
  'DOCUMENTED_LATENCY_MODEL',
]);

export const CORPUS_SPLITS = Object.freeze([
  'development',
  'calibration',
  'held-out-test',
  'geographic-stress-test',
  'seasonal-stress-test',
]);

export const FORECAST_EXAMPLE_REJECTIONS = Object.freeze([
  'NO_PROGRESS_SEQUENCE',
  'NO_ISSUE_TIME_WEATHER',
  'NO_FUEL_PACK',
  'NO_TERRAIN_PACK',
  'NO_FUTURE_LABEL',
  'INSUFFICIENT_HISTORY',
  'AMBIGUOUS_INCIDENT',
  'INVALID_GEOMETRY',
  'KNOWLEDGE_TIME_VIOLATION',
  'LEAKAGE_RISK',
  'OUTSIDE_DOMAIN',
]);

export const NEGATIVE_OUTCOMES = Object.freeze([
  'WILDFIRE_NEGATIVE',
  'FIRE_PRESENCE_POSITIVE_BUT_WILDFIRE_NEGATIVE',
  'OBSERVATION_INVALID',
  'NO_OPPORTUNITY',
]);

export const WEATHER_RUN_TYPES = Object.freeze([
  'DETERMINISTIC_FORECAST',
  'CONTROL_FORECAST',
  'ENSEMBLE_MEMBER',
  'ANALYSIS',
  'RETROSPECTIVE_REANALYSIS',
]);

export const REQUIRED_FUEL_LAYERS = Object.freeze([
  'fuel_model', 'canopy_cover', 'canopy_height', 'canopy_bulk_density', 'canopy_base_height',
]);
export const REQUIRED_TERRAIN_LAYERS = Object.freeze(['elevation', 'slope', 'aspect']);
export const FORECAST_CORPUS_HORIZONS = Object.freeze([1, 3, 6, 12, 24]);
