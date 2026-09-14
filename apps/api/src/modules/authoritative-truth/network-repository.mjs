import { readJson } from '../../shared/json-file.mjs';
import { closurePaths } from '../scientific-truth/contracts.mjs';
import { fingerprint } from './contracts.mjs';
import { normalizeGeometry } from './geometry.mjs';
import { canonicalIncidentId, canonicalProviderIncidentId, sequenceKey } from './identity.mjs';
import { classifyRevision, classifySnapshot, removedRevision } from './revision-engine.mjs';

const keyOf = (item) => `${item.providerId}:${item.providerFeatureId}`;
const nowMs = (value) => Number.isFinite(Date.parse(value ?? '')) ? Date.parse(value) : 0;
const unique = (values) => [...new Set(values.filter(Boolean))];
const compactCurrentFeature = (feature) => { const { originalGeometry: _originalGeometry, geometry: _geometry, ...projection } = feature; return { ...projection, geometryStorage: 'REVISION_LEDGER_AND_CONTENT_ADDRESSED_RAW' }; };

function revisionCore(feature, classification, priorRevisionId, { importedFromBaseline = false, acceptedForLabel = false, reason = null, diagnostics = null } = {}) {
  return {
    schemaVersion: 'vigia.authoritative-perimeter-revision.v1', incidentId: feature.incidentId, jurisdiction: feature.jurisdiction, region: feature.region, providerId: feature.providerId, authorityClass: feature.authorityClass,
    providerFeatureId: feature.providerFeatureId, providerIncidentId: feature.providerIncidentId, rawObjectReference: feature.rawObjectReference, rawObjectId: feature.rawObjectId, rawObjectHash: feature.rawObjectHash,
    originalGeometry: feature.originalGeometry, originalGeometryHash: feature.originalGeometryHash, geometry: feature.geometry, normalizedGeometryHash: feature.normalizedGeometryHash, bbox: feature.bbox, centroid: feature.centroid, areaSquareKm: feature.areaSquareKm,
    status: feature.status, metadata: feature.metadata, metadataHash: feature.metadataHash, clocks: feature.clocks, revisionClassification: classification, quality: feature.geometryQuality, rights: feature.rights,
    priorRevisionId, knowledgeTimeAvailability: feature.clocks.availableToVigiaAt, importedFromBaseline, acceptedForOfficialLabel: acceptedForLabel, classificationReason: reason, diagnostics
  };
}

function appendRevision(state, feature, classification, options = {}) {
  const key = sequenceKey(feature.providerId, feature.incidentId), sequence = state.sequences[key] ?? { schemaVersion: 'vigia.authoritative-perimeter-sequence.v1', incidentId: feature.incidentId, jurisdiction: feature.jurisdiction, region: feature.region, providerId: feature.providerId, authorityClass: feature.authorityClass, revisionIds: [], rights: feature.rights, appendOnly: true };
  const priorRevisionId = sequence.revisionIds.at(-1) ?? null, core = revisionCore(feature, classification, priorRevisionId, options), revision = { ...core, revisionId: fingerprint('authoritative-perimeter-revision', core) };
  if (state.revisions.some((item) => item.revisionId === revision.revisionId)) return state.revisions.find((item) => item.revisionId === revision.revisionId);
  state.revisions.push(revision); sequence.revisionIds.push(revision.revisionId); state.sequences[key] = sequence; return revision;
}

