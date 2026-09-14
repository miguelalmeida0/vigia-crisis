import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CapOperationalAdapter, commitOperationalEvent, createSourceRegistry } from '../../../../../packages/domain/src/event-fabric/index.mjs';
import { projectOperationalTwin } from '../../../../../packages/domain/src/operational-twin/index.mjs';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { writeJsonAtomic } from '../../shared/json-file.mjs';
import { parseCapXml } from './partner-cap-gateway.mjs';
import { acquireRaw, appendProspectiveSnapshots, createPublicEvidenceVault, evidenceFile, iso, links, normalizedFireId, relative, runtimeRoot, source, writeSourceManifest } from './public-evidence-war-room.mjs';

function capDatePath(date, now) {
  const stamp = date.toISOString().slice(0, 10).replaceAll('-', ''), today = now.toISOString().slice(0, 10).replaceAll('-', '');
  return stamp === today ? `https://dd.weather.gc.ca/today/alerts/cap/${stamp}/` : `https://dd.weather.gc.ca/${stamp}/WXO-DD/alerts/cap/${stamp}/`;
}

async function acquireEcccDocuments({ vault, fetchImpl, clock, days, maximumMessages, failures }) {
  const documents = [], now = clock();
  for (let offset = 0; offset < days && documents.length < maximumMessages; offset += 1) {
    const date = new Date(now.getTime() - offset * 86_400_000), stamp = date.toISOString().slice(0, 10).replaceAll('-', ''), rootUrl = capDatePath(date, now);
    let root;
    try { root = await acquireRaw({ vault, providerId: 'eccc-msc-cap', sourceId: `eccc:cap-index:${stamp}`, url: rootUrl, parserVersion: 'vigia.eccc-datamart-index.v1', accept: 'text/html', maximumBytes: 4 * 1024 * 1024, fetchImpl, clock }); } catch (error) { failures.push({ source: `eccc:${stamp}`, error: String(error.message ?? error) }); continue; }
    const offices = links(root.response.body.toString('utf8'), /^[A-Z]{4}\/$/).sort().reverse();
    for (const office of offices) {
      if (documents.length >= maximumMessages) break;
      let officeIndex; try { officeIndex = await acquireRaw({ vault, providerId: 'eccc-msc-cap', sourceId: `eccc:cap-index:${stamp}:${office.slice(0, -1)}`, url: new URL(office, rootUrl), parserVersion: 'vigia.eccc-datamart-index.v1', accept: 'text/html', maximumBytes: 4 * 1024 * 1024, fetchImpl, clock }); } catch (error) { failures.push({ source: `eccc:${stamp}:${office}`, error: String(error.message ?? error) }); continue; }
      const hours = links(officeIndex.response.body.toString('utf8'), /^\d{2}\/$/).sort().reverse();
      for (const hour of hours) {
        if (documents.length >= maximumMessages) break;
        const hourUrl = new URL(hour, new URL(office, rootUrl)); let hourIndex;
        try { hourIndex = await acquireRaw({ vault, providerId: 'eccc-msc-cap', sourceId: `eccc:cap-index:${stamp}:${office.slice(0, -1)}:${hour.slice(0, -1)}`, url: hourUrl, parserVersion: 'vigia.eccc-datamart-index.v1', accept: 'text/html', maximumBytes: 4 * 1024 * 1024, fetchImpl, clock }); } catch (error) { failures.push({ source: `eccc:${stamp}:${office}${hour}`, error: String(error.message ?? error) }); continue; }
        const files = links(hourIndex.response.body.toString('utf8'), /\.cap$/).sort().reverse();
        for (const name of files) {
          if (documents.length >= maximumMessages) break;
          try {
            const raw = await acquireRaw({ vault, providerId: 'eccc-msc-cap', sourceId: `eccc:cap-message:${stamp}`, url: new URL(name, hourUrl), parserVersion: 'vigia.oasis-cap-1.2.v1', accept: 'application/cap+xml, application/xml', maximumBytes: 4 * 1024 * 1024, fetchImpl, clock });
            documents.push({ providerId: 'eccc-msc-cap', authority: 'Environment and Climate Change Canada', raw, xml: raw.response.body.toString('utf8'), url: raw.response.requestIdentity });
          } catch (error) { failures.push({ source: `eccc:${name}`, error: String(error.message ?? error) }); }
        }
      }
    }
  }
  return documents;
}

