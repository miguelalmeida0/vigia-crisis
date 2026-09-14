import test from 'node:test';
import assert from 'node:assert/strict';
import { mutationAllowed, resolveRequestActor } from '../src/modules/control/request-context.mjs';

const actors = {
  'actor-supervisor': { id: 'actor-supervisor', role: 'supervisor' },
  'actor-viewer': { id: 'actor-viewer', role: 'viewer' }
};
const control = { actor(id) { return actors[id] ?? actors['actor-supervisor']; } };
function request(method = 'GET', headers = {}, url = '/api/v2/bootstrap') { return { method, headers:{host:'127.0.0.1:4177',...headers}, url,socket:{remoteAddress:'127.0.0.1'} }; }

test('public mode ignores client-selected authority without a valid bearer and denies operator mutation', () => {
  const req = request('POST', { 'x-vigia-actor-id': 'actor-supervisor' }, '/api/v2/evidence-requests');
  const actor = resolveRequestActor(req, control, { fixtureMode: false, operatorBearerToken: '' });
  assert.equal(actor.id, 'public-readonly'); assert.equal(actor.role,'public_viewer'); assert.equal(actor.authentication.authenticated, false); assert.equal(mutationAllowed(req, actor), false);
});

test('configured loopback local-shadow bearer resolves one bounded operator principal', () => {
  const req = request('POST', { authorization: 'Bearer bounded-secret', 'x-vigia-actor-id': 'actor-supervisor' }, '/api/v2/evidence-requests');
  const actor = resolveRequestActor(req, control, { runtimeProfile:'local_shadow',operatorBearerToken: 'bounded-secret', operatorActorId: 'actor-supervisor', operatorActorRole: 'supervisor', operatorActorQualifications:['wildfire_prevention_domain_expert'] });
  assert.equal(actor.id, 'actor-supervisor'); assert.equal(actor.authentication.mode, 'environment_bearer'); assert.equal(actor.authentication.authenticated,true); assert.deepEqual(actor.qualifications,['wildfire_prevention_domain_expert']); assert.equal(mutationAllowed(req, actor), true);
  const wrong = resolveRequestActor(request('POST', { authorization:'Bearer wrong-secret', 'x-vigia-actor-id': 'actor-supervisor' }), control, { runtimeProfile:'local_shadow',operatorBearerToken:'bounded-secret',operatorActorId:'actor-supervisor' });
  assert.equal(wrong.id,'public-readonly');assert.equal(wrong.authentication.authenticated,false);
});

test('device observation ingest retains its separate signed-device boundary', () => {
  const req = request('POST', {}, '/api/v10/sensors/observations');
  assert.equal(mutationAllowed(req, { authentication: { authenticated: false } }), true);
});
