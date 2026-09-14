import { trustedFetch } from '../reality-network/trusted-endpoint.mjs';

const HOST = 'noaa-hrrr-bdp-pds.s3.amazonaws.com';
const VARIABLES = Object.freeze({
  'TMP:2 m above ground': { variable: 'temperature_2m', units: 'K', level: '2 m above ground' },
  'RH:2 m above ground': { variable: 'relative_humidity_2m', units: '%', level: '2 m above ground' },
  'UGRD:10 m above ground': { variable: 'wind_u_10m', units: 'm s-1', level: '10 m above ground' },
  'VGRD:10 m above ground': { variable: 'wind_v_10m', units: 'm s-1', level: '10 m above ground' },
  'APCP:surface': { variable: 'precipitation', units: 'kg m-2', level: 'surface' },
});
const pad = (value) => String(value).padStart(2, '0');
function runBefore(cutoff) { const date = new Date(Date.parse(cutoff) - 60 * 60_000); date.setUTCMinutes(0, 0, 0); return date; }
function indexRows(body) {
  const lines = body.toString('utf8').trim().split(/\r?\n/), parsed = lines.map((line) => { const fields = line.split(':'); return { line, message: Number(fields[0]), offset: Number(fields[1]), identity: `${fields[3]}:${fields[4]}`, descriptor: fields.slice(2) }; });
  return parsed.map((row, index) => ({ ...row, end: parsed[index + 1]?.offset ? parsed[index + 1].offset - 1 : null }));
}
export async function acquireHrrrIssueRun({ cutoff, rawVault, manifest, fetchImpl = globalThis.fetch } = {}) {
  const run = runBefore(cutoff), date = `${run.getUTCFullYear()}${pad(run.getUTCMonth() + 1)}${pad(run.getUTCDate())}`, cycle = pad(run.getUTCHours()), step = 1;
  const base = `https://${HOST}/hrrr.${date}/conus/hrrr.t${cycle}z.wrfsfcf${pad(step)}.grib2`, indexUrl = `${base}.idx`;
  const indexResponse = await trustedFetch({ url: indexUrl, allowedHosts: [HOST], maxBytes: 256 * 1024, timeoutMs: 20_000, accept: 'application/octet-stream,text/plain', fetchImpl });
  if (!indexResponse.ok) throw new Error(`hrrr_index_http_${indexResponse.status}`);
  const indexRaw = await rawVault.preserve({ providerId: 'noaa-hrrr-archive', sourceId: 'hrrr:conus:index', providerProductId: `HRRR:${date}:${cycle}:sfc:f${pad(step)}:idx`, body: indexResponse.body, requestIdentity: indexResponse.requestIdentity, response: { ...indexResponse, sourceTimestamp: run.toISOString() }, licenceId: 'NOAA-HRRR-PUBLIC-DATA', parserVersion: 'vigia.hrrr-index.v1', requestWindow: { date, cycle, step }, fetchRunId: manifest.integrity.fingerprint, retrievedAt: indexResponse.retrievedAt });
  const selected = indexRows(indexResponse.body).filter((row) => VARIABLES[row.identity] && row.end != null), fields = [], rawProducts = [indexRaw.product];
  for (const row of selected) {
    const response = await trustedFetch({ url: base, allowedHosts: [HOST], headers: { range: `bytes=${row.offset}-${row.end}` }, maxBytes: 12 * 1024 * 1024, timeoutMs: 30_000, accept: 'application/octet-stream', fetchImpl });
    if (!response.ok || response.body.subarray(0, 4).toString('ascii') !== 'GRIB') throw new Error(`hrrr_grib_message_invalid:${row.message}`);
    const raw = await rawVault.preserve({ providerId: 'noaa-hrrr-archive', sourceId: 'hrrr:conus:message', providerProductId: `HRRR:${date}:${cycle}:sfc:f${pad(step)}:message:${row.message}`, body: response.body, requestIdentity: response.requestIdentity, response: { ...response, sourceTimestamp: run.toISOString() }, licenceId: 'NOAA-HRRR-PUBLIC-DATA', parserVersion: 'vigia.hrrr-grib-message.v1', requestWindow: { date, cycle, step, range: [row.offset, row.end], identity: row.identity }, fetchRunId: manifest.integrity.fingerprint, retrievedAt: response.retrievedAt });
    rawProducts.push(raw.product); const variable = VARIABLES[row.identity];
    fields.push({ ...variable, forecastStepHours: step, validTime: new Date(run.getTime() + step * 3_600_000).toISOString(), contentHash: `sha256:${raw.product.checksumSha256}`, rawProductId: raw.product.id, gribMessage: row.message });
  }
  const issueTime = run.toISOString();
  return { weatherRun: { model: 'NOAA HRRR', runId: `HRRR:${date}:${cycle}`, member: 'deterministic', runType: 'DETERMINISTIC_FORECAST', issueTime, availableToVigiaAt: new Date(run.getTime() + 60 * 60_000).toISOString(), availabilityBasis: 'DOCUMENTED_LATENCY_MODEL', retrievedAt: indexResponse.retrievedAt, archiveIdentity: base, grid: { id: 'HRRR-CONUS-3KM', resolution: '3 km', projection: 'Lambert conformal' }, coverage: { bbox: [-134.1, 21.1, -60.9, 52.6] }, fields, valuesDecoded: false, missingValues: null, indexRawProductId: indexRaw.product.id }, rawProducts };
}
