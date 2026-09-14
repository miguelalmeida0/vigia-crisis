import assert from 'node:assert/strict';
import test from 'node:test';
import { FieldNetUiSessionManager } from '../src/ui-session-manager.mjs';

test('protected bootstrap issues an exact-scope browser session without exposing the control key', () => {
  const manager = new FieldNetUiSessionManager({ clock: () => new Date('2026-09-04T15:00:00Z') });
  const issued = manager.issue({
    principalId: 'observer:field:1', issuedBy: 'field-operator', incidentId: 'incident:field:1',
    deviceId: 'device:field:1', observerClass: 'AUTHORIZED_RESPONDER'
  });
  assert.match(issued.setCookie, /^vigia_fieldnet_session=/);
  assert.match(issued.setCookie, /HttpOnly/);
  assert.match(issued.setCookie, /SameSite=Strict/);
  assert.equal(JSON.stringify(issued).includes('control-key'), false);
  const headers = { cookie: issued.setCookie.split(';')[0] };
  const read = manager.authenticate({ headers, method: 'GET', incidentId: 'incident:field:1' });
  assert.equal(read.principalId, 'observer:field:1');
  assert.throws(() => manager.authenticate({ headers, method: 'GET', incidentId: 'incident:other' }), /fieldnet_ui_incident_scope_forbidden/);
  assert.throws(() => manager.authenticate({ headers, method: 'POST', incidentId: 'incident:field:1' }), /fieldnet_ui_csrf_rejected/);
  assert.equal(manager.authenticate({ headers: { ...headers, 'x-vigia-field-csrf': issued.csrfToken }, method: 'POST', incidentId: 'incident:field:1' }).deviceId, 'device:field:1');
});

test('sessions expire, revoke, and remain bounded', () => {
  let now = new Date('2026-09-04T15:00:00Z');
  const manager = new FieldNetUiSessionManager({ clock: () => now, ttlMs: 60_000, maxSessions: 1 });
  const issued = manager.issue({ principalId: 'observer:1', issuedBy: 'operator:1', incidentId: 'incident:1', deviceId: 'device:1', observerClass: 'MUNICIPAL_OPERATOR' });
  assert.throws(() => manager.issue({ principalId: 'observer:2', issuedBy: 'operator:1', incidentId: 'incident:1', deviceId: 'device:2', observerClass: 'MUNICIPAL_OPERATOR' }), /capacity_reached/);
  const headers = { cookie: issued.setCookie.split(';')[0] };
  assert.equal(manager.revoke(headers).removed, true);
  assert.throws(() => manager.authenticate({ headers }), /session_required/);
  const next = manager.issue({ principalId: 'observer:2', issuedBy: 'operator:1', incidentId: 'incident:1', deviceId: 'device:2', observerClass: 'MUNICIPAL_OPERATOR' });
  now = new Date('2026-09-04T15:01:01Z');
  assert.throws(() => manager.authenticate({ headers: { cookie: next.setCookie.split(';')[0] } }), /session_required/);
  assert.equal(manager.status().activeSessions, 0);
});
