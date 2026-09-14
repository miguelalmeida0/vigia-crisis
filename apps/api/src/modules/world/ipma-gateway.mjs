import { fetchJson } from '../../shared/fetch.mjs';
import { HttpAcquirer } from '../acquisition/http-acquirer.mjs';
import { SOURCE_DEFINITIONS } from './source-catalog.mjs';
import { IPMA_WARNING_AREAS } from '../../../../../packages/domain/src/operational-twin/ipma-warning-areas.mjs';

const WIND_DIRECTIONS = Object.freeze({ 0: null, 1: 'N', 2: 'NE', 3: 'E', 4: 'SE', 5: 'S', 6: 'SW', 7: 'W', 8: 'NW', 9: 'N' });
const numberOrNull = (value) => value===null||value===undefined||typeof value==='boolean'||String(value).trim()===''||Number(value)===-99?null:Number.isFinite(Number(value))?Number(value):null;
const utc = (value) => {
  if (!value) return null;
  const text = String(value);
  const parsed = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const latest = (values) => values.filter(Boolean).sort().at(-1) ?? null;

export function normalizeStations(payload, rawSourceProduct, receivedAt = null) {
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features)) throw new Error('ipma_station_schema_drift');
  return payload.features.map((feature) => {
    const properties = feature?.properties ?? {};
    const coordinate = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates?.slice(0, 2).map(Number) : null;
    if (coordinate?.length!==2 || !coordinate.every(Number.isFinite) || coordinate[0] < -10 || coordinate[0] > -6 || coordinate[1] < 36.5 || coordinate[1] > 42.5) return null;
    const observedAt = utc(properties.time);
    return {
      id: String(properties.idEstacao ?? coordinate.join(':')),
      name: String(properties.localEstacao ?? 'IPMA station'),
      coordinate,
      observedAt,
      receivedAt: rawSourceProduct?.receivedAt ?? receivedAt,
      measurementType: 'OBSERVED_REGIONAL',
      product: 'IPMA hourly surface station observations',
      measurementDefinitions: {
        temperature: { rawField: 'temperatura', statistic: 'hourly mean', periodMinutes: 60, heightM: 1.5 },
        humidity: { rawField: 'humidade', statistic: 'hourly mean', periodMinutes: 60, heightM: 1.5 },
        wind: { rawField: 'intensidadeVentoKM', statistic: 'wind speed; averaging interval not specified', periodMinutes: null, heightM: 10 },
        rain: { rawField: 'precAcumulada', statistic: 'accumulation', periodMinutes: 60, heightM: 1.5 },
        gust: { rawField: null, statistic: null, missingReason: 'FIELD_NOT_PROVIDED' }
      },
      temperatureC: numberOrNull(properties.temperatura),
      humidityPercent: numberOrNull(properties.humidade),
      windSpeedKph: numberOrNull(properties.intensidadeVentoKM),
      windDirectionId: numberOrNull(properties.idDireccVento),
      windDirection: /^(N|NE|E|SE|S|SW|W|NW)$/.test(properties.descDirVento) ? properties.descDirVento : WIND_DIRECTIONS[numberOrNull(properties.idDireccVento)] ?? null,
      precipitationMm: numberOrNull(properties.precAcumulada),
      pressureHpa: numberOrNull(properties.pressao),
      provenance: {
        synthetic: false,
        provider: 'IPMA',
        accessClass: 'PUBLIC_NO_AUTH',
        rawSourceProductId: rawSourceProduct?.id ?? null,
        checksumSha256: rawSourceProduct?.checksumSha256 ?? null,
        providerProductId: rawSourceProduct?.providerProductId ?? null,
        normalizerVersion: 'ipma-open-data-v1'
      }
    };
  }).filter(Boolean);
}