export function reconcileNetworkStateIdentity(state) {
  state.cursors ??= {}; state.providerPublications ??= []; state.revisionAdjudications ??= [];
  for (const [providerId, providerState] of Object.entries(state.providers ?? {})) {
    for (const [key, feature] of Object.entries(providerState.currentFeatures ?? {})) { feature.incidentId = canonicalIncidentId(providerId, feature.region, feature.incidentId, feature.providerIncidentId); providerState.currentFeatures[key] = compactCurrentFeature(feature); }
    const fingerprintValue = providerState.lastPublicationFingerprint;
    if (fingerprintValue && !state.providerPublications.some((item) => item.providerId === providerId && item.publicationFingerprint === fingerprintValue)) state.providerPublications.push({ schemaVersion: 'vigia.provider-publication.v1', providerId, publicationFingerprint: fingerprintValue, firstRetrievedAt: providerState.lastCompletedAt ?? state.updatedAt, rawObjectIds: providerState.lastRawObjectIds ?? [], recordCount: providerState.lastRecords ?? 0, complete: providerState.health === 'LIVE', authorityClasses: [], recoveredFromDurableProviderState: true });
    state.cursors[providerId] ??= { schemaVersion: 'vigia.provider-cursor.v1', providerId, pollCount: providerState.lastCompletedAt ? 1 : 0, lastCompletedAt: providerState.lastCompletedAt ?? null, lastPublicationFingerprint: fingerprintValue ?? null, lastRawObjectIds: providerState.lastRawObjectIds ?? [], consecutiveFailures: Number(providerState.failures ?? 0), circuitState: Number(providerState.failures ?? 0) >= 3 ? 'OPEN' : 'CLOSED', nextPollAt: providerState.lastCompletedAt ?? null };
  }
  const rebuilt = {}, revisionsById = new Map((state.revisions ?? []).map((item) => [item.revisionId, item]));
  for (const priorSequence of Object.values(state.sequences ?? {})) {
    const firstRevision = revisionsById.get(priorSequence.revisionIds[0]), providerId = priorSequence.providerId ?? firstRevision?.providerId, region = priorSequence.region ?? firstRevision?.region, incidentId = canonicalIncidentId(providerId, region, priorSequence.incidentId, firstRevision?.providerIncidentId), key = sequenceKey(providerId, incidentId), sequence = { ...priorSequence, providerId, region, incidentId, revisionIds: [...priorSequence.revisionIds], projectionState: 'CURRENT' };
    if (!rebuilt[key]) rebuilt[key] = sequence;
    else {
      const existingLast = revisionsById.get(rebuilt[key].revisionIds.at(-1)), candidateLast = revisionsById.get(sequence.revisionIds.at(-1)), existingTime = nowMs(existingLast?.clocks?.availableToVigiaAt), candidateTime = nowMs(candidateLast?.clocks?.availableToVigiaAt), branchKey = `${key}|historical:${String((candidateTime > existingTime ? rebuilt[key] : sequence).revisionIds[0]).slice(-16)}`;
      if (candidateTime > existingTime) { rebuilt[branchKey] = { ...rebuilt[key], projectionState: 'HISTORICAL_IDENTITY_BRANCH' }; rebuilt[key] = sequence; } else rebuilt[branchKey] = { ...sequence, projectionState: 'HISTORICAL_IDENTITY_BRANCH' };
    }
  }
  state.sequences = rebuilt;
  state.selectedIncidents = (state.selectedIncidents ?? []).map((item) => ({ ...item, incidentId: canonicalIncidentId(item.providerId, item.region, item.incidentId) }));
  const currentIdentity = new Set(Object.values(state.providers ?? {}).flatMap((providerState) => Object.values(providerState.currentFeatures ?? {})).map((item) => `${item.providerId}:${item.incidentId}`));
  for (const revision of state.revisions ?? []) if (revision.revisionClassification === 'PERIMETER_RETRACTION') {
    const incidentId = canonicalIncidentId(revision.providerId, revision.region, revision.incidentId, revision.providerIncidentId);
    if (currentIdentity.has(`${revision.providerId}:${incidentId}`) && !state.revisionAdjudications.some((item) => item.revisionId === revision.revisionId)) {
      const core = { schemaVersion: 'vigia.revision-adjudication.v1', revisionId: revision.revisionId, providerId: revision.providerId, incidentId, adjudication: 'EXCLUDE_FALSE_REMOVAL_IDENTITY_ALIAS', reason: 'PROVIDER_INCIDENT_FORMAT_NORMALIZATION_CROSSWALK', historyRetained: true, adjudicatedAt: state.updatedAt };
      state.revisionAdjudications.push({ ...core, adjudicationId: fingerprint('revision-adjudication', core) });
    }
  }
  return state;
}

