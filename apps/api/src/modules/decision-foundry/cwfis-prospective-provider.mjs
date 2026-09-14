import { createHash, randomUUID } from 'node:crypto';
import { createProspectiveCaptureManifest } from '../../../../../packages/domain/src/decision-foundry/index.mjs';
import { trustedFetch } from '../reality-network/trusted-endpoint.mjs';

export const CWFIS_PROSPECTIVE_RIGHTS_RECORD = Object.freeze({
  schemaVersion: 'vigia.provider-rights-record.v1',
  providerId: 'nrcan-cwfis-prospective',
  qualification: 'CONDITIONALLY_QUALIFIED_SHADOW_ONLY',
  state: 'ACCEPTANCE_REQUIRED',
  manifestEligible: false,
  licenceId: 'OPEN-GOVERNMENT-LICENCE-CANADA-WITH-CWFIS-END-USER-CONDITIONS',
  permittedPurpose: 'INTERNAL_SHADOW_MAPPING_ANALYSIS_RESEARCH_EVALUATION',
  redistribution: 'REQUIRES_SEPARATE_REVIEW',
  attribution: ['Canadian Forest Service, Canadian Wildland Fire Information System, Natural Resources Canada'],
  evidence: [
    'https://open.canada.ca/en/open-government-licence-canada',
    'https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/fireM3_hotspots_metadata_NAP_ISO_19115_2003_EN.pdf',
    'https://cwfis.cfs.nrcan.gc.ca/downloads/docs/en/references/cwfif/cwfis-data-placemat.pdf'
  ],
  blockers: ['An authorized VIGIA representative must record acceptance of the applicable CWFIS end-user conditions.', 'Redistribution rights must be reviewed independently of internal raw retention.'],
  historicalQualification: 'NOT_QUALIFIED'
});

export const CWFIS_PROSPECTIVE_PRODUCTS = Object.freeze({
  FIRE_PERIMETER_ESTIMATE: Object.freeze({
    id: 'CWFIS_FIRE_PERIMETER_ESTIMATE',
    host: 'cwfis.cfs.nrcan.gc.ca',
    endpoint: 'https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows',
    layer: 'public:m3_polygons_current',
    role: 'SATELLITE_DERIVED_ESTIMATE_NOT_OPERATIONAL_PERIMETER',
    parserVersion: 'vigia.cwfis-m3-geojson.v1'
  }),
  ACTIVE_WILDLAND_FIRES: Object.freeze({
    id: 'CWFIS_ACTIVE_WILDLAND_FIRES',
    host: 'geoserver.cwfif.nrcan.gc.ca',
    endpoint: 'https://geoserver.cwfif.nrcan.gc.ca/geoserver/ows',
    layer: 'public:cwfif_national_activefires',
    role: 'CURRENT_INCIDENT_CROSSWALK',
    parserVersion: 'vigia.cwfif-activefires-geojson.v1'
  })
});

function approvedRights(approval) {
  if (approval?.state !== 'READY' || approval?.licenceId !== CWFIS_PROSPECTIVE_RIGHTS_RECORD.licenceId || !approval.acceptedAt || !approval.acceptedBy) throw new Error('cwfis_rights_acceptance_required');
  return { state: 'READY', licenceId: approval.licenceId, acceptedAt: new Date(approval.acceptedAt).toISOString(), acceptedBy: String(approval.acceptedBy), purpose: CWFIS_PROSPECTIVE_RIGHTS_RECORD.permittedPurpose, attribution: CWFIS_PROSPECTIVE_RIGHTS_RECORD.attribution };
}
function boundedBox(value) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) throw new Error('cwfis_bbox_invalid');
  const [west, south, east, north] = value;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north || east - west > 25 || north - south > 25) throw new Error('cwfis_bbox_invalid');
  return value;
}
function iso(value) { if (!value) return null; const milliseconds = Date.parse(value); return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null; }
function hashBody(body) { return createHash('sha256').update(body).digest('hex'); }
function pointInside(point, box) { return Array.isArray(point) && point.length >= 2 && point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3]; }
function coordinates(value, output = []) { if (!Array.isArray(value)) return output; if (value.length >= 2 && value.slice(0, 2).every(Number.isFinite)) output.push(value.slice(0, 2)); else for (const item of value) coordinates(item, output); return output; }
function featureBox(feature) { const points = coordinates(feature?.geometry?.coordinates); if (!points.length) return null; return [Math.min(...points.map((item) => item[0])), Math.min(...points.map((item) => item[1])), Math.max(...points.map((item) => item[0])), Math.max(...points.map((item) => item[1]))]; }