export function normalizeWarnings(payload, rawSourceProduct, receivedAt = null) {
  if (!Array.isArray(payload)) throw new Error('ipma_warning_schema_drift');
  return payload.map((item, index) => ({
    id: `IPMA:${item.idAreaAviso ?? 'PT'}:${item.awarenessTypeName ?? 'warning'}:${item.startTime ?? index}`,
    areaId: item.idAreaAviso ? String(item.idAreaAviso) : null,
    areaName: IPMA_WARNING_AREAS[item.idAreaAviso] ?? (item.idAreaAviso ? `IPMA warning area ${item.idAreaAviso}` : 'Portugal'),
    type: String(item.awarenessTypeName ?? 'Weather'),
    level: String(item.awarenessLevelID ?? 'unknown').toLowerCase(),
    description: String(item.text ?? '').trim(),
    startAt: utc(item.startTime),
    endAt: utc(item.endTime),
    issuedAt: null,
    receivedAt: rawSourceProduct?.receivedAt ?? receivedAt,
    provenance: {
      synthetic: false,
      provider: 'IPMA',
      accessClass: 'PUBLIC_NO_AUTH',
      rawSourceProductId: rawSourceProduct?.id ?? null,
      checksumSha256: rawSourceProduct?.checksumSha256 ?? null,
      providerProductId: rawSourceProduct?.providerProductId ?? null,
      normalizerVersion: 'ipma-open-data-v1'
    }
  }));
}

export class IpmaGateway {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 12_000, userAgent = 'VIGIA/10.0', clock = () => new Date(), acquisitionStore = null } = {}) {
    this.clock = clock;
    this.options = { fetchImpl, timeoutMs, userAgent };
    this.acquirer = acquisitionStore ? new HttpAcquirer({ store: acquisitionStore, fetchImpl, timeoutMs, userAgent, clock }) : null;
  }

  async #acquire(id, normalizer) {
    const definition = SOURCE_DEFINITIONS[id];
    const fetchedAt = this.clock().toISOString();
    try {
      let payload;
      let rawSourceProduct = null;
      if (this.acquirer) {
        const acquired = await this.acquirer.json({
          sourceId: `ipma:${id}`,
          provider: 'IPMA',
          url: definition.url,
          parserVersion: 'ipma-open-data-json-v1',
          licenceMetadata: { state: 'public_open_data_terms_apply', provider: 'IPMA', sourceUrl: 'https://api.ipma.pt/' },
          describe: async (value) => {
            const timestamps = id === 'ipmaWeather'
              ? value.features?.map((item) => utc(item?.properties?.time)) ?? []
              : []; // Effective/expiry times are not an issuance or observation clock.
            const sourceTimestamp = latest(timestamps);
            return { sourceTimestamp, providerProductId: `${id}:${sourceTimestamp ?? fetchedAt}`, normalizerVersion: 'ipma-open-data-v1' };
          }
        });
        payload = acquired.value;
        rawSourceProduct = acquired.rawSourceProduct;
      } else {
        payload = await fetchJson(definition.url, this.options);
      }
      const receivedAt = this.clock().toISOString();
      const data = normalizer(payload, rawSourceProduct, receivedAt);
      const upstreamAt = latest(data.map((item) => item.observedAt));
      return {
        id,
        data,
        state: {
          id,
          ...definition,
          state: 'current',
          configured: true,
          fetchedAt,
          upstreamAt,
          lastAcquisitionAttemptAt: fetchedAt,
          lastSuccessAt: receivedAt,
          latestSourceObservation: upstreamAt,
          accepted: data.length,
          rejected: Math.max(0,(id==='ipmaWeather'?payload.features.length:payload.length)-data.length),
          currentCoverage: id === 'ipmaWeather' ? 'Portugal mainland · reporting IPMA stations' : 'Portugal · IPMA warning areas',
          nextExpectedOpportunity: id === 'ipmaWeather' ? new Date(this.clock().getTime() + 3_600_000).toISOString() : null,
          rawSourceProductId: rawSourceProduct?.id ?? null,
          error: null,
          emptyProductMeaning: data.length ? null : (id === 'ipmaWarnings' ? 'Provider responded successfully with no current warning rows.' : 'Provider responded successfully with no mainland station rows.')
        }
      };
    } catch (error) {
      return { id, data: [], state: { id, ...definition, state: 'unavailable', configured: true, fetchedAt: null, upstreamAt: null, lastAcquisitionAttemptAt: fetchedAt, error: String(error.message ?? error) } };
    }
  }

  async snapshot() {
    const [weather, warnings] = await Promise.all([
      this.#acquire('ipmaWeather', normalizeStations),
      this.#acquire('ipmaWarnings', normalizeWarnings)
    ]);
    return { ipmaWeather: weather, ipmaWarnings: warnings };
  }
}