export async function bootstrapScientificPerimeters(state, projectRoot) {
  if (state.baselineReference) return state; const archive = await readJson(closurePaths(projectRoot).perimeterArchive, null);
  if (!archive) { state.baselineReference = { state: 'NOT_AVAILABLE' }; return state; }
  const latest = new Map(); for (const snapshot of archive.snapshots ?? []) latest.set(`${snapshot.providerId}:${snapshot.incidentId}`, snapshot);
  for (const snapshot of latest.values()) {
    const normalized = normalizeGeometry(snapshot.geometry), providerId = snapshot.providerId, region = providerId === 'alberta-wildfire' ? 'CA-AB' : 'CA-BC', providerFeatureId = String(snapshot.state?.version ?? snapshot.observationId), feature = {
      providerId, region, jurisdiction: region, authorityClass: snapshot.authorityClass, incidentId: canonicalIncidentId(providerId, region, snapshot.incidentId, snapshot.incidentId), providerIncidentId: snapshot.incidentId, providerFeatureId,
      rawObjectReference: snapshot.rawProductId, rawObjectId: snapshot.rawProductId, rawObjectHash: snapshot.rawObjectHash, originalGeometry: snapshot.geometry, originalGeometryHash: fingerprint('legacy-raw-geometry', snapshot.geometry), geometry: normalized.geometry,
      normalizedGeometryHash: normalized.hash, bbox: normalized.bbox, centroid: normalized.centroid, areaSquareKm: normalized.areaSquareKm, status: snapshot.state?.status ?? null,
      metadata: { status: snapshot.state?.status ?? null, version: snapshot.state?.version ?? null, source: snapshot.state?.source ?? null, importedObservationId: snapshot.observationId }, metadataHash: fingerprint('legacy-perimeter-metadata', snapshot.state ?? {}),
      clocks: { providerObservedAt: snapshot.providerPublishedAt, providerPublishedAt: snapshot.providerPublishedAt, providerModifiedAt: null, retrievedAt: snapshot.vigiaReceivedAt, availableToVigiaAt: snapshot.vigiaReceivedAt, canonicalIngestedAt: snapshot.vigiaReceivedAt, projectionUpdatedAt: snapshot.vigiaReceivedAt, chronologyBasis: providerId === 'bc-wildfire-service' ? 'LEGACY_EXPLICIT_PROVIDER_FIELD' : 'LEGACY_RETRIEVAL_FALLBACK' },
      rights: { licenceId: providerId === 'alberta-wildfire' ? 'OGL-ALBERTA' : 'OGL-BC', permitScientificRetention: true }, geometryQuality: { valid: normalized.valid, reason: normalized.reason, quality: normalized.quality }, importedFromBaseline: true
    };
    appendRevision(state, feature, 'INITIAL_BASELINE', { importedFromBaseline: true }); const provider = state.providers[providerId] ?? { currentFeatures: {}, health: 'UNKNOWN', recoveries: 0, failures: 0 }; provider.currentFeatures[keyOf(feature)] = feature; state.providers[providerId] = provider;
  }
  state.baselineReference = { fingerprint: archive.fingerprint, immutableSnapshots: archive.immutableSnapshots, uniqueProviderPublications: archive.uniqueProviderPublications, importedLatestStates: latest.size, priorSnapshotsRewritten: archive.priorSnapshotsRewritten };
  return state;
}

