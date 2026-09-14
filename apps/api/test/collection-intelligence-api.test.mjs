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

// --- Route surface and policy ----------------------------------------------

test('every collection route is registered under the authenticated operator namespace', () => {
  const {router} = harness();
  const routes = router.routes();
  assert.equal(routes.length, 6);
  assert.ok(routes.every((route) => route.method === 'GET'), 'the whole surface is read-only');
  assert.ok(routes.every((route) => route.policy.authentication === 'required'));
  assert.ok(routes.every((route) => route.policy.capability === 'read:incident_command'));
  assert.ok(routes.every((route) => route.policy.incidentScoped === true));
  assert.ok(routes.every((route) => route.policy.mutationIntent === null));
});

test('the routes inherit the existing operator policy without changing the policy file', () => {
  const policy = policyForRoute('GET', `${base.replace('controlled-incident', ':incidentId')}/requirements`);
  assert.equal(policy.boundary, 'operator');
  assert.equal(policy.authentication, 'required');
  assert.equal(policy.capability, 'read:incident_command');
});

test('an unauthenticated actor is refused, and an out-of-scope incident is refused', async () => {
  const {router} = harness();
  assert.equal((await request(router, `${base}/requirements`, anonymous)).status, 401);
  const outsider = {...actor, incidentScopes: ['another-incident']};
  assert.equal((await request(router, '/api/v10/operator/incidents/another-one/collection/requirements', outsider)).status, 403);
});

test('unknown query parameters are rejected rather than ignored', async () => {
  const {router} = harness();
  assert.equal((await request(router, `${base}/requirements?bogus=1`)).status, 400);
  assert.equal((await request(router, `${base}/preview?kind=MAKE_SAFE&entityId=h-x`)).status, 400);
});
