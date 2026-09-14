export const LABEL_HORIZONS = Object.freeze({
  '1h': { targetMinutes: 60, minimumOffset: 45, maximumOffset: 90, preferredOffset: 60 },
  '3h': { targetMinutes: 180, minimumOffset: 150, maximumOffset: 240, preferredOffset: 180 },
  '6h': { targetMinutes: 360, minimumOffset: 300, maximumOffset: 450, preferredOffset: 360 },
  '12h': { targetMinutes: 720, minimumOffset: 600, maximumOffset: 900, preferredOffset: 720 },
  '24h': { targetMinutes: 1440, minimumOffset: 1200, maximumOffset: 1800, preferredOffset: 1440 }
});

export const OFFICIAL_TRUTH_DOCTRINE = Object.freeze({
  schemaVersion: 'vigia.official-truth-doctrine.v1', version: '2026-08-25.1',
  strictLabelAuthorityClass: 'AUTHORITATIVE_OPERATIONAL_PERIMETER', officialReferenceMaySatisfyStrictGate: false,
  allowedRevisionClasses: ['NORMAL_PROGRESSION', 'GEOMETRY_REFINEMENT'], minimumGeometryQuality: 'VALID_NORMALIZED',
  chronologyRequirement: 'PROVIDER_PUBLICATION_AND_VIGIA_AVAILABILITY_STRICTLY_AFTER_ISSUE', interpolationAllowed: false,
  correctionTreatment: 'RETAIN_HISTORY_EXCLUDE_FROM_GROWTH_LABEL_UNLESS_REVIEWED', mergeSplitTreatment: 'RETAIN_AND_REQUIRE_IDENTITY_REVIEW',
  conflictBehavior: 'PRESERVE_ALL_ABSTAIN_WHEN_IN_SCOPE_AUTHORITY_UNRESOLVED', abstentionBehavior: 'FAIL_CLOSED',
  authorityByJurisdiction: {
    'CA-BC': ['bc-wildfire-service', 'cwfis-nrcan'], 'CA-AB': ['alberta-wildfire', 'cwfis-nrcan'],
    US: ['nifc-wfigs'], CA: ['jurisdictional-provincial-provider', 'cwfis-nrcan']
  },
  horizons: LABEL_HORIZONS
});

export const SNAPSHOT_CLASSES = Object.freeze(['NO_PROVIDER_CHANGE', 'NEW_PROVIDER_PUBLICATION_NO_GEOMETRY_CHANGE', 'GEOMETRY_CHANGED', 'STATUS_CHANGED', 'INCIDENT_METADATA_CHANGED', 'SOURCE_HEALTH_CHANGED', 'CORRECTION_RECEIVED', 'INCIDENT_REMOVED', 'PROVIDER_UNAVAILABLE', 'SCHEMA_CHANGED']);
export const REVISION_CLASSES = Object.freeze(['NORMAL_PROGRESSION', 'GEOMETRY_REFINEMENT', 'CORRECTION', 'MERGE', 'SPLIT', 'INCIDENT_REASSOCIATION', 'PERIMETER_RETRACTION', 'DUPLICATE', 'CLOCK_ANOMALY', 'INVALID_GEOMETRY', 'UNKNOWN_CHANGE']);
export const AUTHORITY_CLASSES = Object.freeze(['AUTHORITATIVE_OPERATIONAL_PERIMETER', 'OFFICIAL_REFERENCE_PERIMETER', 'DERIVED_SENSOR_PROGRESSION', 'RETROSPECTIVE_FINAL_PERIMETER', 'MODELLED_PERIMETER', 'FORECAST_PERIMETER']);

export const PROVIDERS = Object.freeze([
  {
    id: 'bc-wildfire-service', region: 'CA-BC', jurisdiction: 'CA-BC', authorityClass: 'AUTHORITATIVE_OPERATIONAL_PERIMETER', cadenceSeconds: 300,
    service: 'https://services6.arcgis.com/ubm4tcTYICKBpist/arcgis/rest/services/BCWS_FirePerimeters_PublicView/FeatureServer', layer: 0, host: 'services6.arcgis.com', where: '1=1',
    stableIdField: 'GlobalID', incidentIdField: 'FIRE_NUMBER', statusField: 'FIRE_STATUS', observedField: 'TRACK_DATE', publishedField: 'LOAD_DATE', modifiedField: null, areaField: 'FIRE_SIZE_HECTARES', versionField: 'VERSION_NUMBER', orderBy: 'OBJECTID',
    rights: { licenceId: 'OGL-BC', attribution: 'Government of British Columbia — BC Wildfire Service', permitScientificRetention: true }
  },
  {
    id: 'alberta-wildfire', region: 'CA-AB', jurisdiction: 'CA-AB', authorityClass: 'AUTHORITATIVE_OPERATIONAL_PERIMETER', cadenceSeconds: 300,
    service: 'https://geospatial.alberta.ca/mimas/rest/services/wildfire/alberta_fire_status/FeatureServer', layer: 1, host: 'geospatial.alberta.ca', where: '1=1',
    stableIdField: 'OBJECTID', incidentIdField: 'FireNumber', statusField: 'FIRE_STATUS', observedField: 'CaptreDate', publishedField: null, modifiedField: 'GISFeatureLastUpdated', areaField: 'AREA_ESTIMATE', versionField: 'GISFeatureLastUpdated', orderBy: 'OBJECTID',
    rights: { licenceId: 'OGL-ALBERTA', attribution: 'Government of Alberta — Alberta Wildfire', permitScientificRetention: true }
  },
  {
    id: 'nifc-wfigs', region: 'US-WEST', jurisdiction: 'US', authorityClass: 'AUTHORITATIVE_OPERATIONAL_PERIMETER', cadenceSeconds: 900,
    service: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer', layer: 0, host: 'services3.arcgis.com', where: "attr_IncidentTypeCategory='WF'",
    stableIdField: 'GlobalID', incidentIdField: 'attr_UniqueFireIdentifier', statusField: 'poly_FeatureStatus', observedField: 'poly_PolygonDateTime', publishedField: 'poly_CreateDate', modifiedField: 'attr_ModifiedOnDateTime_dt', areaField: 'poly_GISAcres', versionField: 'attr_ModifiedOnDateTime_dt', orderBy: 'OBJECTID',
    rights: { licenceId: 'NIFC-OPEN-DATA', attribution: 'National Interagency Fire Center — WFIGS', permitScientificRetention: true }
  },
  {
    id: 'cwfis-nrcan', region: 'CA', jurisdiction: 'CA', authorityClass: 'OFFICIAL_REFERENCE_PERIMETER', cadenceSeconds: 900, host: 'cwfis.cfs.nrcan.gc.ca',
    rights: { licenceId: 'OGL-CANADA-CWFIS', attribution: 'Natural Resources Canada — Canadian Forest Service, CWFIS', permitScientificRetention: true }
  }
]);

export const providerById = (id) => PROVIDERS.find((item) => item.id === id);
