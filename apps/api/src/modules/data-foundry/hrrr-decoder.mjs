import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { createDataContract, evaluateDataContract } from '../../../../../packages/domain/src/data-foundry/index.mjs';

const execute = promisify(execFile), MAX_MESSAGE_BYTES = 12 * 1024 * 1024;
const REQUIRED = Object.freeze(['temperature_2m', 'relative_humidity_2m', 'wind_u_10m', 'wind_v_10m']);
const CONTRACT = createDataContract({ id: 'noaa-hrrr-incident-slice', version: '1.0.0', productId: 'incident-local-weather', requiredFields: ['decoder', 'decoderVersion', 'fields'], maximumBytes: 8 * 1024 * 1024, requireKnowledgeTime: true, requireLineage: true, requiredLicenceIds: ['NOAA-HRRR-PUBLIC-DATA'] });

async function hashFile(file) { const body = await readFile(file); return createHash('sha256').update(body).digest('hex'); }
function inside(root, candidate) { return candidate === root || candidate.startsWith(`${root}${path.sep}`); }

export function windVector(u, v) {
  if (![u, v].every(Number.isFinite)) throw new Error('hrrr_wind_vector_non_finite');
  return Object.freeze({ speedMps: Math.hypot(u, v), directionFromDegrees: (270 - Math.atan2(v, u) * 180 / Math.PI + 360) % 360 });
}

export async function decodeHrrrIncidentSlice({ projectRoot = process.cwd(), bronzeDirectory, weatherRun, rawProducts, incidentId, bbox, gridSide = 32, pythonPath } = {}) {
  const bronze = await realpath(bronzeDirectory), products = new Map(rawProducts.map((item) => [item.id, item])), fields = [];
  for (const field of weatherRun.fields ?? []) {
    const product = products.get(field.rawProductId); if (!product) throw new Error(`hrrr_raw_product_missing:${field.rawProductId}`);
    const candidate = await realpath(path.resolve(bronze, product.originalUriOrObjectKey)); if (!inside(bronze, candidate)) throw new Error('hrrr_raw_path_outside_bronze');
    const fileStat = await stat(candidate); if (!fileStat.isFile() || fileStat.size > MAX_MESSAGE_BYTES || fileStat.size !== product.byteLength) throw new Error('hrrr_raw_size_invalid');
    if (await hashFile(candidate) !== product.checksumSha256) throw new Error('hrrr_raw_hash_mismatch');
    fields.push({ path: candidate, sha256: product.checksumSha256, variable: field.variable, nativeUnits: field.units, messageIndex: field.gribMessage });
  }
  for (const variable of REQUIRED) if (!fields.some((field) => field.variable === variable)) throw new Error(`hrrr_required_variable_missing:${variable}`);
  const executable = pythonPath ?? path.join(projectRoot, '.venv/bin/python'), worker = path.join(path.dirname(fileURLToPath(import.meta.url)), 'decode_hrrr_grib.py'); await Promise.all([access(executable), access(worker)]);
  const request = { bbox, gridSide, fields }, started = performance.now(); let stdout;
  try { ({ stdout } = await execute(executable, [worker, '--request-json', JSON.stringify(request)], { timeout: 45_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, env: { PATH: path.dirname(executable), GDAL_DISABLE_READDIR_ON_OPEN: 'EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS: '' } })); }
  catch (error) { const detail = String(error.stdout || error.stderr || error.message).slice(0, 1_000); throw new Error(`hrrr_decoder_failed:${detail}`); }
  let decoded; try { decoded = JSON.parse(stdout); } catch { throw new Error('hrrr_decoder_output_invalid'); }
  if (decoded.ok !== true || !Array.isArray(decoded.fields) || decoded.fields.some((field) => field.slice.values.some((value) => value != null && !Number.isFinite(value)))) throw new Error('hrrr_decoder_result_invalid');
  const missingValues = decoded.fields.reduce((sum, field) => sum + field.slice.missingValues, 0), content = { ...decoded, incidentId, weatherRunId: weatherRun.runId, issueTime: weatherRun.issueTime, validTimes: [...new Set(decoded.fields.map((field) => new Date(field.validTimeEpoch * 1_000).toISOString()))].sort(), bbox, interpolation: 'GDAL bilinear into bounded incident-local grid', missingValues, gust: { available: false, reason: 'GUST_MESSAGE_NOT_PRESENT_IN_RETAINED_BOUNDED_RUN' } };
  const contractResult = evaluateDataContract(CONTRACT, content, { bytes: Buffer.byteLength(JSON.stringify(content)), availableToVigiaAt: weatherRun.availableToVigiaAt, cutoff: weatherRun.availableToVigiaAt, lineageRoot: weatherRun.indexRawProductId, maturity: 'OPERATIONAL', licenceIds: ['NOAA-HRRR-PUBLIC-DATA'] });
  if (!contractResult.passed) throw new Error(`hrrr_contract_failed:${contractResult.state}`);
  const fingerprint = semanticHash('incident-weather-slice', content);
  return Object.freeze({ schemaVersion: 'vigia.incident-local-weather.v1', id: fingerprint, fingerprint, ...content, valuesDecoded: true, qualityState: 'CERTIFIED', contractResult, decodeDurationMs: Number((performance.now() - started).toFixed(3)) });
}