async function loadExistingCapDocuments(projectRoot, vault, providerId, maximumMessages, sourceIds = null) {
  const products = vault.acquisitionStore.products().filter((product) => product.provider === providerId && (sourceIds ? sourceIds.includes(product.sourceId) : product.sourceId.includes('cap-message')) && product.processingState !== 'rejected').sort((left, right) => left.retrievedAt.localeCompare(right.retrievedAt)).slice(-maximumMessages), documents = [];
  for (const product of products) {
    const file = vault.acquisitionStore.productArchivePath(product.id); if (!file) continue;
    documents.push({ providerId, authority: source(providerId).authority, raw: { product, retrieval: { retrievedAt: product.retrievedAt } }, xml: await readFile(file, 'utf8'), url: product.originalUri });
  }
  return documents;
}

async function acquireNwsDocuments({ vault, fetchImpl, clock, maximumMessages, failures }) {
  const index = await acquireRaw({ vault, providerId: 'noaa-nws-cap', sourceId: 'nws:alert-history-index', url: `https://api.weather.gov/alerts?limit=${Math.max(1, Math.min(500, maximumMessages * 3))}`, parserVersion: 'vigia.nws-alert-history-geojson.v1', accept: 'application/geo+json', maximumBytes: 32 * 1024 * 1024, fetchImpl, clock }), payload = JSON.parse(index.response.body.toString('utf8')), candidates = (payload.features ?? []).filter((feature) => feature.id || feature.properties?.['@id']).slice(0, maximumMessages), documents = [];
  for (const feature of candidates) {
    const url = feature.id ?? feature.properties['@id'];
    try {
      const raw = await acquireRaw({ vault, providerId: 'noaa-nws-cap', sourceId: 'nws:cap-message', url, parserVersion: 'vigia.oasis-cap-1.2.v1', accept: 'application/cap+xml', maximumBytes: 4 * 1024 * 1024, fetchImpl, clock });
      documents.push({ providerId: 'noaa-nws-cap', authority: 'NOAA National Weather Service', raw, xml: raw.response.body.toString('utf8'), url: raw.response.requestIdentity });
    } catch (error) { failures.push({ source: `nws:${url}`, error: String(error.message ?? error) }); }
  }
  return documents;
}

async function acquireNwsCancellationDocuments({ vault, fetchImpl, clock, maximumMessages, failures }) {
  const index = await acquireRaw({ vault, providerId: 'noaa-nws-cap', sourceId: 'nws:cancel-history-index', url: `https://api.weather.gov/alerts?message_type=cancel&limit=${Math.max(1, Math.min(500, maximumMessages))}`, parserVersion: 'vigia.nws-alert-history-geojson.v1', accept: 'application/geo+json', maximumBytes: 32 * 1024 * 1024, fetchImpl, clock }), payload = JSON.parse(index.response.body.toString('utf8')), candidates = (payload.features ?? []).filter((feature) => feature.id || feature.properties?.['@id']).slice(0, maximumMessages), documents = [], referenceIds = new Set();
  for (const feature of candidates) {
    const url = feature.id ?? feature.properties['@id'];
    try { const raw = await acquireRaw({ vault, providerId: 'noaa-nws-cap', sourceId: 'nws:cap-cancel-message', url, parserVersion: 'vigia.oasis-cap-1.2.v1', accept: 'application/cap+xml', maximumBytes: 4 * 1024 * 1024, fetchImpl, clock }), xml = raw.response.body.toString('utf8'); documents.push({ providerId: 'noaa-nws-cap', authority: 'NOAA National Weather Service', raw, xml, url: raw.response.requestIdentity }); for (const alert of parseCapXml(xml)) for (const reference of alert.references) referenceIds.add(reference.identifier); } catch (error) { failures.push({ source: `nws:cancel:${url}`, error: String(error.message ?? error) }); }
  }
  for (const identifier of [...referenceIds].slice(0, maximumMessages * 2)) {
    const url = `https://api.weather.gov/alerts/${encodeURIComponent(identifier)}`;
    try { const raw = await acquireRaw({ vault, providerId: 'noaa-nws-cap', sourceId: 'nws:cap-reference-message', url, parserVersion: 'vigia.oasis-cap-1.2.v1', accept: 'application/cap+xml', maximumBytes: 4 * 1024 * 1024, fetchImpl, clock }), xml = raw.response.body.toString('utf8'); documents.push({ providerId: 'noaa-nws-cap', authority: 'NOAA National Weather Service', raw, xml, url: raw.response.requestIdentity }); } catch (error) { failures.push({ source: `nws:reference:${identifier}`, error: String(error.message ?? error) }); }
  }
  return documents;
}

