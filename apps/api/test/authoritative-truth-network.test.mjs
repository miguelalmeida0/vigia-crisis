import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import fc from 'fast-check';
import { emptyNetworkState, fingerprint } from '../src/modules/authoritative-truth/contracts.mjs';
import { normalizeGeometry } from '../src/modules/authoritative-truth/geometry.mjs';
import { classifyRevision, classifySnapshot, removedRevision } from '../src/modules/authoritative-truth/revision-engine.mjs';
import { canonicalRevisionOrder, detectSourceConflicts, ingestProviderCapture, materializeSequences, reconcileNetworkStateIdentity, recordProviderUnavailable } from '../src/modules/authoritative-truth/network-repository.mjs';
import { canonicalProviderIncidentId } from '../src/modules/authoritative-truth/identity.mjs';
import { buildIncrementalOfficialLabels, labelSummary } from '../src/modules/authoritative-truth/label-factory.mjs';
import { forecastIntegrity } from '../src/modules/authoritative-truth/forecast-scoring-service.mjs';
import { replayTruthNetwork } from '../src/modules/authoritative-truth/replay-service.mjs';

const provider = { id: 'bc-wildfire-service', region: 'CA-BC', jurisdiction: 'CA-BC', authorityClass: 'AUTHORITATIVE_OPERATIONAL_PERIMETER', cadenceSeconds: 300, rights: { licenceId: 'OGL-BC', permitScientificRetention: true } };
const rectangle = (size = 1, x = -122, y = 50) => ({ type: 'Polygon', coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] });
function feature({ size = 1, published = '2026-08-25T12:00:00Z', available = published, incidentId = 'CA-BC:TEST1', providerId = provider.id, jurisdiction = 'CA-BC', authorityClass = 'AUTHORITATIVE_OPERATIONAL_PERIMETER', featureId = 'feature-1', status = 'Out of Control', rights = provider.rights, geometry = rectangle(size), metadata = {} } = {}) {
  const normalized = normalizeGeometry(geometry), clocks = { providerObservedAt: published, providerPublishedAt: published, providerModifiedAt: published, retrievedAt: available, availableToVigiaAt: available, canonicalIngestedAt: available, projectionUpdatedAt: available, chronologyBasis: 'EXPLICIT_PROVIDER_PUBLICATION_FIELD' }, details = { status, version: published, ...metadata };
  return { schemaVersion: 'vigia.authoritative-perimeter-capture.v1', providerId, region: jurisdiction, jurisdiction, authorityClass, incidentId, providerIncidentId: incidentId.split(':').at(-1), providerFeatureId: featureId, rawObjectReference: `raw/${featureId}.json`, rawObjectId: `raw:${featureId}:${published}`, rawObjectHash: fingerprint('raw', { featureId, published }), originalGeometry: geometry, originalGeometryHash: fingerprint('original', geometry), geometry: normalized.geometry, normalizedGeometryHash: normalized.hash, geometryQuality: { valid: normalized.valid, reason: normalized.reason, quality: normalized.quality }, bbox: normalized.bbox, centroid: normalized.centroid, areaSquareKm: normalized.areaSquareKm, status, metadata: details, metadataHash: fingerprint('metadata', details), clocks, rights, featureFingerprint: fingerprint('feature', { featureId, published, normalized: normalized.hash, details }) };
}
const state = () => emptyNetworkState({ campaignId: 'test-campaign', now: '2026-08-25T12:00:00Z' });
const capture = (features, publication = 'publication-1', overrides = {}) => ({ providerId: provider.id, features, rawObjects: [], complete: true, filtered: true, publicationFingerprint: publication, latencyMs: 1, ...overrides });

test('unchanged polling creates availability evidence but no new semantic revision', () => {
  const network = state(), first = feature(); ingestProviderCapture(network, provider, capture([first]), first.clocks.retrievedAt); const revisions = network.revisions.length; const update = ingestProviderCapture(network, provider, capture([first], 'publication-1'), '2026-08-25T12:05:00Z');
  assert.equal(update.observations[0].snapshotClass, 'NO_PROVIDER_CHANGE'); assert.equal(network.revisions.length, revisions);
});

test('genuine growth and bounded high-overlap refinement are classified separately', () => {
  const prior = feature(), growth = feature({ size: 1.2, published: '2026-08-25T13:00:00Z' }), refinement = { ...feature({ size: 1.01, published: '2026-08-25T13:00:00Z' }), areaSquareKm: prior.areaSquareKm * 1.005 };
  assert.equal(classifyRevision(prior, growth).classification, 'NORMAL_PROGRESSION'); assert.equal(classifyRevision(prior, refinement).classification, 'GEOMETRY_REFINEMENT');
});