export function ingestProviderCapture(state, provider, capture, at) {
  state.cursors ??= {}; state.providerPublications ??= [];
  const started = performance.now(), priorProvider = state.providers[provider.id] ?? { currentFeatures: {}, health: 'UNKNOWN', recoveries: 0, failures: 0 }, priorHealth = priorProvider.health, currentKeys = new Set(), touched = [], addedRevisions = [], observations = [], revisionClassificationMs = [], publication = capture.publicationFingerprint;
  for (const feature of capture.features) {
    const key = keyOf(feature), legacyEntry = Object.entries(priorProvider.currentFeatures).find(([, item]) => item.importedFromBaseline && item.incidentId === feature.incidentId), prior = priorProvider.currentFeatures[key] ?? legacyEntry?.[1] ?? null, hints = { providerChangeReason: feature.metadata?.providerChangeReason, mergeOf: feature.metadata?.mergeOf, splitFrom: feature.metadata?.splitFrom }; if (legacyEntry && legacyEntry[0] !== key) delete priorProvider.currentFeatures[legacyEntry[0]]; currentKeys.add(key); let snapshotClass = classifySnapshot(prior, feature, { providerPublicationChanged: publication !== priorProvider.lastPublicationFingerprint }); if (snapshotClass !== 'GEOMETRY_CHANGED' && /correct|revis|adjust/i.test(String(hints.providerChangeReason ?? ''))) snapshotClass = 'CORRECTION_RECEIVED';
    const observationCore = { schemaVersion: 'vigia.authoritative-poll-observation.v1', providerId: provider.id, incidentId: feature.incidentId, providerFeatureId: feature.providerFeatureId, observedAt: at, rawObjectId: feature.rawObjectId, featureFingerprint: feature.featureFingerprint, normalizedGeometryHash: feature.normalizedGeometryHash, snapshotClass, providerPublicationFingerprint: publication, sourceHealth: 'LIVE' };
    observations.push({ ...observationCore, observationId: fingerprint('authoritative-poll-observation', observationCore) });
    if (!prior) { const revision = appendRevision(state, feature, 'INITIAL_PROVIDER_STATE', { acceptedForLabel: false, reason: 'FIRST_STATE_IN_NETWORK' }); addedRevisions.push(revision); touched.push(feature.incidentId); }
    else if (snapshotClass === 'GEOMETRY_CHANGED' || snapshotClass === 'SCHEMA_CHANGED') { const classificationStarted = performance.now(), verdict = classifyRevision(prior, feature, hints); revisionClassificationMs.push(Number((performance.now() - classificationStarted).toFixed(3))); const revision = appendRevision(state, feature, verdict.classification, { acceptedForLabel: verdict.acceptedForLabel, reason: verdict.reason, diagnostics: verdict.diagnostics }); addedRevisions.push(revision); touched.push(feature.incidentId); }
    priorProvider.currentFeatures[key] = compactCurrentFeature(feature);
  }
  const nextHealth = capture.complete ? 'LIVE' : 'DEGRADED'; if (priorHealth !== nextHealth) { const healthCore = { schemaVersion: 'vigia.authoritative-poll-observation.v1', providerId: provider.id, incidentId: null, providerFeatureId: null, observedAt: at, rawObjectId: null, featureFingerprint: null, normalizedGeometryHash: null, snapshotClass: 'SOURCE_HEALTH_CHANGED', providerPublicationFingerprint: publication, sourceHealth: nextHealth, priorSourceHealth: priorHealth }; observations.push({ ...healthCore, observationId: fingerprint('authoritative-poll-observation', healthCore) }); }
  if (capture.complete && !capture.filtered) for (const [key, prior] of Object.entries(priorProvider.currentFeatures)) if (!currentKeys.has(key) && prior.providerId === provider.id) {
    const feature = removedRevision(prior, at), verdict = classifyRevision(prior, feature, { removed: true }), revision = appendRevision(state, feature, verdict.classification, { acceptedForLabel: false, reason: verdict.reason }); addedRevisions.push(revision); touched.push(prior.incidentId); delete priorProvider.currentFeatures[key];
    const observationCore = { schemaVersion: 'vigia.authoritative-poll-observation.v1', providerId: provider.id, incidentId: prior.incidentId, providerFeatureId: prior.providerFeatureId, observedAt: at, rawObjectId: null, featureFingerprint: prior.featureFingerprint, normalizedGeometryHash: null, snapshotClass: 'INCIDENT_REMOVED', providerPublicationFingerprint: publication, sourceHealth: 'LIVE' }; observations.push({ ...observationCore, observationId: fingerprint('authoritative-poll-observation', observationCore) });
  }
  priorProvider.health = nextHealth; priorProvider.recoveries += Number(['UNAVAILABLE', 'DEGRADED'].includes(priorHealth) && capture.complete); priorProvider.failures += Number(!capture.complete); priorProvider.lastCompletedAt = at; priorProvider.lastPublicationFingerprint = publication; priorProvider.lastRawObjectIds = capture.rawObjects.map((item) => item.id); priorProvider.lastRecords = capture.features.length; priorProvider.lastCycleLatencyMs = capture.latencyMs; state.providers[provider.id] = priorProvider;
  const publicationCore = { schemaVersion: 'vigia.provider-publication.v1', providerId: provider.id, publicationFingerprint: publication, firstRetrievedAt: at, rawObjectIds: capture.rawObjects.map((item) => item.id), recordCount: capture.features.length, complete: capture.complete, authorityClasses: unique(capture.rawObjects.map((item) => item.authorityClass)) }; if (!state.providerPublications.some((item) => item.providerId === provider.id && item.publicationFingerprint === publication)) state.providerPublications.push({ ...publicationCore, publicationId: fingerprint('provider-publication', publicationCore) });
  state.cursors[provider.id] = { schemaVersion: 'vigia.provider-cursor.v1', providerId: provider.id, pollCount: Number(state.cursors[provider.id]?.pollCount ?? 0) + 1, lastCompletedAt: at, lastPublicationFingerprint: publication, lastRawObjectIds: capture.rawObjects.map((item) => item.id), consecutiveFailures: capture.complete ? 0 : Number(state.cursors[provider.id]?.consecutiveFailures ?? 0) + 1, circuitState: capture.complete ? 'CLOSED' : Number(state.cursors[provider.id]?.consecutiveFailures ?? 0) + 1 >= 3 ? 'OPEN' : 'CLOSED', nextPollAt: new Date(Date.parse(at) + provider.cadenceSeconds * 1_000).toISOString() };
  state.pollObservations.push(...observations); state.rawObjects = [...new Map([...state.rawObjects, ...capture.rawObjects].map((item) => [item.id, item])).values()]; state.metrics.providerRequests += capture.rawObjects.length; state.metrics.bytesDownloaded += capture.rawObjects.reduce((sum, item) => sum + item.byteLength, 0); state.metrics.uniqueBytesStored += capture.rawObjects.filter((item) => !item.duplicate).reduce((sum, item) => sum + item.byteLength, 0); state.metrics.rawDuplicates += capture.rawObjects.filter((item) => item.duplicate).length; state.metrics.providerFailures += Number(!capture.complete);
  return { touchedIncidentIds: unique(touched), revisions: addedRevisions, observations, revisionClassificationMs, durationMs: Number((performance.now() - started).toFixed(3)) };
}