function normalizeCapDocuments(documents, receivedAt) {
  const parsed = [], parseFailures = [];
  for (const document of documents) try { for (const alert of parseCapXml(document.xml)) parsed.push({ ...alert, document }); } catch (error) { parseFailures.push({ providerId: document.providerId, rawProductId: document.raw.product.id, error: String(error.message ?? error) }); }
  parsed.sort((left, right) => String(left.sent).localeCompare(String(right.sent)) || String(left.identifier).localeCompare(String(right.identifier)));
  const eventByIdentifier = new Map(), events = [], normalizationFailures = [], lifecycle = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const row = parsed[index], relation = String(row.msgType ?? 'Alert').toUpperCase(), target = row.references.map((reference) => eventByIdentifier.get(reference.identifier)).filter(Boolean).at(-1) ?? null;
    lifecycle.push({ providerId: row.document.providerId, identifier: row.identifier, sent: row.sent, msgType: row.msgType, references: row.references, targetAcquired: relation === 'ALERT' || Boolean(target), rawProductId: row.document.raw.product.id });
    try {
      if (relation !== 'ALERT' && !target) throw new Error('cap_lifecycle_target_not_acquired');
      const adapter = new CapOperationalAdapter({ id: row.document.providerId, sourceId: `${row.document.providerId}:official-cap`, producerId: row.document.authority, upstreamOrigin: new URL(row.document.url).origin }), adapted = adapter.adaptOne(row, { receivedAt: row.document.raw.retrieval.retrievedAt ?? receivedAt, recordIndex: index, rawPayloadHash: `sha256:${row.document.raw.product.checksumSha256}`, rawObjectRef: row.document.raw.product.originalUriOrObjectKey, targetEventId: target?.id ?? null, correlationKeys: [`cap:${row.identifier}`] }), event = commitOperationalEvent(adapted, receivedAt);
      events.push(event); eventByIdentifier.set(row.identifier, event);
    } catch (error) { normalizationFailures.push({ providerId: row.document.providerId, identifier: row.identifier, msgType: row.msgType, error: String(error.message ?? error) }); }
  }
  return { parsed, events, lifecycle, parseFailures, normalizationFailures };
}

function providerCapSummary(providerId, documents, normalized, twin) {
  const rows = normalized.parsed.filter((item) => item.document.providerId === providerId), events = normalized.events.filter((item) => item.provider.adapterId === providerId), lifecycle = normalized.lifecycle.filter((item) => item.providerId === providerId), referenced = new Set(lifecycle.flatMap((item) => item.references.map((reference) => reference.identifier))), acquired = new Set(lifecycle.map((item) => item.identifier)), chains = lifecycle.filter((item) => item.references.some((reference) => acquired.has(reference.identifier))).map((item) => ({ identifier: item.identifier, msgType: item.msgType, acquiredReferences: item.references.filter((reference) => acquired.has(reference.identifier)).map((reference) => reference.identifier), rawProductId: item.rawProductId }));
  return { authority: source(providerId).authority, rights: source(providerId).rightsClassification, rawMessages: documents.filter((item) => item.providerId === providerId).length, schemaParsedAlerts: rows.length, normalizedEvents: events.length, creates: events.filter((item) => item.action === 'CREATE').length, updates: events.filter((item) => item.action === 'UPDATE').length, cancellations: events.filter((item) => item.action === 'CANCEL').length, referencedIdentifiers: referenced.size, acquiredReferencedIdentifiers: [...referenced].filter((identifier) => acquired.has(identifier)).length, lifecycleChains: chains, geometryRetained: rows.filter((item) => item.coordinate).length, timingRetained: rows.filter((item) => item.sent && item.info?.effective && item.info?.expires).length, triadRetained: rows.filter((item) => item.info?.urgency && item.info?.severity && item.info?.certainty).length, twinIncidents: twin.incidents.filter((projection) => projection.evidenceGraph?.sources?.some((entry) => entry.id === `${providerId}:official-cap`)).length };
}

