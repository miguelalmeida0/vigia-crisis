import { performance } from 'node:perf_hooks';
import { trustedFetch } from '../reality-network/trusted-endpoint.mjs';
import { fingerprint, persistRawObject, sha256 } from './contracts.mjs';
import { PROVIDERS } from './doctrine.mjs';
import { normalizeGeometry } from './geometry.mjs';
import { canonicalProviderIncidentId } from './identity.mjs';

const iso = (value) => { if (value === null || value === undefined || value === '') return null; const number = Number(value), date = Number.isFinite(number) && number > 1_000_000_000 ? new Date(number) : new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; };
const clean = (value) => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
const relations = (value) => String(value ?? '').split(/[,;|]/).map(clean).filter(Boolean);
const responseMetadata = (result) => ({ status: result.status, contentType: result.contentType, headers: result.headers, latencyMs: result.latencyMs });

async function getJson(url, provider, { projectRoot, sourceId, maximumBytes = 32 * 1024 * 1024, fetchImpl, clock, authorityClass = provider.authorityClass } = {}) {
  const result = await trustedFetch({ url, allowedHosts: [provider.host], maxBytes: maximumBytes, timeoutMs: 30_000, accept: 'application/json,application/geo+json,*/*;q=0.1', fetchImpl });
  if (!result.ok) throw new Error(`${provider.id}_http_${result.status}`); let value; try { value = JSON.parse(result.body.toString('utf8')); } catch { throw new Error(`${provider.id}_invalid_json`); }
  const raw = await persistRawObject(projectRoot, { body: result.body, providerId: provider.id, sourceId, requestIdentity: result.requestIdentity, responseMetadata: responseMetadata(result), retrievedAt: result.retrievedAt, authorityClass, rights: provider.rights });
  return { value, raw, result, receivedAt: clock().toISOString() };
}

