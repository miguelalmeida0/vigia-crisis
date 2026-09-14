import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {AT, approvedSourceRecords, controlledSituation} from './collection-intelligence-fixture.mjs';
import {Router} from '../src/http/router.mjs';
import {policyForRoute} from '../src/http/route-security-policy.mjs';
import {CollectionIntelligenceService} from '../src/modules/intelligence/collection-intelligence-service.mjs';
import {COLLECTION_TOOLS, collectionMapIntents, collectionToolHandlers, registerCollectionIntelligenceRoutes} from '../src/modules/intelligence/collection-intelligence-routes.mjs';
import {SituationAsk} from '../src/modules/intelligence/situation-ask.mjs';

const actor = {id: 'operator:test', role: 'administrator', incidentScopes: ['controlled-incident'], authentication: {authenticated: true, mode: 'local_shadow_session'}};
const anonymous = {id: null, role: 'anonymous', incidentScopes: [], authentication: {authenticated: false}};

function harness({snapshots = null, sources = approvedSourceRecords()} = {}) {
  const current = snapshots?.current ?? controlledSituation();
  const historical = snapshots?.historical ?? null;
  const writes = {count: 0};
  const situationService = {
    clock: () => new Date(AT),
    async snapshot(incidentId, at = null) {
      if (incidentId !== 'controlled-incident') return {state: 'HISTORY_UNAVAILABLE', snapshot: null, reason: 'Not available for this time.'};
      const snapshot = at && historical ? historical : current;
      return {state: 'AVAILABLE', mode: at ? 'HISTORICAL' : 'CURRENT_RETAINED', knownAt: snapshot.knownAt, snapshot};
    },
    // Any call to a mutating situation entry point is a contract violation here.
    observe() { writes.count += 1; },
    async flush() { writes.count += 1; },
    async rebuild() { writes.count += 1; }
  };
  const knowledgeService = {sourceCache: new Map(sources.map((source) => [source.id, source])), cache: new Map()};
  const service = new CollectionIntelligenceService({situationService, knowledgeService, clock: () => new Date(AT)});
  const services = {situationService, situationAsk: new SituationAsk(situationService), worldKnowledgeService: knowledgeService, collectionIntelligenceService: service};
  const router = new Router();
  registerCollectionIntelligenceRoutes(router, services);
  return {router, service, services, writes, current};
}

const response = () => ({statusCode: null, body: '', headers: {}, writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; }, end(value = '') { this.body += value; }});

async function request(router, path, requestActor = actor) {
  const req = Readable.from([]);
  Object.assign(req, {method: 'GET', url: path, headers: {host: '127.0.0.1'}, socket: {remoteAddress: '127.0.0.1'}});
  const res = response();
  await router.safeHandle(req, res, {actor: requestActor});
  return {status: res.statusCode, body: res.body ? JSON.parse(res.body) : null};
}

const base = '/api/v10/operator/incidents/controlled-incident/collection';

// --- Read behaviour ---------------------------------------------------------

test('requirements are served with their lifecycle, source tasking and read-only markers', async () => {
  const {router, writes} = harness();
  const {status, body} = await request(router, `${base}/requirements`);
  assert.equal(status, 200);
  assert.ok(body.requirements.length > 0);
  assert.equal(body.readOnly, true);
  assert.equal(body.externalFetches, 0);
  assert.equal(body.operationalWrites, 0);
  assert.ok(body.requirements.every((row) => row.sourceTasking));
  assert.equal(body.lifecycle.open, body.requirements.length);
  assert.equal(writes.count, 0, 'a read must not touch any situation write path');
});

test('tasks are served ranked with their factors and reasons', async () => {
  const {router} = harness();
  const {status, body} = await request(router, `${base}/tasks?limit=3`);
  assert.equal(status, 200);
  assert.equal(body.tasks.length, 3);
  assert.deepEqual(body.tasks.map((task) => task.rank), [1, 2, 3]);
  assert.ok(body.tasks.every((task) => task.reasons.length && task.factors));
  assert.equal(body.orderingMethod, 'EXPLICIT_LEXICOGRAPHIC_FACTORS');
});

test('one requirement is served with its explanation and the preview it supports', async () => {
  const {router} = harness();
  const list = await request(router, `${base}/requirements`);
  const target = list.body.requirements.find((row) => row.subject.id === 'h-x');
  const {status, body} = await request(router, `${base}/requirements/${encodeURIComponent(target.id)}`);
  assert.equal(status, 200);
  assert.equal(body.requirement.id, target.id);
  assert.ok(body.explanation.facts.length > 0);
  assert.deepEqual(body.availablePreview, {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'h-x', capability: 'emergencyDepartment'});
  assert.equal((await request(router, `${base}/requirements/requirement%3Amissing`)).status, 404);
});

test('requirement sources are served from the registered approved set', async () => {
  const {router} = harness();
  const list = await request(router, `${base}/requirements`);
  const target = list.body.requirements.find((row) => row.subject.id === 'h-x');
  const {status, body} = await request(router, `${base}/requirements/${encodeURIComponent(target.id)}/sources`);
  assert.equal(status, 200);
  assert.equal(body.state, 'REGISTERED_SOURCE_AVAILABLE');
  assert.ok(body.sources.every((source) => source.cost === 'FREE_APPROVED_PUBLIC_SOURCE'));
  assert.ok(body.sources.every((source) => new URL(source.url).protocol === 'https:'));
});