test('correction, shrink, merge and split fail closed for official growth labels', () => {
  const prior = feature(), later = feature({ size: 0.5, published: '2026-08-25T13:00:00Z' });
  assert.equal(classifyRevision(prior, later, { providerChangeReason: 'corrected mapping' }).classification, 'CORRECTION'); assert.equal(classifyRevision(prior, later).classification, 'UNKNOWN_CHANGE'); assert.equal(classifyRevision(prior, later, { mergeOf: ['a', 'b'] }).classification, 'MERGE'); assert.equal(classifyRevision(prior, later, { splitFrom: 'a' }).classification, 'SPLIT');
  for (const hints of [{ providerChangeReason: 'correction' }, { mergeOf: ['a'] }, { splitFrom: 'a' }]) assert.equal(classifyRevision(prior, later, hints).acceptedForLabel, false);
});

test('deleted perimeter, incident reassociation, clock anomaly, invalid geometry and duplicate are explicit', () => {
  const prior = feature(), removed = removedRevision(prior, '2026-08-25T13:00:00Z'), reassociated = feature({ incidentId: 'CA-BC:TEST2', published: '2026-08-25T13:00:00Z' }), late = feature({ size: 1.1, published: '2026-08-25T11:00:00Z' }), invalid = { ...feature({ published: '2026-08-25T13:00:00Z' }), geometryQuality: { valid: false, reason: 'SELF_INTERSECTION' } };
  assert.equal(classifyRevision(prior, removed, { removed: true }).classification, 'PERIMETER_RETRACTION'); assert.equal(classifyRevision(prior, reassociated).classification, 'INCIDENT_REASSOCIATION'); assert.equal(classifyRevision(prior, late).classification, 'CLOCK_ANOMALY'); assert.equal(classifyRevision(prior, invalid).classification, 'INVALID_GEOMETRY'); assert.equal(classifyRevision(prior, prior).classification, 'DUPLICATE');
});

test('provider outage and recovery are retained without a negative perimeter claim', () => {
  const network = state(); recordProviderUnavailable(network, provider, new Error('outage'), '2026-08-25T12:00:00Z'); assert.equal(network.pollObservations[0].snapshotClass, 'PROVIDER_UNAVAILABLE'); assert.equal(network.pollObservations[0].incidentId, null);
  ingestProviderCapture(network, provider, capture([feature()]), '2026-08-25T12:05:00Z'); assert.equal(network.providers[provider.id].health, 'LIVE'); assert.equal(network.providers[provider.id].recoveries, 1); assert.equal(network.pollObservations.at(-1).snapshotClass, 'SOURCE_HEALTH_CHANGED');
});

test('durable cursors survive restart and Alberta incident aliases crosswalk deterministically', () => {
  const network = state(); ingestProviderCapture(network, provider, capture([feature()]), '2026-08-25T12:00:00Z'); const restarted = structuredClone(network); reconcileNetworkStateIdentity(restarted);
  assert.equal(restarted.cursors[provider.id].pollCount, 1); assert.equal(restarted.cursors[provider.id].lastPublicationFingerprint, 'publication-1'); assert.equal(canonicalProviderIncidentId('alberta-wildfire', 'HWF-145-2026'), 'HWF1452026');
});

test('schema drift and late provider publication do not become progression', () => {
  const prior = feature(), invalid = { ...feature({ published: '2026-08-25T13:00:00Z' }), geometryQuality: { valid: false, reason: 'SCHEMA_DRIFT' } }, late = feature({ size: 1.2, published: '2026-08-25T11:00:00Z' });
  assert.equal(classifySnapshot(prior, invalid), 'SCHEMA_CHANGED'); assert.equal(classifyRevision(prior, late).acceptedForLabel, false);
});

test('simultaneous independent provider changes remain separate sequences', () => {
  const network = state(), secondProvider = { ...provider, id: 'nifc-wfigs', region: 'US-WEST', jurisdiction: 'US' }, bc = feature(), us = feature({ providerId: secondProvider.id, jurisdiction: 'US', incidentId: 'US-WEST:TEST2', featureId: 'us-1' });
  ingestProviderCapture(network, provider, capture([bc]), bc.clocks.retrievedAt); ingestProviderCapture(network, secondProvider, { ...capture([us]), providerId: secondProvider.id }, us.clocks.retrievedAt); assert.equal(Object.keys(network.sequences).length, 2);
});

test('inside-tolerance authoritative revisions create labels; outside tolerance does not', () => {
  const network = state(), issue = feature(), later = feature({ size: 1.2, published: '2026-08-25T13:00:00Z', available: '2026-08-25T13:01:00Z' }); ingestProviderCapture(network, provider, capture([issue]), issue.clocks.retrievedAt); const update = ingestProviderCapture(network, provider, capture([later], 'publication-2'), later.clocks.retrievedAt), built = buildIncrementalOfficialLabels(network, update.touchedIncidentIds, later.clocks.retrievedAt);
  assert.equal(built.created.filter((item) => item.horizon === '1h').length, 1); assert.equal(labelSummary(network).horizons['1h'], 1);
  const outside = state(), muchLater = feature({ size: 1.2, published: '2026-08-25T14:00:00Z' }); ingestProviderCapture(outside, provider, capture([issue]), issue.clocks.retrievedAt); const outsideUpdate = ingestProviderCapture(outside, provider, capture([muchLater], 'publication-2'), muchLater.clocks.retrievedAt); buildIncrementalOfficialLabels(outside, outsideUpdate.touchedIncidentIds, muchLater.clocks.retrievedAt); assert.equal(labelSummary(outside).horizons['1h'], 0);
});

