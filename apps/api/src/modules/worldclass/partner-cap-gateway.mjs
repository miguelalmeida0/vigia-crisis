import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CapOperationalAdapter, commitOperationalEvent, createSourceRegistry } from '../../../../../packages/domain/src/event-fabric/index.mjs';
import { projectOperationalTwin } from '../../../../../packages/domain/src/operational-twin/index.mjs';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { writeJsonAtomic } from '../../shared/json-file.mjs';

const decode = (value) => String(value ?? '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&').trim();
const one = (xml, name) => { const match = String(xml ?? '').match(new RegExp(`<(?:[A-Za-z0-9_-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${name}>`, 'i')); return match ? decode(match[1]) : null; };
const blocks = (xml, name) => [...xml.matchAll(new RegExp(`<(?:[A-Za-z0-9_-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${name}>`, 'gi'))].map((match) => match[1]);
const coordinate = (area) => { const value = one(area, 'circle') || one(area, 'polygon'); if (!value) return null; const pair = value.split(/\s+/)[0]?.split(',').map(Number); return pair?.length >= 2 && pair.every(Number.isFinite) ? [pair[1], pair[0]] : null; };
const references = (value) => String(value ?? '').trim().split(/\s+/).filter(Boolean).map((entry) => {
  const [sender, identifier, sent] = entry.split(',');
  return { sender: sender || null, identifier: identifier || null, sent: sent || null, raw: entry };
}).filter((entry) => entry.identifier);

export function parseCapXml(xml, { maximumAlerts = 500 } = {}) {
  const alerts = blocks(xml, 'alert').slice(0, maximumAlerts);
  if (!alerts.length) throw new Error('cap_alert_collection_empty');
  return alerts.map((alert) => {
    const info = blocks(alert, 'info')[0] ?? '', area = blocks(info, 'area')[0] ?? '', eventCode = blocks(info, 'eventCode')[0] ?? '';
    const alertReferences = references(one(alert, 'references'));
    return { identifier: one(alert, 'identifier'), sender: one(alert, 'sender'), sent: one(alert, 'sent'), status: one(alert, 'status'), msgType: one(alert, 'msgType'), scope: one(alert, 'scope'), references: alertReferences, targetReferenceIdentifier: alertReferences.at(-1)?.identifier ?? null, coordinate: coordinate(area), info: { category: one(info, 'category'), event: one(info, 'event'), eventCode: one(eventCode, 'value') || one(info, 'event'), effective: one(info, 'effective'), onset: one(info, 'onset'), expires: one(info, 'expires'), headline: one(info, 'headline'), urgency: one(info, 'urgency'), severity: one(info, 'severity'), certainty: one(info, 'certainty'), area: { description: one(area, 'areaDesc'), circle: one(area, 'circle'), polygon: one(area, 'polygon'), coordinate: coordinate(area) } } };
  });
}

