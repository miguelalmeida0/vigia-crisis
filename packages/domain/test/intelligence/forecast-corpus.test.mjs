import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessCorpusReadiness, assignCorpusSplits, auditCorpusLeakage, buildForecastExamples,
  buildIncidentCrosswalk, createCorpusAcquisitionManifest, createCorpusNegativeOpportunity,
  createCorpusReplayRecord, createKnowledgeTimeRecord, createThermalAnomalyRegistry,
  validateCorpusGeometry, validateHistoricalContextPack, validateWeatherRun, verifyCorpusReplay,
} from '../../src/forecast-corpus/index.mjs';

const square = (x = -112, y = 36) => ({ type: 'Polygon', coordinates: [[[x, y], [x + .01, y], [x + .01, y + .01], [x, y + .01], [x, y]]] });
const clocks = (observedAt, availableToVigiaAt) => createKnowledgeTimeRecord({ physicalOccurredAt: observedAt, observedAt, providerPublishedAt: null, providerModifiedAt: null, retrievedAt: '2026-08-24T00:00:00Z', availableToVigiaAt, canonicalIngestedAt: '2026-08-24T00:00:01Z', labelPublishedAt: availableToVigiaAt, arrivalTimeBasis: 'DOCUMENTED_LATENCY_MODEL', arrivalModelVersion: 'wfigs-15m-v1' });

test('acquisition manifest is bounded, deterministic, and tamper evident', () => {
  const input = { from: '2025-07-01T00:00:00Z', to: '2025-07-10T00:00:00Z', regions: [{ id: 'western-us', jurisdiction: 'US', bbox: [-125, 31, -102, 49], estimatedAreaKm2: 1_900_000 }], providers: ['nifc-wfigs-daily'], seasons: ['2025'], products: ['daily-perimeters'], incidentSelectionRules: { incidentIds: ['A'] }, budgets: { maxIncidents: 2, maxDays: 10, maxRegionAreaKm2: 2_000_000, maxProviderObjects: 20, maxBytes: 20_000_000, maxConcurrency: 2, maxRuntimeSeconds: 60, maxRetries: 2, maxLocalStorageBytes: 100_000_000 }, storageTarget: 'data/runtime/forecast-corpus', licences: ['NIFC-OPEN-DATA'], expectedOutputs: ['bronze', 'silver'], codeVersion: '1.0.0' };
  assert.equal(createCorpusAcquisitionManifest(input).integrity.fingerprint, createCorpusAcquisitionManifest(input).integrity.fingerprint);
  assert.throws(() => createCorpusAcquisitionManifest({ ...input, budgets: { ...input.budgets, maxConcurrency: 5 } }), /budget_invalid/);
});

test('knowledge-time, geometry, weather, and context QA fail closed', () => {
  const clock = clocks('2025-07-05T10:00:00Z', '2025-07-05T10:15:00Z');
  assert.equal(clock.arrivalTimeBasis, 'DOCUMENTED_LATENCY_MODEL');
  assert.equal(validateCorpusGeometry({ geometry: square() }).passed, true);
  assert.equal(validateCorpusGeometry({ geometry: { type: 'Polygon', coordinates: [[[200, 1], [201, 1], [200, 1]]] } }).passed, false);
  const weather = { model: 'HRRR', runId: '20250705T09Z', member: 'det', runType: 'DETERMINISTIC_FORECAST', issueTime: '2025-07-05T09:00:00Z', grid: { id: 'conus', resolution: '3 km' }, coverage: { bbox: [-135, 20, -55, 55] }, fields: ['wind_u_10m', 'wind_v_10m', 'temperature_2m', 'relative_humidity_2m'].map((variable) => ({ variable, forecastStepHours: 1, validTime: '2025-07-05T10:00:00Z', level: 'surface', units: 'native', contentHash: `sha256:${variable}` })), valuesDecoded: false, missingValues: null };
  assert.match(validateWeatherRun(weather, { informationCutoff: '2025-07-05T09:30:00Z', domainBbox: [-113, 35, -112, 36] }).failures.join(','), /NOT_DECODED/);
  const pack = { kind: 'TERRAIN', datasetId: 'landfire', version: '2.0.0', referenceDate: '2020-01-01T00:00:00Z', availableToVigiaAt: '2021-12-31T00:00:00Z', resolution: '30m', licenceId: 'US-PUBLIC', transformation: 'export', coverage: { bbox: [-113, 35, -112, 36] }, layers: ['elevation', 'slope'].map((name) => ({ name, contentHash: `sha256:${name}`, bytes: 2, nodataPolicy: 'preserve', units: 'native' })) };
  assert.match(validateHistoricalContextPack(pack, { incidentDate: '2025-01-01T00:00:00Z', domainBbox: [-113, 35, -112, 36] }).failures.join(','), /aspect/);
});

