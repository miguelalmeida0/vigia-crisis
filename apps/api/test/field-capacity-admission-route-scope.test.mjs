import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { Router } from '../src/http/router.mjs';
import { registerFieldCapacityAdmissionRoutes } from '../src/modules/fieldnet/field-capacity-admission-routes.mjs';

const authenticated = (incidentScopes) => ({
  id: 'operator:capacity-scope-test',
  role: 'supervisor',
  incidentScopes,
  authentication: { authenticated: true, mode: 'environment_bearer' }
});

function response() {
  return {
    statusCode: null,
    body: '',
    headers: {},
    writeHead(status, headers = {}) { this.statusCode = status; Object.assign(this.headers, headers); },
    end(value = '') { this.body += value; }
  };
}

async function get(router, url, actor) {
  const req = Readable.from([]);
  Object.assign(req, { method: 'GET', url, headers: { host: '127.0.0.1:4177' }, socket: { remoteAddress: '127.0.0.1' } });
  const res = response();
  await router.safeHandle(req, res, { actor });
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

test('global capacity-admission status cannot leak cross-incident aggregates to an incident-scoped actor', async () => {
  let statusReads = 0;
  const router = new Router();
  registerFieldCapacityAdmissionRoutes(router, {
    fieldCapacityAdmissionService: {
      status() { statusReads += 1; return { live: 7, exercise: 2, revoked: 1 }; },
      admissionFor() { return { admissionId: 'admission:incident-a:observation-a' }; }
    }
  });

  const narrow = await get(router, '/api/v10/fieldnet/capacity-admissions/status', authenticated(['incident-a']));
  assert.equal(narrow.status, 403);
  assert.equal(narrow.body.error, 'incident_scope_forbidden');
  assert.equal(statusReads, 0, 'aggregate status must not be evaluated before global-scope authorization');

  const global = await get(router, '/api/v10/fieldnet/capacity-admissions/status', authenticated(['*']));
  assert.equal(global.status, 200);
  assert.deepEqual(global.body, { live: 7, exercise: 2, revoked: 1 });
  assert.equal(statusReads, 1);

  const exact = await get(router, '/api/v10/fieldnet/capacity-admissions/incident-a/observation-a', authenticated(['incident-a']));
  assert.equal(exact.status, 200);
  assert.equal(exact.body.admissionId, 'admission:incident-a:observation-a');
});