export async function discoverProviderCapabilities({ projectRoot, fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
  const results = [];
  for (const provider of PROVIDERS) {
    if (!provider.service) { results.push(await discoverCwfis({ projectRoot, provider, fetchImpl, clock })); continue; }
    const [service, layer] = await Promise.all([getJson(`${provider.service}?f=pjson`, provider, { projectRoot, sourceId: `${provider.id}:service-metadata`, fetchImpl, clock }), getJson(`${provider.service}/${provider.layer}?f=pjson`, provider, { projectRoot, sourceId: `${provider.id}:layer-metadata`, fetchImpl, clock })]);
    const metadata = layer.value, fields = new Set((metadata.fields ?? []).map((item) => item.name)), advanced = metadata.advancedQueryCapabilities ?? {}, capabilities = {
      stableObjectIds: Boolean(metadata.objectIdField), stableGlobalIds: Boolean(metadata.globalIdField), editorTracking: Boolean(metadata.editingInfo), lastEditTimestamps: Boolean(metadata.editingInfo?.lastEditDate),
      serviceGeneration: service.value.currentVersion ?? metadata.currentVersion ?? null, serviceItemId: service.value.serviceItemId ?? metadata.serviceItemId ?? null, etag: layer.result.headers.etag ?? null,
      changeTracking: Boolean(metadata.changeTrackingInfo), sync: metadata.syncEnabled === true || service.value.syncEnabled === true, replicaGeneration: String(service.value.capabilities ?? '').includes('Sync'),
      historicMoment: advanced.supportsQueryWithHistoricMoment === true, archivedSnapshots: advanced.supportsQueryWithHistoricMoment === true || Boolean(metadata.changeTrackingInfo),
      queryByModificationTime: Boolean(provider.modifiedField && fields.has(provider.modifiedField)), queryByIncident: fields.has(provider.incidentIdField), pagination: advanced.supportsPagination === true,
      deletedFeatureTracking: Boolean(metadata.changeTrackingInfo?.supportsQueryWithChanges), maxRecordCount: metadata.maxRecordCount ?? service.value.maxRecordCount ?? null,
      providerFields: [...fields].sort(), rawMetadata: [service.raw.id, layer.raw.id], assumptionsMade: false
    };
    results.push({ providerId: provider.id, region: provider.region, authorityClass: provider.authorityClass, status: 'READY', capabilities, capabilityFingerprint: fingerprint('provider-change-capability', capabilities) });
  }
  return results;
}

async function discoverCwfis({ projectRoot, provider, fetchImpl, clock }) {
  const url = 'https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows?service=WFS&version=1.0.0&request=GetCapabilities', result = await trustedFetch({ url, allowedHosts: [provider.host], maxBytes: 8 * 1024 * 1024, timeoutMs: 30_000, accept: 'application/xml', fetchImpl });
  if (!result.ok) throw new Error(`cwfis_capabilities_http_${result.status}`); const text = result.body.toString('utf8'), raw = await persistRawObject(projectRoot, { body: result.body, providerId: provider.id, sourceId: 'cwfis:wfs-capabilities', requestIdentity: result.requestIdentity, responseMetadata: responseMetadata(result), retrievedAt: result.retrievedAt, authorityClass: provider.authorityClass, rights: provider.rights });
  const capabilities = { stableObjectIds: false, stableGlobalIds: false, editorTracking: false, lastEditTimestamps: true, serviceGeneration: text.match(/version="([^"]+)"/)?.[1] ?? null, serviceItemId: null, etag: result.headers.etag ?? null, changeTracking: false, sync: false, replicaGeneration: false, historicMoment: false, archivedSnapshots: true, queryByModificationTime: false, queryByIncident: false, pagination: true, deletedFeatureTracking: false, products: ['activefires.csv', 'm3_polygons_current', 'hotspots_last24hrs', 'perimeters shapefile components', 'progression shapefile components'], rawMetadata: [raw.id], assumptionsMade: false };
  return { providerId: provider.id, region: provider.region, authorityClass: provider.authorityClass, status: 'READY', capabilities, capabilityFingerprint: fingerprint('provider-change-capability', capabilities) };
}

export async function captureArcGisProvider(provider, { projectRoot, fetchImpl = globalThis.fetch, clock = () => new Date(), incident = null, pageSize = 100, maximumPages = 20 } = {}) {
  const started = performance.now(), rawObjects = [], features = [], where = incident ? `${provider.incidentIdField}='${clean(incident)}'` : provider.where;
  for (let page = 0; page < maximumPages; page += 1) {
    const url = new URL(`${provider.service}/${provider.layer}/query`), params = { f: 'geojson', where, outFields: '*', returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', orderByFields: `${provider.orderBy} ASC`, resultOffset: String(page * pageSize), resultRecordCount: String(pageSize) };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value); const response = await getJson(url, provider, { projectRoot, sourceId: `${provider.id}:current-perimeters:page:${page + 1}`, fetchImpl, clock, maximumBytes: 64 * 1024 * 1024 }); rawObjects.push(response.raw);
    if (response.value.type !== 'FeatureCollection' || !Array.isArray(response.value.features)) throw new Error(`${provider.id}_schema_drift`);
    for (const feature of response.value.features) features.push(normalizeOfficialFeature(provider, feature, response.raw, response.result.retrievedAt, clock().toISOString()));
    if (response.value.properties?.exceededTransferLimit !== true && response.value.features.length < pageSize) return { providerId: provider.id, features, rawObjects, complete: true, latencyMs: Number((performance.now() - started).toFixed(3)) };
  }
  return { providerId: provider.id, features, rawObjects, complete: false, latencyMs: Number((performance.now() - started).toFixed(3)), blocker: 'MAXIMUM_PAGES_REACHED' };
}

export function normalizeOfficialFeature(provider, feature, raw, retrievedAt, canonicalIngestedAt) {
  const started = performance.now(), properties = feature.properties ?? {}, providerIncidentId = clean(properties[provider.incidentIdField]), canonicalIncidentToken = canonicalProviderIncidentId(provider.id, providerIncidentId), providerFeatureId = clean(properties[provider.stableIdField] ?? feature.id ?? properties.OBJECTID), normalized = normalizeGeometry(feature.geometry), providerPublishedAt = iso(provider.publishedField ? properties[provider.publishedField] : null), providerModifiedAt = iso(provider.modifiedField ? properties[provider.modifiedField] : null), providerObservedAt = iso(provider.observedField ? properties[provider.observedField] : null);
  const areaValue = Number(properties[provider.areaField]), areaSquareKm = Number.isFinite(areaValue) ? provider.id === 'nifc-wfigs' ? areaValue * 0.0040468564224 : areaValue / 100 : normalized.areaSquareKm;
  const metadata = { status: properties[provider.statusField] ?? null, version: properties[provider.versionField] ?? null, source: properties.SOURCE ?? properties.DataSource ?? properties.poly_Source ?? null, name: properties.FIRE_OF_NOTE_NAME ?? properties.IncdtName ?? properties.poly_IncidentName ?? null, jurisdiction: properties.RESP_AREA ?? properties.attr_POOState ?? provider.jurisdiction, providerChangeReason: properties.CHANGE_REASON ?? properties.EditReason ?? properties.poly_FeatureCategory ?? null, mergeOf: relations(properties.MERGE_OF ?? properties.MergeOf), splitFrom: clean(properties.SPLIT_FROM ?? properties.SplitFrom) || null };
  const clocks = { providerObservedAt, providerPublishedAt, providerModifiedAt, retrievedAt, availableToVigiaAt: retrievedAt, canonicalIngestedAt, projectionUpdatedAt: canonicalIngestedAt, chronologyBasis: providerPublishedAt ? 'EXPLICIT_PROVIDER_PUBLICATION_FIELD' : 'RETRIEVAL_TIME_ONLY' };
  return { schemaVersion: 'vigia.authoritative-perimeter-capture.v1', providerId: provider.id, region: provider.region, jurisdiction: provider.jurisdiction, authorityClass: provider.authorityClass, incidentId: `${provider.region}:${canonicalIncidentToken || providerFeatureId}`, providerIncidentId: providerIncidentId || null, providerFeatureId, rawObjectReference: raw.binaryReference, rawObjectId: raw.id, rawObjectHash: raw.sha256, originalGeometry: feature.geometry ?? null, originalGeometryHash: fingerprint('raw-provider-geometry', feature.geometry ?? null), geometry: normalized.geometry, normalizedGeometryHash: normalized.hash ?? null, geometryQuality: { valid: normalized.valid, reason: normalized.reason, quality: normalized.quality ?? 'INVALID' }, bbox: normalized.bbox ?? null, centroid: normalized.centroid ?? null, areaSquareKm: Number(areaSquareKm.toFixed(6)), status: metadata.status, metadata, metadataHash: fingerprint('perimeter-metadata', metadata), clocks, rights: provider.rights, featureFingerprint: fingerprint('authoritative-provider-feature', { providerId: provider.id, providerFeatureId, incidentId: providerIncidentId, canonicalIncidentToken, geometry: normalized.hash, metadata, clocks: { providerObservedAt, providerPublishedAt, providerModifiedAt } }), processingMs: Number((performance.now() - started).toFixed(3)) };
}

export async function captureCwfisProducts(provider, { projectRoot, fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
  const today = clock().toISOString().slice(0, 10).replaceAll('-', ''), products = [
    ['active-fires', 'https://cwfis.cfs.nrcan.gc.ca/downloads/reportedfires/activefires.csv', 'OFFICIAL_INCIDENT_REFERENCE'],
    ['daily-hotspots', `https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/${today}.csv`, 'DERIVED_SENSOR_PROGRESSION'],
    ['m3-perimeters', 'https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/perimeters.shp', 'DERIVED_SENSOR_PROGRESSION'], ['m3-perimeters-attributes', 'https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/perimeters.dbf', 'DERIVED_SENSOR_PROGRESSION'],
    ['m3-progression', 'https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/progression.shp', 'DERIVED_SENSOR_PROGRESSION'], ['m3-progression-attributes', 'https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/progression.dbf', 'DERIVED_SENSOR_PROGRESSION']
  ], rawObjects = [], failures = [];
  for (const [sourceId, url, authorityClass] of products) try { const result = await trustedFetch({ url, allowedHosts: [provider.host], maxBytes: 32 * 1024 * 1024, timeoutMs: 30_000, accept: '*/*', fetchImpl }); if (!result.ok) throw new Error(`http_${result.status}`); rawObjects.push(await persistRawObject(projectRoot, { body: result.body, providerId: provider.id, sourceId: `cwfis:${sourceId}`, requestIdentity: result.requestIdentity, responseMetadata: responseMetadata(result), retrievedAt: result.retrievedAt, authorityClass, rights: provider.rights })); } catch (error) { failures.push({ sourceId, error: String(error.message ?? error) }); }
  return { providerId: provider.id, features: [], rawObjects, complete: failures.length === 0, failures, latencyMs: rawObjects.reduce((sum, item) => sum + Number(item.responseMetadata?.latencyMs ?? 0), 0) };
}

export const rawPublicationIdentity = (objects) => fingerprint('provider-publication', objects.map((item) => ({ id: item.id, headers: item.responseMetadata?.headers ?? {} })).sort((a, b) => a.id.localeCompare(b.id)));
export const providerDefinitions = () => PROVIDERS.map((item) => ({ ...item, rights: { ...item.rights } }));