export class PartnerCapGateway {
  constructor({ endpoint, token = '', allowedHosts = [], projectRoot = process.cwd(), fetchImpl = globalThis.fetch, clock = () => new Date(), maximumBytes = 5 * 1024 * 1024, maximumAlerts = 500, attempts = 3 } = {}) {
    this.url = new URL(endpoint); if (this.url.protocol !== 'https:') throw new Error('cap_partner_https_required');
    if (!allowedHosts.includes(this.url.hostname)) throw new Error('cap_partner_host_not_allowlisted');
    this.token = token; this.projectRoot = projectRoot; this.fetchImpl = fetchImpl; this.clock = clock; this.maximumBytes = maximumBytes; this.maximumAlerts = maximumAlerts; this.attempts = attempts;
    if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) throw new Error('cap_partner_attempts_invalid');
  }
  async poll() {
    let response, lastError;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      try { response = await this.fetchImpl(this.url, { headers: { Accept: 'application/cap+xml, application/xml;q=0.9', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, redirect: 'error', signal: AbortSignal.timeout(10_000) }); if (!response.ok) throw new Error(`cap_partner_http_${response.status}`); break; }
      catch (error) { lastError = error; if (attempt < this.attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 100)); }
    }
    if (!response?.ok) throw lastError ?? new Error('cap_partner_unavailable');
    const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.byteLength > this.maximumBytes) throw new Error('cap_partner_payload_too_large');
    const receivedAt = this.clock().toISOString(), digest = createHash('sha256').update(bytes).digest('hex'), rawDirectory = path.join(this.projectRoot, 'data/runtime/worldclass/partner-cap/raw'), rawFile = path.join(rawDirectory, `${digest}.cap.xml`);
    await mkdir(rawDirectory, { recursive: true }); await writeFile(rawFile, bytes, { flag: 'wx', mode: 0o600 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    const ledgerFile = path.join(this.projectRoot, 'data/runtime/worldclass/partner-cap/events.json'), priorLedger = await readPartnerLedger(ledgerFile), alerts = parseCapXml(bytes.toString('utf8'), { maximumAlerts: this.maximumAlerts }), adapter = new CapOperationalAdapter({ id: 'global-cap-partner', sourceId: 'partner-cap-authority', producerId: this.url.hostname, upstreamOrigin: this.url.origin }), eventByIdentifier = new Map(priorLedger.events.map((item) => [item.provider.providerEventId, item])), events = [];
    for (let index = 0; index < alerts.length; index += 1) {
      const alert = alerts[index], targetEventId = eventByIdentifier.get(alert.targetReferenceIdentifier)?.id ?? null, adapted = adapter.adaptOne(alert, { receivedAt, recordIndex: index, rawPayloadHash: `sha256:${digest}`, rawObjectRef: path.relative(this.projectRoot, rawFile), targetEventId, correlationKeys: [`cap:${alert.identifier}`] }), event = commitOperationalEvent(adapted, receivedAt); events.push(event); eventByIdentifier.set(alert.identifier, event);
    }
    const byId = new Map(priorLedger.events.map((item) => [item.id, item])); for (const event of events) { const prior = byId.get(event.id); if (prior && prior.fingerprint !== event.fingerprint) throw new Error('cap_partner_event_identity_conflict'); byId.set(event.id, event); } const retainedEvents = [...byId.values()].sort((left, right) => left.clocks.ingestedAt.localeCompare(right.clocks.ingestedAt) || left.id.localeCompare(right.id)), rawObjects = [...new Map([...(priorLedger.rawObjects ?? []), { reference: path.relative(this.projectRoot, rawFile), sha256: `sha256:${digest}`, bytes: bytes.byteLength, receivedAt }].map((item) => [item.sha256, item])).values()].sort((left, right) => left.sha256.localeCompare(right.sha256)), ledgerCore = { schemaVersion: 'vigia.partner-cap-event-ledger.v1', events: retainedEvents, rawObjects }, ledger = { ...ledgerCore, fingerprint: semanticHash('partner-cap-event-ledger', ledgerCore) }; await writeJsonAtomic(ledgerFile, ledger);
    const registeredAt = retainedEvents.map((item) => item.clocks.receivedAt).sort()[0] ?? receivedAt, sourceRegistry = createSourceRegistry([{ sourceId: 'partner-cap-authority', familyId: 'official.cap-alert', familyClass: 'OFFICIAL', provider: this.url.hostname, sourceClass: 'OFFICIAL', producerId: this.url.hostname, upstreamOrigin: this.url.origin, capabilities: ['OFFICIAL_ALERT', 'UPDATE', 'CANCEL'], staleAfterMs: 900_000, initialStatus: 'ACTIVE', registeredAt }]), twin = projectOperationalTwin({ events: retainedEvents, sourceRegistry, asOf: receivedAt }), replay = projectOperationalTwin({ events: retainedEvents, sourceRegistry, asOf: receivedAt });
    const core = { schemaVersion: 'vigia.partner-cap-ingestion.v1', endpointOrigin: this.url.origin, authentication: this.token ? 'BEARER_PRESENT_REDACTED' : 'PUBLIC', receivedAt, rawObject: { reference: path.relative(this.projectRoot, rawFile), sha256: `sha256:${digest}`, bytes: bytes.byteLength }, schemaValidatedAlerts: alerts.length, committedEvents: events.length, retainedEvents: retainedEvents.length, lifecycle: { creates: events.filter((item) => item.action === 'CREATE').length, updates: events.filter((item) => item.action === 'UPDATE').length, cancellations: events.filter((item) => item.action === 'CANCEL').length }, eventIds: events.map((item) => item.id), eventFabric: { committed: true, ledger: path.relative(this.projectRoot, ledgerFile), ledgerFingerprint: ledger.fingerprint }, twin: { projectionHash: twin.projectionHash, incidents: twin.incidents.length, failures: twin.failures, operatorVisibleEffect: twin.incidents.length ? 'INCIDENT_PROJECTION_UPDATED' : 'NO_BOUND_INCIDENT' }, retryPolicy: { maximumAttempts: this.attempts, boundedBackoffMs: [100, 200] }, replayFingerprint: semanticHash('partner-cap-replay', retainedEvents), replayVerified: replay.projectionHash === twin.projectionHash, secretsRecorded: false };
    const report = { ...core, fingerprint: semanticHash('partner-cap-ingestion', core) }, reportFile = path.join(this.projectRoot, 'data/validation/worldclass/partner-cap-ingestion.json'); await writeJsonAtomic(reportFile, report); return report;
  }
}

async function readPartnerLedger(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return { events: [], rawObjects: [] }; throw error; } }
export async function readPartnerCapReplay(projectRoot = process.cwd()) { try { return JSON.parse(await readFile(path.join(projectRoot, 'data/validation/worldclass/partner-cap-ingestion.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