export function recordProviderUnavailable(state, provider, error, at) {
  const prior = state.providers[provider.id] ?? { currentFeatures: {}, health: 'UNKNOWN', recoveries: 0, failures: 0 }, observationCore = { schemaVersion: 'vigia.authoritative-poll-observation.v1', providerId: provider.id, incidentId: null, providerFeatureId: null, observedAt: at, rawObjectId: null, featureFingerprint: null, normalizedGeometryHash: null, snapshotClass: 'PROVIDER_UNAVAILABLE', providerPublicationFingerprint: null, sourceHealth: 'UNAVAILABLE', error: String(error.message ?? error) };
  prior.health = 'UNAVAILABLE'; prior.failures += 1; prior.lastFailureAt = at; prior.lastError = String(error.message ?? error); state.providers[provider.id] = prior; state.pollObservations.push({ ...observationCore, observationId: fingerprint('authoritative-poll-observation', observationCore) }); state.metrics.providerFailures += 1; const failures = Number(state.cursors?.[provider.id]?.consecutiveFailures ?? 0) + 1, backoffMs = Math.min(provider.cadenceSeconds * 1_000, 1_000 * (2 ** Math.min(failures, 8))); state.cursors ??= {}; state.cursors[provider.id] = { ...(state.cursors[provider.id] ?? { schemaVersion: 'vigia.provider-cursor.v1', providerId: provider.id, pollCount: 0 }), consecutiveFailures: failures, circuitState: failures >= 3 ? 'OPEN' : 'CLOSED', lastFailureAt: at, nextPollAt: new Date(Date.parse(at) + backoffMs).toISOString() };
}

export function materializeSequences(state) {
  const revisions = new Map(state.revisions.map((item) => [item.revisionId, item]));
  return Object.values(state.sequences).map((sequence) => { const ordered = canonicalRevisionOrder(sequence.revisionIds.map((id) => revisions.get(id)).filter(Boolean)); return { ...sequence, revisionIds: ordered.map((item) => item.revisionId), revisions: ordered.map((item, index) => ({ ...item, priorRevisionId: ordered[index - 1]?.revisionId ?? null, nextRevisionId: ordered[index + 1]?.revisionId ?? null })) }; }).sort((a, b) => a.incidentId.localeCompare(b.incidentId));
}

