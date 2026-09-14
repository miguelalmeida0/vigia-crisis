import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { createKnowledgeTimeRecord } from '../../../../../packages/domain/src/forecast-corpus/index.mjs';
import { trustedFetch } from '../reality-network/trusted-endpoint.mjs';

const ENDPOINT = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Daily_Perimeters_Public/FeatureServer/0/query';
const FIELDS = ['OBJECTID', 'poly_IncidentName', 'poly_Source', 'poly_GISAcres', 'poly_CreateDate', 'poly_DateCurrent', 'poly_PolygonDateTime', 'poly_IRWINID', 'poly_FORID', 'attr_UniqueFireIdentifier', 'attr_IrwinID', 'attr_FireDiscoveryDateTime', 'attr_ModifiedOnDateTime_dt', 'attr_IncidentTypeCategory', 'attr_POOState', 'attr_InitialLatitude', 'attr_InitialLongitude', 'BurnPeriod', 'AcreageChange'];
const iso = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? new Date(Number(value)).toISOString() : null;
function whereFor(manifest) {
  const ids = manifest.incidentSelectionRules?.incidentIds ?? [];
  if (ids.length) { if (ids.some((id) => !/^20\d{2}-[A-Z0-9-]{3,40}$/.test(id))) throw new Error('wfigs_incident_id_invalid'); return `attr_UniqueFireIdentifier IN (${ids.map((id) => `'${id}'`).join(',')})` + " AND attr_IncidentTypeCategory = 'WF'"; }
  const from = manifest.from.slice(0, 10), to = manifest.to.slice(0, 10);
  return `attr_IncidentTypeCategory = 'WF' AND attr_FireDiscoveryDateTime >= DATE '${from}' AND attr_FireDiscoveryDateTime <= DATE '${to}'`;
}
export async function fetchWfigsArchive({ manifest, rawVault, fetchImpl = globalThis.fetch, clock = () => new Date(), offset = 0 } = {}) {
  const limit = Math.min(40, manifest.budgets.maxProviderObjects), region = manifest.regions.find((item) => item.id === 'western-us') ?? manifest.regions[0], query = new URLSearchParams({ f: 'geojson', where: whereFor(manifest), outFields: FIELDS.join(','), returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', orderByFields: 'attr_UniqueFireIdentifier ASC,BurnPeriod ASC', resultOffset: String(offset), resultRecordCount: String(limit) });
  if (!manifest.incidentSelectionRules?.incidentIds?.length) { query.set('geometry', region.bbox.join(',')); query.set('geometryType', 'esriGeometryEnvelope'); query.set('inSR', '4326'); query.set('spatialRel', 'esriSpatialRelIntersects'); }
  const response = await trustedFetch({ url: `${ENDPOINT}?${query}`, allowedHosts: ['services3.arcgis.com'], maxBytes: Math.min(64 * 1024 * 1024, manifest.budgets.maxBytes), timeoutMs: Math.min(30_000, manifest.budgets.maxRuntimeSeconds * 1_000), accept: 'application/geo+json,application/json', fetchImpl });
  if (!response.ok) throw new Error(`wfigs_archive_http_${response.status}`);
  let payload; try { payload = JSON.parse(response.body); } catch { throw new Error('wfigs_archive_invalid_json'); }
  if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features) || payload.features.length > limit) throw new Error('wfigs_archive_schema_invalid');
  const productId = `WFIGS_DAILY:${manifest.from}:${manifest.to}:${offset}:${semanticHash('wfigs-page', payload).split(':').at(-1)}`;
  const preserved = await rawVault.preserve({ providerId: 'nifc-wfigs-daily', sourceId: 'wfigs:daily-perimeters', providerProductId: productId, body: response.body, requestIdentity: response.requestIdentity, response: { ...response, sourceTimestampRange: { start: manifest.from, end: manifest.to } }, licenceId: 'NIFC-OPEN-DATA', parserVersion: 'vigia.wfigs-daily-geojson.v1', requestWindow: { offset, limit, bbox: region.bbox }, fetchRunId: manifest.integrity.fingerprint, retrievedAt: response.retrievedAt });
  const canonicalIngestedAt = clock().toISOString(), states = payload.features.map((feature) => normalizeWfigsState(feature, preserved.product, response.retrievedAt, canonicalIngestedAt)).filter(Boolean);
  await rawVault.bindOutcome(preserved.retrieval, { canonicalEventIds: states.map((item) => item.id) });
  return { states, rawProduct: preserved.product, duplicate: preserved.duplicate, nextOffset: payload.properties?.exceededTransferLimit === true ? offset + payload.features.length : null, responseBytes: response.body.length };
}
export function normalizeWfigsState(feature, rawProduct, retrievedAt, canonicalIngestedAt) {
  const p = feature.properties ?? {}, incidentId = String(p.attr_UniqueFireIdentifier ?? ''), observedAt = iso(p.poly_PolygonDateTime) ?? iso(p.poly_DateCurrent), providerPublishedAt = iso(p.poly_CreateDate) ?? iso(p.attr_ModifiedOnDateTime_dt);
  if (!incidentId || !observedAt || !providerPublishedAt || !feature.geometry) return null;
  const availableToVigiaAt = new Date(Date.parse(providerPublishedAt) + 15 * 60_000).toISOString(), clocks = createKnowledgeTimeRecord({ physicalOccurredAt: observedAt, observedAt, providerPublishedAt, providerModifiedAt: iso(p.attr_ModifiedOnDateTime_dt), retrievedAt, availableToVigiaAt, canonicalIngestedAt, labelPublishedAt: availableToVigiaAt, arrivalTimeBasis: 'DOCUMENTED_LATENCY_MODEL', arrivalModelVersion: 'wfigs-daily-source-create-plus-15m.v1' });
  const core = { providerId: 'nifc-wfigs-daily', providerFeatureId: String(feature.id ?? p.OBJECTID), providerIncidentId: incidentId, revision: Number(p.BurnPeriod), incidentName: p.poly_IncidentName ?? null, jurisdiction: p.attr_POOState ?? null, discoveryTime: iso(p.attr_FireDiscoveryDateTime), geometry: feature.geometry, acres: Number.isFinite(Number(p.poly_GISAcres)) ? Number(p.poly_GISAcres) : null, acreageChange: Number.isFinite(Number(p.AcreageChange)) ? Number(p.AcreageChange) : null, sourceAgency: p.poly_Source ?? null, identifiers: { wfigs: incidentId, irwin: p.attr_IrwinID ?? p.poly_IRWINID ?? null, forid: p.poly_FORID ?? null }, clocks, bronzeRefs: [rawProduct.id], originalGeometryHash: semanticHash('wfigs-native-geometry', feature.geometry), processingMode: 'NRT' };
  const identity = { providerId: core.providerId, providerFeatureId: core.providerFeatureId, providerIncidentId: core.providerIncidentId, revision: core.revision, observedAt, originalGeometryHash: core.originalGeometryHash };
  return { ...core, id: semanticHash('wfigs-daily-state', identity) };
}