test('sensor-derived and rights-restricted states cannot satisfy the official gate', () => {
  for (const override of [{ authorityClass: 'DERIVED_SENSOR_PROGRESSION' }, { rights: { licenceId: 'RESTRICTED', permitScientificRetention: false } }]) { const network = state(), issue = feature(override), later = feature({ ...override, size: 1.2, published: '2026-08-25T13:00:00Z' }); ingestProviderCapture(network, provider, capture([issue]), issue.clocks.retrievedAt); const update = ingestProviderCapture(network, provider, capture([later], 'publication-2'), later.clocks.retrievedAt); buildIncrementalOfficialLabels(network, update.touchedIncidentIds, later.clocks.retrievedAt); assert.equal(network.labels.length, 0); }
});

test('future-data leakage invalidates a forecast comparison', () => {
  const label = { incidentId: 'CA-BC:TEST1', issueAvailableToVigiaAt: '2026-08-25T12:00:00Z', laterTruthAvailableToVigiaAt: '2026-08-25T13:01:00Z' }, forecast = { forecastId: 'f', outputHash: 'o', inputManifestHash: 'i', replayFingerprint: 'r', model: { fingerprint: 'm' }, incidentId: 'incident:TEST1', issuedAt: '2026-08-25T12:05:00Z', informationCutoff: '2026-08-25T12:01:00Z' };
  assert.ok(forecastIntegrity(forecast, label).includes('FORECAST_FUTURE_DATA_LEAKAGE'));
});

test('conflicting in-jurisdiction official sources are represented and out-of-jurisdiction sources cannot override', () => {
  const network = state(), local = feature(), reference = feature({ size: 1.2, providerId: 'cwfis-nrcan', authorityClass: 'OFFICIAL_REFERENCE_PERIMETER', featureId: 'cwfis-1' }); network.providers[provider.id] = { currentFeatures: { local }, health: 'LIVE' }; network.providers['cwfis-nrcan'] = { currentFeatures: { reference }, health: 'LIVE' }; assert.equal(detectSourceConflicts(network, '2026-08-25T13:00:00Z')[0].resolutionState, 'RESOLVED_BY_JURISDICTION_SCOPE');
  const out = feature({ size: 1.3, providerId: 'nifc-wfigs', jurisdiction: 'US', incidentId: 'US-WEST:TEST1', featureId: 'us' }); network.providers['nifc-wfigs'] = { currentFeatures: { out }, health: 'LIVE' }; assert.equal(detectSourceConflicts(network, '2026-08-25T13:00:00Z').some((item) => item.objects.some((object) => object.providerId === 'nifc-wfigs')), false);
});

test('replay verifies chains, labels, backup/restore and fingerprints', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'vigia-authoritative-replay-')), network = state(), issue = feature(), later = feature({ size: 1.2, published: '2026-08-25T13:00:00Z' }); ingestProviderCapture(network, provider, capture([issue]), issue.clocks.retrievedAt); const update = ingestProviderCapture(network, provider, capture([later], 'publication-2'), later.clocks.retrievedAt); buildIncrementalOfficialLabels(network, update.touchedIncidentIds, later.clocks.retrievedAt); network.shutdownClean = true; network.updatedAt = later.clocks.retrievedAt; network.checkpoints.push({ cycle: 1 }); const replay = await replayTruthNetwork({ projectRoot: root, state: network, clock: () => new Date('2026-08-25T14:00:00Z') }); assert.equal(replay.passed, true);
});

test('metamorphic geometry rotation, duplicate capture and ledger ordering preserve semantics', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 3 }), (rotation) => { const ring = rectangle().coordinates[0].slice(0, -1), rotated = [...ring.slice(rotation), ...ring.slice(0, rotation)], geometry = { type: 'Polygon', coordinates: [[...rotated, rotated[0]]] }; assert.equal(normalizeGeometry(geometry).hash, normalizeGeometry(rectangle()).hash); }), { numRuns: 40 });
  const network = state(), issue = feature(), later = feature({ size: 1.2, published: '2026-08-25T13:00:00Z' }); ingestProviderCapture(network, provider, capture([issue]), issue.clocks.retrievedAt); const update = ingestProviderCapture(network, provider, capture([later], 'publication-2'), later.clocks.retrievedAt); buildIncrementalOfficialLabels(network, update.touchedIncidentIds, later.clocks.retrievedAt); const labels = network.labels.length, revisions = network.revisions.length; ingestProviderCapture(network, provider, capture([later], 'publication-2'), '2026-08-25T13:05:00Z'); buildIncrementalOfficialLabels(network, [later.incidentId], '2026-08-25T13:05:00Z'); assert.equal(network.labels.length, labels); assert.equal(network.revisions.length, revisions);
  const ordered = materializeSequences(network)[0].revisions.map((item) => item.revisionId), reversed = canonicalRevisionOrder([...network.revisions].reverse()).map((item) => item.revisionId); assert.deepEqual(reversed, ordered);
});