test('a preview is a read that writes nothing and never leaves the snapshot changed', async () => {
  const {router, current, writes} = harness();
  const fingerprint = JSON.stringify(current);
  const {status, body} = await request(router, `${base}/preview?kind=FACILITY_CAPABILITY_CONFIRMED&entityId=h-x&capability=emergencyDepartment`);
  assert.equal(status, 200);
  assert.equal(body.operationalWrites, 0);
  assert.equal(body.observed, false);
  assert.match(body.label, /NOT OBSERVED REALITY/);
  assert.equal(body.branches.confirmed.primary.facilityId, 'h-x');
  assert.equal(JSON.stringify(current), fingerprint);
  assert.equal(writes.count, 0);
});

test('a rejected preview is a 400 and is counted, not silently approximated', async () => {
  const {router, service} = harness();
  assert.equal((await request(router, `${base}/preview?kind=FACILITY_CAPABILITY_CONFIRMED&entityId=nope&capability=emergencyDepartment`)).status, 400);
  assert.equal(service.metrics.previewRejections, 1);
});

test('knowledge changes are served over a bounded window and reject an inverted one', async () => {
  const {router} = harness({snapshots: {current: controlledSituation({confirmHospitalX: true}), historical: controlledSituation()}});
  const {status, body} = await request(router, `${base}/knowledge-changes?since=2026-09-13T09:00:00.000Z`);
  assert.equal(status, 200);
  assert.ok(body.learnedCount >= 1);
  assert.ok(body.learned.some((event) => event.subject.id === 'h-x' && event.classification.origin === 'VIGIA_LEARNED'));
  assert.equal((await request(router, `${base}/knowledge-changes?since=2099-01-01T00:00:00.000Z`)).status, 400);
});

test('an incident with no retained snapshot returns an explicit unavailable state, not an empty success', async () => {
  const {router} = harness();
  const {status, body} = await request(router, '/api/v10/operator/incidents/controlled-incident/collection/requirements');
  assert.equal(status, 200);
  assert.ok(body.requirements.length);
  const outsider = {...actor, incidentScopes: ['missing-incident']};
  const missing = await request(router, '/api/v10/operator/incidents/missing-incident/collection/requirements', outsider);
  assert.equal(missing.status, 200);
  assert.equal(missing.body.state, 'HISTORY_UNAVAILABLE');
  assert.deepEqual(missing.body.requirements, []);
});

// --- Historical safety ------------------------------------------------------

test('a historical read never mutates the current requirement lifecycle', async () => {
  const {router, service} = harness({snapshots: {current: controlledSituation(), historical: controlledSituation({confirmHospitalX: true})}});
  await request(router, `${base}/requirements`);
  const before = JSON.stringify((await request(router, `${base}/requirements`)).body.lifecycle);
  const historical = await request(router, `${base}/requirements?at=2026-09-13T09:00:00.000Z`);
  assert.equal(historical.status, 200);
  assert.deepEqual(historical.body.lifecycle.events, [], 'replaying history must not emit lifecycle transitions');
  const after = JSON.stringify((await request(router, `${base}/requirements`)).body.lifecycle);
  assert.equal(after, before);
  assert.ok(service.metrics.requirementReads > 0);
});

// --- Tool surface -----------------------------------------------------------

test('the read-only tool surface exposes exactly the six named tools', () => {
  assert.deepEqual([...COLLECTION_TOOLS].sort(), ['getInformationRequirement', 'getInformationRequirements', 'getKnowledgeChanges', 'getNextVerificationTasks', 'getRequirementSources', 'previewKnowledgeImpact'].sort());
  const {service} = harness();
  const handlers = collectionToolHandlers(service);
  assert.deepEqual(Object.keys(handlers).sort(), [...COLLECTION_TOOLS].sort());
});

test('tool handlers return the same bounded results as the routes', async () => {
  const {service} = harness();
  const handlers = collectionToolHandlers(service);
  const requirements = await handlers.getInformationRequirements('controlled-incident', {});
  assert.ok(requirements.requirements.length > 0);
  const tasks = await handlers.getNextVerificationTasks('controlled-incident', {});
  assert.equal(tasks.orderingMethod, 'EXPLICIT_LEXICOGRAPHIC_FACTORS');
  const preview = await handlers.previewKnowledgeImpact('controlled-incident', {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'h-x', capability: 'emergencyDepartment'});
  assert.equal(preview.operationalWrites, 0);
});

test('map intents from a preview are validated and bounded, and no renderer is touched', async () => {
  const {service} = harness();
  const preview = await service.preview('controlled-incident', {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'h-x', capability: 'emergencyDepartment'});
  const intents = collectionMapIntents('previewKnowledgeImpact', {}, preview);
  assert.deepEqual(intents, [{type: 'SHOW_COVERAGE', category: 'emergency_hospital', validated: true}]);
  assert.deepEqual(collectionMapIntents('getInformationRequirements', {}, {}), []);
});

// --- Performance ------------------------------------------------------------

test('requirements, tasking and one preview stay well inside an interactive read budget', async () => {
  const {router, service} = harness();
  const measure = async (work) => { const started = process.hrtime.bigint(); await work(); return Number(process.hrtime.bigint() - started) / 1e6; };
  const cold = await measure(() => request(router, `${base}/requirements`));
  const tasking = await measure(() => request(router, `${base}/tasks`));
  const preview = await measure(() => request(router, `${base}/preview?kind=FACILITY_CAPABILITY_CONFIRMED&entityId=h-x&capability=emergencyDepartment`));
  for (const [name, value] of [['requirements', cold], ['tasking', tasking], ['preview', preview]]) {
    assert.ok(value < 1000, `${name} took ${value.toFixed(1)} ms, which is outside an interactive read budget`);
  }
  assert.ok(service.metrics.cacheHits >= 0);
});