export function canonicalRevisionOrder(revisions) { return [...revisions].sort((left, right) => Date.parse(left.clocks?.availableToVigiaAt) - Date.parse(right.clocks?.availableToVigiaAt) || Date.parse(left.clocks?.providerPublishedAt ?? 0) - Date.parse(right.clocks?.providerPublishedAt ?? 0) || left.revisionId.localeCompare(right.revisionId)); }

export function selectWatchedIncidents(state, { allActive = false, incident = null, region = null, at = new Date().toISOString() } = {}) {
  const features = Object.values(state.providers).flatMap((item) => Object.values(item.currentFeatures ?? {})), limit = Date.parse(at) - 45 * 86_400_000, activeWords = /out of control|being held|under control|fire of note|assistance started|approved/i;
  const ranked = features.filter((item) => (!incident || item.incidentId.includes(incident)) && (!region || item.region === region)).map((item) => {
    const recent = Math.max(nowMs(item.clocks.providerPublishedAt), nowMs(item.clocks.providerModifiedAt), nowMs(item.clocks.providerObservedAt)) >= limit, active = activeWords.test(item.status ?? ''), vector = { activeOfficialIncident: Number(active), existingPerimeter: 1, recentProviderPublication: Number(recent), physicalObservationSupport: 0, likelyOngoingGrowth: Number(active), weatherAvailability: Number(item.region.startsWith('CA-')), fuelTerrainAvailability: Number(item.region.startsWith('CA-')), assetContextAvailability: 0, sourceCoverage: 1, laterLabelPotential: Number(active || recent), rightsReadiness: Number(item.rights?.permitScientificRetention === true) }, score = Object.values(vector).reduce((sum, value) => sum + value, 0);
    return { incidentId: item.incidentId, providerId: item.providerId, region: item.region, status: item.status, vector, score, selectedWithoutForecastPerformance: true, eligible: active || recent };
  }).filter((item) => allActive ? item.eligible : true).sort((a, b) => b.score - a.score || a.incidentId.localeCompare(b.incidentId));
  state.selectedIncidents = ranked; return ranked;
}

export function detectSourceConflicts(state, at) {
  const current = Object.values(state.providers).flatMap((item) => Object.values(item.currentFeatures ?? {})), groups = new Map();
  for (const item of current) { const key = `${item.jurisdiction}:${item.providerIncidentId ?? item.incidentId.split(':').at(-1)}`, rows = groups.get(key) ?? []; rows.push(item); groups.set(key, rows); }
  const conflicts = [];
  for (const [key, rows] of groups) if (new Set(rows.map((item) => item.providerId)).size > 1 && new Set(rows.map((item) => item.normalizedGeometryHash)).size > 1) {
    const local = rows.find((item) => item.providerId !== 'cwfis-nrcan'), core = { schemaVersion: 'vigia.source-conflict.v1', conflictKey: key, objects: rows.map((item) => ({ providerId: item.providerId, incidentId: item.incidentId, authorityClass: item.authorityClass, geometryHash: item.normalizedGeometryHash, clocks: item.clocks, sourceHealth: state.providers[item.providerId]?.health })), authorityClasses: unique(rows.map((item) => item.authorityClass)), geometryComparison: 'DIFFERENT_NORMALIZED_GEOMETRY', timeComparison: rows.map((item) => item.clocks.providerPublishedAt), providerHealth: Object.fromEntries(rows.map((item) => [item.providerId, state.providers[item.providerId]?.health])), currentDoctrine: 'JURISDICTIONAL_PROVIDER_PRECEDES_NATIONAL_REFERENCE_WITHIN_SCOPE', resolutionState: local ? 'RESOLVED_BY_JURISDICTION_SCOPE' : 'ABSTAIN_UNRESOLVED', operatorImpact: local ? 'PRESERVE_REFERENCE_DIFFERENCE' : 'OPERATOR_ATTENTION_REQUIRED', detectedAt: at };
    conflicts.push({ ...core, conflictId: fingerprint('source-conflict', core) });
  }
  state.conflicts = [...new Map([...state.conflicts, ...conflicts].map((item) => [item.conflictId, item])).values()]; return conflicts;
}

export function revisionIsAdmitted(state, revisionId) { return !(state.revisionAdjudications ?? []).some((item) => item.revisionId === revisionId && item.adjudication.startsWith('EXCLUDE_')); }
