import test from 'node:test';
import assert from 'node:assert/strict';
import { affectedMaterializations, assessMaterialization, createDataContract, createDataProductVersion, createForecastInputPackage, createHardNegative, createLineageEdge, createLineageNode, createObservationOpportunity, createPipelineTask, createQualityGate, deriveIncidentDataGaps, evaluateDataContract, evaluateQualityGates, explainIncidentAssociation, materializationSignature, planDataGapResolution, propagateRights, recoverPipelineTasks, transitionPipelineTask, upcastDataContractValue, verifyLineageGraph } from '../../src/data-foundry/index.mjs';

const at = '2026-08-24T00:00:00.000Z';
test('data product versions retain bitemporal identity and reject impossible retrieval clocks', () => {
  const input = { id: 'v1', productId: 'p1', semanticVersion: '1.0.0', dataSchemaVersion: 'schema.v1', contentFingerprint: 'sha256:one', provider: 'provider', sourceProduct: 'source', lineageRoot: 'raw:one', clocks: { providerRetrievedAt: at, availableToVigiaAt: at }, parserVersion: 'parser.v1', contractVersion: 'contract.v1', createdAt: at };
  assert.equal(createDataProductVersion(input).clocks.availableToVigiaAt, at);
  assert.throws(() => createDataProductVersion({ ...input, clocks: { providerRetrievedAt: at, availableToVigiaAt: '2026-08-23T00:00:00Z' } }), /available_before_retrieval/);
});

test('contracts quarantine malformed values and distinguish schema, rights, and knowledge failures', () => {
  const contract = createDataContract({ id: 'weather', version: '1', productId: 'weather', requiredFields: ['run.id'], maximumBytes: 100, requiredLicenceIds: ['NOAA'] });
  assert.equal(evaluateDataContract(contract, {}, { availableToVigiaAt: at, lineageRoot: 'raw', licenceIds: ['NOAA'] }).state, 'QUARANTINED');
  assert.equal(evaluateDataContract(contract, { run: { id: 1 } }, { availableToVigiaAt: at, lineageRoot: 'raw', licenceIds: ['NOAA'], schemaVersion: 'v2', expectedSchemaVersion: 'v1' }).state, 'SCHEMA_DRIFT');
  assert.equal(evaluateDataContract(contract, { run: { id: 1 } }, { availableToVigiaAt: at, cutoff: '2026-08-23T00:00:00Z', lineageRoot: 'raw', licenceIds: ['NOAA'] }).state, 'KNOWLEDGE_TIME_INVALID');
  assert.equal(evaluateDataContract(contract, { run: { id: 1 } }, { availableToVigiaAt: at, lineageRoot: 'raw', licenceIds: ['NOAA'], rightsAllowed: false }).state, 'RIGHTS_BLOCKED');
});

test('contracts use explicit deterministic upcaster chains and fail closed on missing evolution steps', () => {
  const result = upcastDataContractValue({ temperature: 20 }, { fromVersion: 'v1', toVersion: 'v3', upcasters: [{ fromVersion: 'v1', toVersion: 'v2', upcast: (value) => ({ ...value, unit: 'degC' }) }, { fromVersion: 'v2', toVersion: 'v3', upcast: (value) => ({ reading: value.temperature, unit: value.unit }) }] });
  assert.deepEqual(result.applied, ['v1->v2', 'v2->v3']); assert.deepEqual(result.value, { reading: 20, unit: 'degC' });
  assert.throws(() => upcastDataContractValue({}, { fromVersion: 'v1', toVersion: 'v2' }), /upcaster_missing/);
});

test('lineage detects cycles, missing objects, rights loss, and hash substitution', () => {
  const a = createLineageNode({ id: 'a', kind: 'RAW', contentHash: 'sha256:a', rights: { derivedRedistribution: false }, createdAt: at }), b = createLineageNode({ id: 'b', kind: 'SILVER', contentHash: 'sha256:b', createdAt: at });
  const edge = (id, source, target, inputHash, outputHash, rightsPropagation = {}) => createLineageEdge({ id, sourceId: source, targetId: target, transformation: 'test', codeVersion: '1', inputHash, outputHash, rightsPropagation, createdAt: at });
  assert.equal(verifyLineageGraph({ nodes: [a, b], edges: [edge('ok', 'a', 'b', 'sha256:a', 'sha256:b')] }).passed, true);
  const broken = verifyLineageGraph({ nodes: [a, b], edges: [edge('one', 'a', 'b', 'wrong', 'sha256:b', { derivedRedistribution: true }), edge('two', 'b', 'a', 'sha256:b', 'sha256:a'), edge('three', 'missing', 'b', 'x', 'sha256:b')] });
  for (const code of ['INPUT_HASH_SUBSTITUTION', 'RIGHTS_LOSS', 'LINEAGE_CYCLE', 'MISSING_UPSTREAM_OBJECT']) assert.ok(broken.failures.some((item) => item.code === code), code);
});