test('crosswalk preserves ambiguity instead of force-merging', () => {
  const rows = [
    { recordId: 'a', providerId: 'WFIGS', discoveryTime: '2025-01-01T00:00:00Z', coordinate: [-112, 36], identifiers: { wfigs: 'one' } },
    { recordId: 'b', providerId: 'FEDS', discoveryTime: '2025-01-10T01:00:00Z', coordinate: [-110, 36], identifiers: { feds: 'two' } },
    { recordId: 'c', providerId: 'FIRMS', discoveryTime: '2025-01-01T01:00:00Z', coordinate: [-112, 36], identifiers: { links: ['one', 'two'] } },
  ];
  const result = buildIncidentCrosswalk(rows);
  assert.equal(result.incidents.length, 2);
  assert.equal(result.ambiguous.length, 1);
});

test('negative controls require opportunity, health, official and physical checks', () => {
  const base = { id: 'neg-1', region: 'western-us', season: '2025', window: { from: '2025-01-01T00:00:00Z', to: '2025-01-01T01:00:00Z' }, geometry: square(), outcome: 'WILDFIRE_NEGATIVE', category: 'INDUSTRIAL_HEAT', hardNegative: true, sourceOpportunityIds: ['swath'], officialCheckIds: ['wfigs'], physicalCheckIds: ['viirs'], prescribedFireState: 'EXCLUDED', invalidationConditions: ['later official incident'], checks: { sourceCoverage: true, providerHealthy: true, observationOpportunity: true, qualityAdequate: true, officialIncidentChecked: true, physicalFireChecked: true } };
  assert.equal(createCorpusNegativeOpportunity(base).classification, 'VALID_NEGATIVE');
  assert.equal(createCorpusNegativeOpportunity({ ...base, id: 'neg-2', checks: { ...base.checks, providerHealthy: false } }).classification, 'EXCLUDED_CONTROL');
  assert.equal(createThermalAnomalyRegistry([{ id: 'site', geometry: square(), category: 'INDUSTRIAL', source: 'review', observationIds: ['o'], evidenceIds: ['e'], effectiveFrom: '2020-01-01T00:00:00Z', qualityClass: 'REVIEWED', reviewState: 'ACCEPTED', licenceId: 'ODBL' }]).entries.length, 1);
});

test('split and leakage audits isolate incidents, pixels, revisions, and causal families', () => {
  const base = { id: 'x', incidentId: 'fire', region: 'western-us', season: '2025', informationCutoff: '2025-07-05T10:00:00Z', features: [], weatherRuns: [], upstreamObservationIds: ['obs'], physicalPixelIds: ['pixel'], providerRepublicationIds: ['rep'], geometryDuplicateGroupIds: ['geo'], persistentAnomalySiteIds: ['site'] };
  const split = assignCorpusSplits([base, { ...base, id: 'y' }], { geographicStressRegion: 'portugal', seasonalStressSeason: '2024' });
  assert.equal(new Set(split.cases.map((row) => row.split)).size, 1);
  const leaked = [{ ...base, split: 'development', causalFamilies: ['VIIRS', 'FEDS_AS_INDEPENDENT'] }, { ...base, id: 'y', incidentId: 'other', split: 'held-out-test' }];
  assert.match(auditCorpusLeakage(leaked).violations.map((row) => row.code).join(','), /PHYSICAL_PIXEL_SPLIT_LEAKAGE/);
  assert.match(auditCorpusLeakage(leaked).violations.map((row) => row.code).join(','), /FEDS_INFLATES_VIIRS/);
});

