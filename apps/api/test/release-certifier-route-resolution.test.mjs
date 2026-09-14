import assert from 'node:assert/strict';
import test from 'node:test';
import {
  certifyRequiredRoutes,
  resolveCertificationIncidentId,
  resolveRoutePath,
} from '../../../scripts/release/route_resolver.mjs';

const incidentId = 'CSX/incident with spaces';
const encodedIncidentId = 'CSX%2Fincident%20with%20spaces';

test('central incident route resolves to a concrete encoded path', () => {
  assert.equal(
    resolveRoutePath('/api/v10/incident-command/incidents/{incidentId}', { incidentId }),
    `/api/v10/incident-command/incidents/${encodedIncidentId}`,
  );
});

test('FieldNode incident routes use the same concrete resolver', () => {
  assert.equal(
    resolveRoutePath('/api/fieldnet/incidents/{incidentId}/command-survival', { incidentId }),
    `/api/fieldnet/incidents/${encodedIncidentId}/command-survival`,
  );
});

test('an incident route without a governed incident ID fails closed', () => {
  assert.throws(
    () => resolveRoutePath('/api/v10/incident-command/incidents/{incidentId}', {}),
    /governed_certification_incident_unresolved/,
  );
  assert.throws(
    () => resolveCertificationIncidentId({ proof: null, fieldIncidents: { incidents: [] } }),
    /governed_certification_incident_unresolved/,
  );
});

test('literal route templates never reach the HTTP client', async () => {
  let called = false;
  await assert.rejects(
    certifyRequiredRoutes({
      routes: [{ id: 'command-survival', path: '/incidents/{incidentId}' }],
      baseUrl: 'http://127.0.0.1:4177',
      family: 'central',
      context: {},
      request: async () => {
        called = true;
        return { ok: true, status: 200, body: {}, durationMs: 1 };
      },
    }),
    /governed_certification_incident_unresolved/,
  );
  assert.equal(called, false);
});

test('certification evidence and HTTP requests contain only concrete paths', async () => {
  const requestedUrls = [];
  const evidence = await certifyRequiredRoutes({
    routes: [{ id: 'fieldnet-incident', path: '/api/fieldnet/incidents/{incidentId}' }],
    baseUrl: 'http://127.0.0.1:4188',
    family: 'fieldNode',
    context: { incidentId },
    request: async (url) => {
      requestedUrls.push(url);
      return { ok: true, status: 200, body: { schemaVersion: 'test.v1' }, durationMs: 1 };
    },
  });

  assert.deepEqual(requestedUrls, [`http://127.0.0.1:4188/api/fieldnet/incidents/${encodedIncidentId}`]);
  assert.equal(evidence[0].path, `/api/fieldnet/incidents/${encodedIncidentId}`);
  assert.equal(evidence[0].family, 'fieldNode');
  assert.doesNotMatch(evidence[0].path, /\{[^}]+\}/);
});

test('governed proof is preferred over FieldNode discovery', () => {
  assert.deepEqual(
    resolveCertificationIncidentId({
      proof: { verdict: 'PASS', incidentId: 'governed-proof-incident' },
      fieldIncidents: { incidents: [{ incidentId: 'field-fallback-incident' }] },
    }),
    { incidentId: 'governed-proof-incident', source: 'controlled-exercise-proof' },
  );
});
