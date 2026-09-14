import { createKnowledgeTimeRecord } from '../../../../../packages/domain/src/forecast-corpus/index.mjs';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { trustedFetch } from '../reality-network/trusted-endpoint.mjs';

const HOST = 'firms.modaps.eosdis.nasa.gov', SOURCES = Object.freeze(['VIIRS_SNPP_SP', 'VIIRS_NOAA20_SP']);
function parseCsv(body) {
  const lines = body.toString('utf8').trim().split(/\r?\n/), headers = lines.shift()?.split(',') ?? [];
  if (!headers.includes('latitude') || !headers.includes('acq_date')) throw new Error('firms_archive_csv_schema_invalid');
  return lines.filter(Boolean).map((line) => Object.fromEntries(line.split(',').map((value, index) => [headers[index], value])));
}
function observedAt(row) { const time = String(row.acq_time ?? '').padStart(4, '0'); return new Date(`${row.acq_date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`).toISOString(); }
export async function acquireFirmsArchive({ bbox, from, days = 5, mapKey, rawVault, manifest, fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
  if (!mapKey) return { observations: [], rawProducts: [], blocker: 'NASA_FIRMS_MAP_KEY_NOT_CONFIGURED' };
  if (!Number.isInteger(days) || days < 1 || days > 5) throw new Error('firms_archive_days_unbounded');
  const observations = [], rawProducts = [];
  for (const source of SOURCES) {
    const url = `https://${HOST}/api/area/csv/${mapKey}/${source}/${bbox.join(',')}/${days}/${from}`;
    const response = await trustedFetch({ url, allowedHosts: [HOST], secretValues: [mapKey], maxBytes: 8 * 1024 * 1024, timeoutMs: 30_000, accept: 'text/csv', fetchImpl });
    if (!response.ok) throw new Error(`firms_archive_http_${response.status}:${source}`);
    const rows = parseCsv(response.body), productId = `FIRMS:${source}:${from}:${days}:${bbox.join(',')}`;
    const raw = await rawVault.preserve({ providerId: 'nasa-firms-archive', sourceId: `firms:${source}`, providerProductId: productId, body: response.body, requestIdentity: response.requestIdentity, response: { ...response, sourceTimestampRange: { start: `${from}T00:00:00Z`, end: new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString() } }, licenceId: 'NASA-FIRMS-TERMS', parserVersion: 'vigia.firms-standard-csv.v1', requestWindow: { bbox, from, days, source }, fetchRunId: manifest.integrity.fingerprint, retrievedAt: response.retrievedAt });
    rawProducts.push(raw.product); const canonicalIngestedAt = clock().toISOString();
    for (const row of rows) {
      const at = observedAt(row), coordinate = [Number(row.longitude), Number(row.latitude)]; if (!coordinate.every(Number.isFinite)) continue;
      const clocks = createKnowledgeTimeRecord({ physicalOccurredAt: at, observedAt: at, providerPublishedAt: null, providerModifiedAt: null, retrievedAt: response.retrievedAt, availableToVigiaAt: response.retrievedAt, canonicalIngestedAt, labelPublishedAt: null, arrivalTimeBasis: 'ARCHIVE_DISCOVERY' });
      const core = { providerId: 'nasa-firms-archive', product: source, platform: row.satellite ?? source, instrumentFamily: 'VIIRS', coordinate, frpMw: Number(row.frp), confidence: row.confidence ?? null, dayNight: row.daynight ?? null, processingMode: 'STANDARD', clocks, bronzeRefs: [raw.product.id], causalRoot: `${row.satellite ?? source}:${at}:${row.latitude}:${row.longitude}` };
      observations.push({ ...core, id: semanticHash('firms-archive-observation', core) });
    }
  }
  return { observations: observations.sort((a, b) => a.id.localeCompare(b.id)), rawProducts, blocker: null };
}