test('critical quality gates cap readiness instead of averaging failures', () => {
  const gates = [createQualityGate({ id: 'rights', version: '1', dimension: 'rights', critical: true }), createQualityGate({ id: 'completeness', version: '1', dimension: 'completeness', critical: false })], result = evaluateQualityGates(gates, { rights: false, completeness: true });
  assert.equal(result.state, 'FAILED'); assert.equal(result.weakestCriticalGate, 'rights');
});

test('gap derivation and planning are deterministic, coverage-aware, rights-aware, and inspectable', () => {
  const incident = { id: 'incident', region: 'western-us', perimeterSourceClass: 'ARCHIVED_OPERATIONAL_SNAPSHOT', perimeterStates: [{}, {}, {}], weatherRuns: [], fuelPack: { layers: [1] }, terrainPack: { layers: [1], verticalDatum: 'NAVD88' }, futureLabels: [] }, gaps = deriveIncidentDataGaps({ incident, horizons: [6] });
  assert.deepEqual(gaps.map((item) => item.requirement), ['DECODED_WEATHER', 'FUTURE_LABEL']);
  const input = { gaps, providerCapabilities: [{ provider: 'noaa-hrrr-archive', requirement: 'DECODED_WEATHER', covered: true, access: 'READY', rights: 'READY', expectedBytes: 1 }], coverage: { 'noaa-hrrr-archive': ['western-us'], 'nifc-wfigs-daily': ['western-us'] }, rights: { 'nifc-wfigs-daily': false }, costBudget: { maxBytes: 100 }, timeBudget: { maxLatencyMs: 100 } }, first = planDataGapResolution(input), second = planDataGapResolution(input);
  assert.deepEqual(first, second); assert.equal(first.actions.find((item) => item.provider === 'noaa-hrrr-archive').eligible, true); assert.equal(first.actions.find((item) => item.provider === 'nifc-wfigs-daily').blocker, 'RIGHTS_BLOCKED');
});

test('pipeline tasks have deterministic identity, valid transitions, retry limits, and crash recovery', () => {
  const input = { definitionId: 'd', operation: 'op', inputFingerprint: 'hash', scope: { incidentId: 'i' }, maxAttempts: 2, createdAt: at }, left = createPipelineTask(input), right = createPipelineTask(input); assert.equal(left.taskId, right.taskId);
  const ready = transitionPipelineTask(left, 'READY', { at }), running = transitionPipelineTask(ready, 'RUNNING', { at }), recovered = recoverPipelineTasks([running], at)[0]; assert.equal(recovered.state, 'RETRYABLE');
  assert.throws(() => transitionPipelineTask(left, 'COMPLETED', { at }), /transition_invalid/);
});

test('materialization signatures invalidate every governed policy change and scope descendants', () => {
  const desired = { inputFingerprints: ['raw'], parserVersion: '1', contractVersion: '1', knowledgeTimePolicy: '1', crosswalkVersion: '1', rightsPolicyVersion: '1', labelDoctrineVersion: '1', qualityGateVersion: '1' }, signature = materializationSignature(desired);
  assert.equal(assessMaterialization({ signature, rightsState: 'ALLOWED', lineageState: 'VALID', qualityState: 'PASSED' }, desired).stale, false);
  assert.equal(assessMaterialization({ signature }, { ...desired, parserVersion: '2' }).stale, true);
  assert.deepEqual(affectedMaterializations(['raw'], [{ sourceId: 'raw', targetId: 'silver' }, { sourceId: 'silver', targetId: 'gold' }, { sourceId: 'other', targetId: 'unrelated' }]), ['gold', 'silver']);
});

test('empty responses and unproven research sites cannot become valid negatives', () => {
  const opportunity = createObservationOpportunity({ id: 'o', sourceId: 's', window: { from: at, to: at }, geometry: { type: 'Point', coordinates: [0, 0] }, outcome: 'OBSERVED_NEGATIVE', coverage: true });
  assert.equal(opportunity.outcome, 'UNKNOWN'); assert.equal(opportunity.validNegative, false);
  assert.equal(createHardNegative({ id: 'h', category: 'industrial', label: 'NO_VALID_OBSERVATION', geometry: {}, effectiveFrom: at, sourceFamily: 'OSM' }).label, 'NO_VALID_OBSERVATION');
});

test('rights manifests block raw content and packages are immutable and fingerprinted', () => {
  const rights = propagateRights([{ id: 'restricted', licenceIds: ['X'], rawRedistribution: false, derivedRedistribution: true }], { includeRaw: true }); assert.equal(rights.allowed, false);
  const pack = createForecastInputPackage({ incidentId: 'i', issueTime: at, knowledgeTimeCutoff: at, horizonHours: 6, rightsManifest: rights }); assert.match(pack.id, /^forecast-input-package:sha256:/); assert.throws(() => { pack.horizonHours = 12; }, TypeError);
});

test('crosswalk v2 never forces a merely spatiotemporal candidate', () => {
  const result = explainIncidentAssociation({ recordId: 'a', providerId: 'WFIGS', discoveryTime: at, coordinate: [-110, 40], identifiers: {} }, { recordId: 'b', providerId: 'FEDS', discoveryTime: at, coordinate: [-110.01, 40], identifiers: {} }); assert.equal(result.decision, 'AMBIGUOUS_SPATIOTEMPORAL_CANDIDATE');
});