test('knowledge-time leakage audit rejects every prohibited hindsight path', () => {
  const cutoff = '2025-07-05T10:00:00Z', base = { id: 'a', incidentId: 'same-fire', split: 'development', region: 'western-us', season: '2025', informationCutoff: cutoff, issueRevision: 2, operationalMode: 'NRT', upstreamObservationIds: ['same-observation'], physicalPixelIds: ['same-pixel'], features: [
    { id: 'future-final', kind: 'FINAL_PERIMETER', availableToVigiaAt: '2025-07-05T11:00:00Z', revision: 3 },
    { id: 'mtbs', kind: 'RETROSPECTIVE_MTBS', availableToVigiaAt: cutoff },
    { id: 'final-stat', kind: 'FINAL_BURNED_AREA_STATISTIC', availableToVigiaAt: cutoff },
    { id: 'asset-outcome', kind: 'FUTURE_ASSET_OUTCOME', availableToVigiaAt: cutoff },
    { id: 'revised', kind: 'PHYSICAL_OBSERVATION', processingMode: 'STANDARD', availableToVigiaAt: cutoff },
    { id: 'wrong-clock', kind: 'ISSUE_TIME_PERIMETER', observationTimeBasis: 'PROVIDER_MODIFIED', availableToVigiaAt: cutoff },
  ], weatherRuns: [{ runId: 'future-run', issueTime: '2025-07-05T11:00:00Z', availableToVigiaAt: '2025-07-05T12:00:00Z', runType: 'RETROSPECTIVE_REANALYSIS' }], causalFamilies: ['VIIRS', 'FEDS_AS_INDEPENDENT'], assetContext: { absenceMeansZero: true } };
  const second = { ...base, id: 'b', split: 'held-out-test', features: [], weatherRuns: [], causalFamilies: [] };
  const negatives = [
    { id: 'downtime', classification: 'VALID_NEGATIVE', outcome: 'WILDFIRE_NEGATIVE', prescribedFireState: 'EXCLUDED', checks: { providerHealthy: false, observationOpportunity: true } },
    { id: 'empty', classification: 'VALID_NEGATIVE', outcome: 'WILDFIRE_NEGATIVE', prescribedFireState: 'EXCLUDED', checks: { providerHealthy: true, observationOpportunity: false } },
    { id: 'prescribed', classification: 'EXCLUDED_CONTROL', outcome: 'WILDFIRE_NEGATIVE', prescribedFireState: 'CONFIRMED', checks: {} },
  ];
  const codes = new Set(auditCorpusLeakage([base, second], negatives).violations.map((item) => item.code));
  for (const code of ['FUTURE_INFORMATION_LEAKAGE', 'RETROSPECTIVE_LABEL_AS_FEATURE', 'LATER_PERIMETER_REVISION_LEAKED_BACKWARD', 'REVISED_SCIENCE_PRODUCT_IN_NRT', 'PROVIDER_MODIFICATION_AS_OBSERVATION', 'FUTURE_WEATHER_RUN', 'FUTURE_WEATHER_AVAILABILITY', 'NON_OPERATIONAL_WEATHER_FEATURE', 'INCIDENT_SPLIT_LEAKAGE', 'UPSTREAM_OBSERVATION_SPLIT_LEAKAGE', 'PHYSICAL_PIXEL_SPLIT_LEAKAGE', 'FEDS_INFLATES_VIIRS', 'PROVIDER_DOWNTIME_AS_NEGATIVE', 'EMPTY_RESPONSE_AS_NEGATIVE', 'PRESCRIBED_FIRE_AS_NO_FIRE', 'MISSING_ASSET_BECOMES_ZERO']) assert.ok(codes.has(code), code);
  const currentFuel = { kind: 'FUEL', datasetId: 'future', version: '2026', referenceDate: '2026-01-01T00:00:00Z', availableToVigiaAt: '2026-01-01T00:00:00Z', resolution: '30m', licenceId: 'public', transformation: 'none', coverage: { bbox: [-113, 35, -111, 37] }, layers: [] };
  assert.match(validateHistoricalContextPack(currentFuel, { incidentDate: '2025-07-05T00:00:00Z', informationCutoff: cutoff, domainBbox: [-112, 36, -111.9, 36.1] }).failures.join(','), /CURRENT_CONTEXT_REWRITES_HISTORY/);
});

test('example builder rejects incomplete real candidates and replay ignores ordering', () => {
  const states = [0, 1, 2, 4].map((hour, index) => ({ id: `p${index}`, geometry: square(-112 + index * .001), originalGeometryHash: `sha256:${index}`, clocks: clocks(`2025-07-05T${String(10 + hour).padStart(2, '0')}:00:00Z`, `2025-07-05T${String(10 + hour).padStart(2, '0')}:15:00Z`), bronzeRefs: [`raw:${index}`] }));
  const built = buildForecastExamples({ incidents: [{ id: 'fire', region: 'western-us', season: '2025', discoveryTime: '2025-07-05T09:00:00Z', perimeterSourceClass: 'ARCHIVED_OPERATIONAL_SNAPSHOT', perimeterStates: states }] });
  assert.equal(built.examples.length, 0);
  assert.ok(built.rejections.some((row) => row.reasons.includes('NO_ISSUE_TIME_WEATHER')));
  const input = { rawObjectHashes: ['b', 'a'], parserVersions: ['v1'], canonicalSchemaVersions: ['v1'], associationDoctrine: 'strict', knowledgeTimePolicy: 'availability', exampleBuilderVersion: 'v1', splitVersion: 'v1', incidentCrosswalkHash: 'c', eligibleExampleIds: [], rejectedExampleIds: built.rejections.map((row) => row.id), negativeControlIds: [], leakageAuditHash: 'l' };
  const record = createCorpusReplayRecord(input), verification = verifyCorpusReplay(record, { ...input, rawObjectHashes: ['a', 'b'] });
  assert.equal(verification.identical, true);
  const readiness = assessCorpusReadiness({ discoveredIncidents: [{ id: 'fire' }], examples: [], negatives: [], leakageAudit: { passed: true, violations: [] }, rightsAssessment: { allowed: true }, replayVerification: verification });
  assert.equal(readiness.decision, 'CORPUS_NOT_READY');
});
