import { CORPUS_SOURCES } from './source-portfolio.mjs';
import { trustedFetch } from '../reality-network/trusted-endpoint.mjs';
import { DATA_RIGHTS } from '../reality-network/provider-portfolio.mjs';

const RIGHTS = new Map(DATA_RIGHTS.map((item) => [item.licenceId, item]));
function licenceStatus(source) { const right = RIGHTS.get(source.licenceId); if (!right) return 'NOT_REGISTERED'; return [right.commercialUse, right.redistribution, right.derivedProducts].includes('REVIEW_REQUIRED') ? 'REVIEW_REQUIRED' : 'REGISTERED'; }
const metadataUrl = (source) => source.id === 'noaa-hrrr-archive' ? `${source.endpoint}/?list-type=2&max-keys=1` : source.endpoint.includes('/rest/services/') ? `${source.endpoint}?f=json` : source.endpoint;
async function probe(source, fetchImpl) {
  if (['PARTNER_REQUIRED', 'CREDENTIALS_REQUIRED'].includes(source.status)) return { accessStatus: source.status, network: 'NOT_PROBED', credentialStatus: source.status };
  try {
    const response = await trustedFetch({ url: metadataUrl(source), allowedHosts: [source.host], maxBytes: 2 * 1024 * 1024, timeoutMs: 15_000, accept: 'application/json,text/html,application/xml,*/*', fetchImpl });
    return { accessStatus: response.ok ? source.status : 'NETWORK_BLOCKED', network: response.ok ? 'REACHABLE' : `HTTP_${response.status}`, credentialStatus: source.id === 'nasa-firms-archive' ? 'CONFIGURED_NOT_EMITTED' : 'NOT_REQUIRED', responseBytes: response.body.length, latencyMs: response.latencyMs };
  } catch (error) { return { accessStatus: 'NETWORK_BLOCKED', network: String(error.message ?? error), credentialStatus: source.id === 'nasa-firms-archive' ? 'CONFIGURED_NOT_EMITTED' : 'NOT_REQUIRED' }; }
}
export async function runCorpusDoctor({ fetchImpl = globalThis.fetch } = {}) {
  const rows = [];
  for (const source of CORPUS_SOURCES) rows.push({ source: source.id, provider: source.provider, ...(await probe(source, fetchImpl)), archivePeriod: source.archivePeriod, regionCoverage: source.regions, knowledgeTimeQuality: source.knowledgeTimeQuality, perimeterSequenceCapability: source.perimeterSequenceCapability, weatherRunCapability: source.weatherRunCapability, licenceStatus: licenceStatus(source), estimatedVolume: source.estimatedVolume, currentBlocker: source.blocker });
  return { schemaVersion: 'vigia.forecast-corpus-doctor.v1', sources: rows };
}