export class CwfisProspectiveProvider {
  constructor({ rawVault, archiveService = null, fetchImpl = globalThis.fetch, clock = () => new Date(), rightsApproval = null } = {}) {
    if (!rawVault) throw new Error('cwfis_raw_vault_required');
    Object.assign(this, { rawVault, archiveService, fetchImpl, clock, rightsApproval }); this.id = 'nrcan-cwfis-prospective';
  }
  rightsStatus() { try { return { ...CWFIS_PROSPECTIVE_RIGHTS_RECORD, state: 'READY', manifestEligible: true, approval: approvedRights(this.rightsApproval) }; } catch { return CWFIS_PROSPECTIVE_RIGHTS_RECORD; } }
  createManifest({ id, mode = 'INCIDENT_WATCH', regions = ['canada'], incidentIds, cadenceSeconds = 900, retentionDays = 365, startedAt = this.clock().toISOString(), endsAt = null } = {}) {
    const rights = approvedRights(this.rightsApproval);
    return createProspectiveCaptureManifest({ id, mode, providers: [this.id], products: Object.values(CWFIS_PROSPECTIVE_PRODUCTS).map((item) => item.id), regions, incidentIds, cadenceSeconds, retentionDays, startedAt, endsAt, rights });
  }
  async fetchProduct(name, { bbox = null, maxFeatures = 100, incidentIds = [] } = {}) {
    approvedRights(this.rightsApproval);
    const product = CWFIS_PROSPECTIVE_PRODUCTS[name]; if (!product) throw new Error('cwfis_product_not_allowed');
    const area = boundedBox(bbox); if (!Number.isSafeInteger(maxFeatures) || maxFeatures < 1 || maxFeatures > 1000) throw new Error('cwfis_feature_limit_invalid');
    const query = new URLSearchParams({ service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName: product.layer, maxFeatures: String(maxFeatures), outputFormat: 'application/json', srsName: 'EPSG:4326' });
    if (area) query.set('bbox', `${area.join(',')},EPSG:4326`);
    const runId = randomUUID(), response = await trustedFetch({ url: `${product.endpoint}?${query}`, allowedHosts: [product.host], accept: 'application/geo+json,application/json', maxBytes: 12 * 1024 * 1024, timeoutMs: 20_000, fetchImpl: this.fetchImpl });
    if (!response.ok) throw new Error(`cwfis_http_${response.status}`); if (!/json/i.test(response.contentType)) throw new Error('cwfis_content_type_invalid');
    let payload; try { payload = JSON.parse(response.body.toString('utf8')); } catch { throw new Error('cwfis_invalid_json'); }
    if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features) || payload.features.length > maxFeatures) throw new Error('cwfis_schema_drift');
    const serviceResponseAt = iso(payload.timeStamp), receivedAt = response.retrievedAt ?? this.clock().toISOString(), contentHash = hashBody(response.body);
    const raw = await this.rawVault.preserve({ providerId: this.id, sourceId: `cwfis:${product.layer}`, providerProductId: `${product.id}:${serviceResponseAt ?? receivedAt}:${contentHash.slice(0, 16)}`, body: response.body, requestIdentity: response.requestIdentity, response: { ...response, sourceTimestamp: null, providerVersion: serviceResponseAt }, licenceId: this.rightsApproval.licenceId, parserVersion: product.parserVersion, requestWindow: { bbox: area, maxFeatures, incidentIds: [...incidentIds], shadowOnly: true }, fetchRunId: runId, retrievedAt: receivedAt });
    return { schemaVersion: 'vigia.cwfis-prospective-result.v1', providerId: this.id, product: product.id, role: product.role, status: 'LIVE', shadowOnly: true, historicalQualification: 'NOT_QUALIFIED', providerPublishedAt: null, publicationTimeStatus: 'NOT_EXPOSED_BY_PRODUCT', serviceResponseAt, receivedAt, features: payload.features, rawProduct: raw.product, duplicate: raw.duplicate, sourceHealth: { state: 'LIVE', latencyMs: response.latencyMs, retrievedAt: receivedAt, featureCount: payload.features.length } };
  }
  crosswalk(perimeterFeature, activeFireFeatures = []) {
    const box = featureBox(perimeterFeature); if (!box) return { state: 'PERIMETER_GEOMETRY_MISSING', candidates: [] };
    const candidates = activeFireFeatures.filter((feature) => pointInside(feature.geometry?.coordinates, box)).map((feature) => ({ nationalFireId: feature.properties?.national_fire_id ?? null, agencyFireId: feature.properties?.agency_fire_id ?? null, agencyCode: feature.properties?.agency_code ?? null, statusDate: iso(feature.properties?.status_date), situationReportDate: iso(feature.properties?.situation_report_date), matchBasis: 'POINT_WITHIN_ESTIMATED_PERIMETER_BBOX' })).filter((item) => item.nationalFireId).sort((a, b) => a.nationalFireId.localeCompare(b.nationalFireId));
    return { state: candidates.length === 1 ? 'SINGLE_SPATIAL_CANDIDATE_NOT_AUTHORITATIVE' : candidates.length ? 'AMBIGUOUS_SPATIAL_CANDIDATES' : 'NO_SPATIAL_CANDIDATE', candidates };
  }
  async capturePerimeter({ manifest, incidentId, perimeterResult, feature, crosswalk = null } = {}) {
    if (!this.archiveService) throw new Error('cwfis_archive_service_required'); if (perimeterResult?.product !== CWFIS_PROSPECTIVE_PRODUCTS.FIRE_PERIMETER_ESTIMATE.id) throw new Error('cwfis_perimeter_result_required');
    const properties = feature?.properties ?? {};
    return this.archiveService.capture(manifest, { incidentId, providerId: this.id, productId: perimeterResult.product, providerPublishedAt: null, vigiaReceivedAt: perimeterResult.receivedAt, rawObjectReference: perimeterResult.rawProduct.originalUriOrObjectKey ?? perimeterResult.rawProduct.id, rawObjectHash: perimeterResult.rawProduct.checksumSha256, sourceHealth: perimeterResult.sourceHealth, perimeterRevision: { providerFeatureId: feature?.id ?? null, firstDetectionAt: iso(properties.firstdate), lastDetectionAt: iso(properties.lastdate), estimatedArea: Number.isFinite(Number(properties.area)) ? Number(properties.area) : null, geometry: structuredClone(feature?.geometry ?? null), providerPublicationTime: null, providerPublicationTimeStatus: perimeterResult.publicationTimeStatus, serviceResponseAt: perimeterResult.serviceResponseAt, crosswalk: structuredClone(crosswalk) }, shadowActions: [], lineage: { sourceLayer: CWFIS_PROSPECTIVE_PRODUCTS.FIRE_PERIMETER_ESTIMATE.layer, parserVersion: CWFIS_PROSPECTIVE_PRODUCTS.FIRE_PERIMETER_ESTIMATE.parserVersion, qualification: 'PROSPECTIVE_SHADOW_ONLY' } });
  }
}