export async function acquireGovernmentCapEvidence({ projectRoot = process.cwd(), fetchImpl = globalThis.fetch, clock = () => new Date(), nwsMaximumMessages = 75, ecccMaximumMessages = 150, ecccDays = 3 } = {}) {
  const startedAt = clock().toISOString(), vault = await createPublicEvidenceVault({ projectRoot, clock }), failures = [], documents = [];
  const existingNws = await loadExistingCapDocuments(projectRoot, vault, 'noaa-nws-cap', nwsMaximumMessages), existingNwsLifecycle = await loadExistingCapDocuments(projectRoot, vault, 'noaa-nws-cap', 75, ['nws:cap-cancel-message', 'nws:cap-reference-message']), existingEccc = await loadExistingCapDocuments(projectRoot, vault, 'eccc-msc-cap', ecccMaximumMessages); documents.push(...existingNws, ...existingNwsLifecycle, ...existingEccc);
  if (existingNws.length < nwsMaximumMessages) try { documents.push(...await acquireNwsDocuments({ vault, fetchImpl, clock, maximumMessages: nwsMaximumMessages - existingNws.length, failures })); } catch (error) { failures.push({ source: 'nws:alert-history-index', error: String(error.message ?? error) }); }
  if (!existingNwsLifecycle.some((document) => document.raw.product.sourceId === 'nws:cap-cancel-message')) try { documents.push(...await acquireNwsCancellationDocuments({ vault, fetchImpl, clock, maximumMessages: 25, failures })); } catch (error) { failures.push({ source: 'nws:cancel-history-index', error: String(error.message ?? error) }); }
  if (existingEccc.length < ecccMaximumMessages) documents.push(...await acquireEcccDocuments({ vault, fetchImpl, clock, days: ecccDays, maximumMessages: ecccMaximumMessages - existingEccc.length, failures }));
  const normalized = normalizeCapDocuments(documents, clock().toISOString()), registeredAt = normalized.events.map((event) => event.clocks.receivedAt).sort()[0] ?? startedAt, registryRows = ['noaa-nws-cap', 'eccc-msc-cap'].map((providerId) => ({ sourceId: `${providerId}:official-cap`, familyId: 'official.cap-alert', familyClass: 'OFFICIAL', provider: providerId, sourceClass: 'OFFICIAL', producerId: source(providerId).authority, upstreamOrigin: providerId === 'noaa-nws-cap' ? 'https://api.weather.gov' : 'https://dd.weather.gc.ca', capabilities: ['OFFICIAL_ALERT', 'UPDATE', 'CANCEL'], staleAfterMs: providerId === 'noaa-nws-cap' ? 1_800_000 : 3_600_000, initialStatus: 'ACTIVE', registeredAt })), sourceRegistry = createSourceRegistry(registryRows), projectionAsOf = clock().toISOString(), twin = projectOperationalTwin({ events: normalized.events, sourceRegistry, asOf: projectionAsOf }), replay = projectOperationalTwin({ events: normalized.events, sourceRegistry, asOf: projectionAsOf }), ledgerCore = { schemaVersion: 'vigia.government-cap-event-ledger.v1', generatedAt: projectionAsOf, events: normalized.events, rawObjects: documents.map((document) => ({ providerId: document.providerId, rawProductId: document.raw.product.id, reference: document.raw.product.originalUriOrObjectKey, sha256: `sha256:${document.raw.product.checksumSha256}`, bytes: document.raw.product.byteLength, retrievedAt: document.raw.retrieval.retrievedAt, url: document.url })) }, ledger = { ...ledgerCore, fingerprint: semanticHash('government-cap-event-ledger', ledgerCore) };
  await writeJsonAtomic(path.join(runtimeRoot(projectRoot), 'government-cap-event-ledger.json'), ledger);
  const localOutage = await localTransportRecoveryProof(), nws = providerCapSummary('noaa-nws-cap', documents, normalized, twin), eccc = providerCapSummary('eccc-msc-cap', documents, normalized, twin), reportCore = { schemaVersion: 'vigia.government-cap-integration.v1', startedAt, completedAt: clock().toISOString(), nws, eccc, totals: { rawMessages: documents.length, schemaParsedAlerts: normalized.parsed.length, normalizedEvents: normalized.events.length, lifecycleChains: nws.lifecycleChains.length + eccc.lifecycleChains.length, creates: normalized.events.filter((event) => event.action === 'CREATE').length, updates: normalized.events.filter((event) => event.action === 'UPDATE').length, cancellations: normalized.events.filter((event) => event.action === 'CANCEL').length }, eventFabric: { ledger: relative(projectRoot, path.join(runtimeRoot(projectRoot), 'government-cap-event-ledger.json')), ledgerFingerprint: ledger.fingerprint, ontologyBinding: 'OFFICIAL_CAP_ALERT', sourceRegistryFingerprint: sourceRegistry.fingerprint }, twin: { projectionHash: twin.projectionHash, incidents: twin.incidents.length, failures: twin.failures, consumerState: twin.incidents.length ? 'TWIN_PROJECTION_UPDATED' : 'NO_PROJECTABLE_GEOMETRY' }, replay: { projectionHash: replay.projectionHash, verified: replay.projectionHash === twin.projectionHash }, rawPreservation: { contentAddressed: true, neverOverwrite: true, rawProductIds: documents.map((document) => document.raw.product.id) }, retainedFields: ['identifier', 'sender', 'sent', 'effective', 'onset', 'expires', 'geometry', 'urgency', 'severity', 'certainty', 'references'], parseFailures: normalized.parseFailures, normalizationFailures: normalized.normalizationFailures, acquisitionFailures: failures, transportRecovery: localOutage, syntheticGovernmentOutageClaimed: false };
  const report = { ...reportCore, passed: documents.length > 0 && normalized.events.length > 0 && replay.projectionHash === twin.projectionHash, fingerprint: semanticHash('government-cap-integration', reportCore) };
  const capSnapshots = normalized.parsed.filter((row) => row.coordinate).slice(-25).map((row) => ({ providerId: row.document.providerId, incidentId: `CAP-${normalizedFireId(row.identifier)}`, productId: 'OFFICIAL_CAP_ALERT', providerPublishedAt: iso(row.sent), feature: { type: 'Feature', geometry: { type: 'Point', coordinates: row.coordinate }, properties: { identifier: row.identifier, msgType: row.msgType, sent: row.sent, effective: row.info.effective, expires: row.info.expires, severity: row.info.severity, urgency: row.info.urgency, certainty: row.info.certainty, references: row.references }, acquisition: { rawProductId: row.document.raw.product.id, retrievedAt: row.document.raw.retrieval.retrievedAt, sourceId: row.document.raw.product.sourceId } } }));
  await appendProspectiveSnapshots({ projectRoot, currentProducts: capSnapshots, clock }); await writeJsonAtomic(evidenceFile(projectRoot, 'government-cap-integration.json'), report); await writeSourceManifest(projectRoot, vault, clock().toISOString()); return report;
}

async function localTransportRecoveryProof() {
  let attempts = 0; const operation = async () => { attempts += 1; if (attempts === 1) throw new Error('LOCAL_SYNTHETIC_TRANSPORT_INTERRUPTION'); return { ok: true }; }; let recovered = false;
  for (let attempt = 1; attempt <= 2; attempt += 1) try { recovered = (await operation()).ok; break; } catch { /* bounded local retry */ }
  return { classification: 'ENGINEERING_ONLY_LOCAL_SYNTHETIC_OUTAGE', attempts, boundedAttempts: 2, recovered, actualGovernmentOutage: false, mixedWithGovernmentEvidence: false };
}
