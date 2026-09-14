import { randomBytes } from 'node:crypto';
import { sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';

const COOKIE_NAME = 'vigia_fieldnet_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function opaque(value, code) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > 200 || /\s|@/.test(result)) throw new Error(code);
  return result;
}

function cookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index < 1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function tokenHash(token) {
  return sha256(`fieldnet-ui-session:${token}`);
}

function csrfHash(token) {
  return sha256(`fieldnet-ui-csrf:${token}`);
}

export class FieldNetUiSessionManager {
  #sessions = new Map();

  constructor({ clock = () => new Date(), ttlMs = 30 * 60_000, maxSessions = 64 } = {}) {
    if (!Number.isFinite(ttlMs) || ttlMs < 60_000 || !Number.isSafeInteger(maxSessions) || maxSessions < 1) throw new Error('fieldnet_ui_session_configuration_invalid');
    Object.assign(this, { clock, ttlMs, maxSessions });
  }

  issue({ principalId, issuedBy, incidentId, deviceId, observerClass, secureCookie = false } = {}) {
    this.#prune();
    if (this.#sessions.size >= this.maxSessions) throw Object.assign(new Error('fieldnet_ui_session_capacity_reached'), { statusCode: 503 });
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const issuedAt = this.clock().toISOString();
    const expiresAt = new Date(this.clock().getTime() + this.ttlMs).toISOString();
    const session = Object.freeze({
      sessionId: `fieldnet-ui:${randomBytes(16).toString('hex')}`,
      principalId: opaque(principalId, 'fieldnet_ui_principal_required'),
      issuedBy: opaque(issuedBy, 'fieldnet_ui_issuer_required'),
      incidentId: opaque(incidentId, 'fieldnet_ui_incident_required'),
      deviceId: opaque(deviceId, 'fieldnet_ui_device_required'),
      observerClass: opaque(observerClass, 'fieldnet_ui_observer_class_required'),
      issuedAt,
      expiresAt,
      csrfHashes: Object.freeze([csrfHash(csrfToken)])
    });
    this.#sessions.set(tokenHash(token), session);
    return {
      session,
      csrfToken,
      setCookie: `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(this.ttlMs / 1000)}${secureCookie ? '; Secure' : ''}`
    };
  }

  hasSessionCookie(headers = {}) {
    return Boolean(cookies(headers.cookie)[COOKIE_NAME]);
  }

  authenticate({ headers = {}, method = 'GET', incidentId = null } = {}) {
    this.#prune();
    const token = cookies(headers.cookie)[COOKIE_NAME];
    const session = token ? this.#sessions.get(tokenHash(token)) : null;
    if (!session) throw Object.assign(new Error('fieldnet_ui_session_required'), { statusCode: 401 });
    if (incidentId && String(incidentId) !== session.incidentId) throw Object.assign(new Error('fieldnet_ui_incident_scope_forbidden'), { statusCode: 403 });
    if (!SAFE_METHODS.has(String(method).toUpperCase())) {
      const presented = String(headers['x-vigia-field-csrf'] ?? '');
      if (!presented || !session.csrfHashes.includes(csrfHash(presented))) throw Object.assign(new Error('fieldnet_ui_csrf_rejected'), { statusCode: 403 });
    }
    return session;
  }

  refreshCsrf(headers = {}) {
    this.#prune();
    const token = cookies(headers.cookie)[COOKIE_NAME];
    const hash = token ? tokenHash(token) : null;
    const session = hash ? this.#sessions.get(hash) : null;
    if (!session) throw Object.assign(new Error('fieldnet_ui_session_required'), { statusCode: 401 });
    const csrfToken = randomBytes(24).toString('base64url');
    const refreshed = Object.freeze({ ...session, csrfHashes: Object.freeze([csrfHash(csrfToken), ...session.csrfHashes].slice(0, 4)) });
    this.#sessions.set(hash, refreshed);
    return { session: refreshed, csrfToken };
  }

  revoke(headers = {}) {
    const token = cookies(headers.cookie)[COOKIE_NAME];
    const removed = token ? this.#sessions.delete(tokenHash(token)) : false;
    return { removed, clearCookie: `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` };
  }

  publicSession(session) {
    return {
      schemaVersion: 'vigia.fieldnet-ui-session.v1',
      state: 'READY',
      sessionId: session.sessionId,
      principalId: session.principalId,
      incidentId: session.incidentId,
      deviceId: session.deviceId,
      observerClass: session.observerClass,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      authorityBoundary: 'Browser session is incident- and device-scoped. It contains no FieldNet control key and cannot grant central admission or dispatch authority.'
    };
  }

  status() {
    this.#prune();
    return { state: 'READY', activeSessions: this.#sessions.size, maxSessions: this.maxSessions, ttlMs: this.ttlMs };
  }

  #prune() {
    const now = this.clock().getTime();
    for (const [hash, session] of this.#sessions) if (Date.parse(session.expiresAt) <= now) this.#sessions.delete(hash);
  }
}

export const FIELDNET_UI_SESSION_COOKIE = COOKIE_NAME;
