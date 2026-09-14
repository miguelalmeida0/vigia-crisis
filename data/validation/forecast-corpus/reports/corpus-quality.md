# Historical forecast corpus quality

Decision: **CORPUS_NOT_READY**

Discovered incidents: 36
Forecast-eligible incidents: 0
Eligible examples: 0
Valid negative controls: 0
Leakage violations: 0

## Failed gates

- TWO_REGIONS
- TWO_SEASONS
- ONE_HUNDRED_INCIDENTS
- ONE_HUNDRED_NEGATIVES
- PROMOTION_MINIMUM_NEGATIVES
- PROGRESSION_COMPLETENESS
- WEATHER_COMPLETENESS
- FUEL_COMPLETENESS
- TERRAIN_COMPLETENESS
- FUTURE_LABEL_COMPLETENESS
- BRONZE_SILVER_LINEAGE_COMPLETENESS
- HORIZON_1H
- HORIZON_3H
- HORIZON_6H
- HORIZON_12H
- HORIZON_24H

## Unresolved blockers

- BRONZE_SILVER_LINEAGE_COMPLETENESS
- FUEL_COMPLETENESS
- FUTURE_IMPACT_LABELS_NOT_ACQUIRED
- FUTURE_LABEL_COMPLETENESS
- HORIZON_12H
- HORIZON_1H
- HORIZON_24H
- HORIZON_3H
- HORIZON_6H
- HRRR_GRIB_VALUES_NOT_DECODED_OR_MISSING_VALUE_CERTIFIED
- ICNF_FINAL_GEOMETRY_HAS_NO_ISSUE_TIME_SEQUENCE
- NO_VALID_NEGATIVE_OBSERVATION_OPPORTUNITIES
- ONE_HUNDRED_INCIDENTS
- ONE_HUNDRED_NEGATIVES
- PORTUGAL_ISSUE_TIME_PROGRESSION_NOT_ACQUIRED
- PROGRESSION_COMPLETENESS
- PROMOTION_MINIMUM_NEGATIVES
- TERRAIN_COMPLETENESS
- TWO_REGIONS
- TWO_SEASONS
- VERSIONED_ASSET_CONTEXT_NOT_ACQUIRED
- WEATHER_COMPLETENESS
- cems-rapid-mapping:LICENCE_NOT_REGISTERED:COPERNICUS-EMS-TERMS
- copernicus-dem:CREDENTIALS_REQUIRED:The 30 m service requires current licence acceptance/user-category access.
- ecmwf-operational-archive:PARTNER_REQUIRED:Historical delivery access is not configured; rolling Open Data cannot reconstruct old incidents.
- effis-history:INSUFFICIENT_TIMESTAMPS:Publication/revision timing and satellite lineage require product-level confirmation.
- effis-history:LICENCE_NOT_REGISTERED:EFFIS-TERMS-REVIEW
- icnf-burned-area:FINAL_ONLY:No historical issue-time geometry revision timestamps are exposed.
- mtbs-final:FINAL_ONLY:MTBS products are labels, never issue-time features.
- mtbs-final:LICENCE_NOT_REGISTERED:US-FEDERAL-PUBLIC-DATA
- nifc-wfigs-history:FINAL_ONLY:One best available geometry does not reconstruct historical knowledge time.

This report does not imply model promotion or forecasting skill.
