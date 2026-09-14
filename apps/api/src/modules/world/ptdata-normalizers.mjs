import { inferResourceBand } from '../../../../../packages/domain/src/resource-band.mjs';
import { isoOrNull, numberOrNull, textOr, unwrap } from '../../shared/values.mjs';

const PORTUGAL = Object.freeze({ west: -9.75, south: 36.7, east: -6, north: 42.3 });
const DISTRICT_NAMES = Object.freeze({
  '01': 'Aveiro', '02': 'Beja', '03': 'Braga', '04': 'Bragança', '05': 'Castelo Branco',
  '06': 'Coimbra', '07': 'Évora', '08': 'Faro', '09': 'Guarda', '10': 'Leiria',
  '11': 'Lisboa', '12': 'Portalegre', '13': 'Porto', '14': 'Santarém', '15': 'Setúbal',
  '16': 'Viana do Castelo', '17': 'Vila Real', '18': 'Viseu'
});

const MUNICIPALITY_FALLBACK = Object.freeze({
  '0401': 'Alfândega da Fé', '0402': 'Bragança', '0403': 'Carrazeda de Ansiães', '0404': 'Freixo de Espada à Cinta',
  '0405': 'Macedo de Cavaleiros', '0406': 'Miranda do Douro', '0407': 'Mirandela', '0408': 'Mogadouro',
  '0409': 'Torre de Moncorvo', '0410': 'Vila Flor', '0411': 'Vimioso', '0412': 'Vinhais',
  '0501': 'Belmonte', '0502': 'Castelo Branco', '0503': 'Covilhã', '0504': 'Fundão', '0505': 'Idanha-a-Nova',
  '0506': 'Oleiros', '0507': 'Penamacor', '0508': 'Proença-a-Nova', '0509': 'Sertã', '0510': 'Vila de Rei', '0511': 'Vila Velha de Ródão',
  '0901': 'Aguiar da Beira', '0902': 'Almeida', '0903': 'Celorico da Beira', '0904': 'Figueira de Castelo Rodrigo',
  '0905': 'Fornos de Algodres', '0906': 'Gouveia', '0907': 'Guarda', '0908': 'Manteigas', '0909': 'Mêda',
  '0910': 'Pinhel', '0911': 'Sabugal', '0912': 'Seia', '0913': 'Trancoso', '0914': 'Vila Nova de Foz Côa',
  '1201': 'Alter do Chão', '1202': 'Arronches', '1203': 'Avis', '1204': 'Campo Maior', '1205': 'Castelo de Vide',
  '1206': 'Crato', '1207': 'Elvas', '1208': 'Fronteira', '1209': 'Gavião', '1210': 'Marvão', '1211': 'Monforte',
  '1212': 'Nisa', '1213': 'Ponte de Sor', '1214': 'Portalegre', '1215': 'Sousel',
  '1401': 'Abrantes', '1402': 'Alcanena', '1403': 'Almeirim', '1404': 'Alpiarça', '1405': 'Benavente', '1406': 'Cartaxo',
  '1407': 'Chamusca', '1408': 'Constância', '1409': 'Coruche', '1410': 'Entroncamento', '1411': 'Ferreira do Zêzere',
  '1412': 'Golegã', '1413': 'Mação', '1414': 'Ourém', '1415': 'Rio Maior', '1416': 'Salvaterra de Magos',
  '1417': 'Santarém', '1418': 'Sardoal', '1419': 'Tomar', '1420': 'Torres Novas', '1421': 'Vila Nova da Barquinha',
  '1701': 'Alijó', '1702': 'Boticas', '1703': 'Chaves', '1704': 'Mesão Frio', '1705': 'Mondim de Basto',
  '1706': 'Montalegre', '1707': 'Murça', '1708': 'Peso da Régua', '1709': 'Ribeira de Pena', '1710': 'Sabrosa',
  '1711': 'Santa Marta de Penaguião', '1712': 'Valpaços', '1713': 'Vila Pouca de Aguiar', '1714': 'Vila Real',
  '1801': 'Armamar', '1802': 'Carregal do Sal', '1803': 'Castro Daire', '1804': 'Cinfães', '1805': 'Lamego',
  '1806': 'Mangualde', '1807': 'Moimenta da Beira', '1808': 'Mortágua', '1809': 'Nelas', '1810': 'Oliveira de Frades',
  '1811': 'Penalva do Castelo', '1812': 'Penedono', '1813': 'Resende', '1814': 'Santa Comba Dão', '1815': 'São João da Pesqueira',
  '1816': 'São Pedro do Sul', '1817': 'Sátão', '1818': 'Sernancelhe', '1819': 'Tabuaço', '1820': 'Tarouca',
  '1821': 'Tondela', '1822': 'Vila Nova de Paiva', '1823': 'Viseu', '1824': 'Vouzela'
});

const FIRE_PATTERN = /(incend|fogo|forest|florest|rural|mato|veget|queima)/i;
const WIND_DIRECTIONS = Object.freeze({ 0:null, 1:'N', 2:'NE', 3:'E', 4:'SE', 5:'S', 6:'SW', 7:'W', 8:'NW', 9:'N' });

function inMainland(lon, lat) {
  return lon >= PORTUGAL.west && lon <= PORTUGAL.east && lat >= PORTUGAL.south && lat <= PORTUGAL.north;
}

function coordinateOf(item) {
  const lat = numberOrNull(item.lat ?? item.latitude ?? item.y);
  const lon = numberOrNull(item.lon ?? item.lng ?? item.longitude ?? item.x);
  return lat !== null && lon !== null && inMainland(lon, lat) ? [lon, lat] : null;
}

function lookupName(lookup, code, fallback) {
  const key = String(code ?? '');
  const value = lookup?.get?.(key) ?? MUNICIPALITY_FALLBACK[key];
  return value || fallback;
}

function cleanPlaceName(value) {
  const place = textOr(value);
  if (!place) return null;
  return place.split(/\s+(?:Sem informa[cç][aã]o do n[uú]mero de meios|Informa[cç][aã]o recolhida via Fogos\.pt|Ponto de situa[cç][aã]o)\b/i)[0].trim() || null;
}

export function normalizeOccurrences(payload, municipalityLookup = new Map()) {
  return unwrap(payload, 'occurrences').map((item) => {
    const coordinate = coordinateOf(item);
    const nature = textOr(item.nature_desc ?? item.nature ?? item.description, 'Rural fire occurrence');
    const natureCode = textOr(item.nature_code ?? item.natureCode);
    if (!coordinate || !FIRE_PATTERN.test(`${natureCode} ${nature}`)) return null;
    const personnelValue = item.operatives ?? item.operacionais;
    const groundValue = item.ground ?? item.vehicles ?? item.meios_terrestres;
    const aerialValue = item.aerial ?? item.aircraft ?? item.meios_aereos;
    const resourceCount=value=>{const n=numberOrNull(value);return n!==null&&Number.isSafeInteger(n)&&n>=0?n:null;};
    const operatives = resourceCount(personnelValue);
    const ground = resourceCount(groundValue);
    const aerial = resourceCount(aerialValue);
    const important = Boolean(item.important ?? item.importante);
    return {
      id: String(item.id ?? item.occurrence_id ?? `${coordinate.join(':')}:${item.started_at ?? ''}`),
      natureCode,
      nature,
      status: textOr(item.status, 'active').toLowerCase(),
      statusBasis: textOr(item.status) ? 'EXPLICIT_PROVIDER_STATUS' : 'ACTIVE_FEED_MEMBERSHIP',
      district: textOr(item.district, 'Unknown district'),
      municipality: lookupName(municipalityLookup, item.municipality_code, textOr(item.municipality, 'Unknown municipality')),
      parish: cleanPlaceName(item.parish),
      districtCode: textOr(item.district_code),
      municipalityCode: textOr(item.municipality_code),
      coordinate,
      startedAt: isoOrNull(item.started_at ?? item.start_date ?? item.date),
      updatedAt: isoOrNull(item.updated_at ?? item.modified_at ?? item.edit_date),
      operatives,
      ground,
      aerial,
      resourceDataAvailable: [personnelValue, groundValue, aerialValue].some((value) => numberOrNull(value) !== null),
      important,
      resourceBand: inferResourceBand({ operatives, ground, aerial, important })
    };
  }).filter(Boolean).sort((a, b) => b.operatives - a.operatives || b.aerial - a.aerial);
}

function riskMunicipalityName(item, lookup) {
  const code = String(item.municipality_code ?? item.dico ?? '');
  const direct = textOr(item.municipality ?? item.name);
  const dico = textOr(item.dico);
  if (direct) return direct;
  if (dico && !/^\d{4}$/.test(dico)) return dico;
  const fallback = lookup?.get?.(code) ?? MUNICIPALITY_FALLBACK[code];
  if (fallback) return fallback;
  const district = DISTRICT_NAMES[code.slice(0, 2)];
  return district ? `${district} district · code ${code || 'unknown'}` : `Unknown municipality · ${code || 'coordinate only'}`;
}

export function normalizeRisk(payload, municipalityLookup = new Map()) {
  return unwrap(payload, 'risks').map((item) => {
    const coordinate = coordinateOf(item);
    const level = numberOrNull(item.risk_level ?? item.level ?? item.rcm);
    if (!coordinate || level === null) return null;
    if(!Number.isInteger(level)||level<1||level>5)return null;
    const safeLevel = level;
    return {
      id: String(item.municipality_code ?? item.dico ?? coordinate.join(':')),
      municipalityCode: textOr(item.municipality_code),
      name: riskMunicipalityName(item, municipalityLookup),
      district: DISTRICT_NAMES[String(item.municipality_code ?? item.dico ?? '').slice(0, 2)] ?? null,
      coordinate,
      level: safeLevel,
      label: textOr(item.risk_label ?? item.label, ['', 'Low', 'Moderate', 'High', 'Very high', 'Maximum'][safeLevel]),
      forecastDay: isoOrNull(item.forecast_day)?.slice(0, 10) ?? textOr(item.forecast_day)
    };
  }).filter(Boolean);
}

export function normalizeWeather(payload) {
  const latest = new Map();
  for (const item of unwrap(payload, 'observations')) {
    const coordinate = coordinateOf(item);
    if (!coordinate) continue;
    const observation = {
      id: String(item.station_id ?? item.id ?? coordinate.join(':')),
      name: textOr(item.station_name ?? item.name, 'IPMA station'),
      coordinate,
      observedAt: isoOrNull(item.observed_at ?? item.time ?? item.timestamp),
      temperatureC: numberOrNull(item.temperature ?? item.temperatura),
      humidityPercent: numberOrNull(item.humidity ?? item.humidade),
      windSpeedKph: numberOrNull(item.wind_speed_kmh ?? item.intensidadeVentoKM),
      windDirectionId: numberOrNull(item.wind_dir_id ?? item.idDireccVento),
      windDirection: WIND_DIRECTIONS[numberOrNull(item.wind_dir_id ?? item.idDireccVento)] ?? null,
      precipitationMm: numberOrNull(item.precipitation ?? item.precAcumulada)
    };
    const current = latest.get(observation.id);
    if (!current || String(observation.observedAt).localeCompare(String(current.observedAt)) > 0) latest.set(observation.id, observation);
  }
  return [...latest.values()];
}

export function normalizeWarnings(payload) {
  return unwrap(payload, 'warnings').map((item) => ({
    id: String(item.id ?? `${item.area_id}:${item.start_time}`),
    areaId: textOr(item.area_id),
    areaName: textOr(item.area_name, 'Portugal'),
    type: textOr(item.awareness_type, 'Weather'),
    level: textOr(item.awareness_level, 'yellow').toLowerCase(),
    description: textOr(item.description),
    startAt: isoOrNull(item.start_time),
    endAt: isoOrNull(item.end_time),
    districtCode: textOr(item.district_code)
  }));
}

export function normalizeHistory(payload) {
  return unwrap(payload, 'fires').map((item) => {
    const coordinate = coordinateOf(item);
    const startedAt = isoOrNull(item.alert_at ?? item.ignition_date ?? item.start_date ?? item.date);
    const year = numberOrNull(item.year ?? String(startedAt ?? '').slice(0, 4));
    return {
      id: String(item.id ?? item.fire_id ?? `${year}:${item.municipality ?? ''}:${item.ignition_date ?? ''}`),
      coordinate,
      year,
      district: textOr(item.district),
      municipality: textOr(item.municipality),
      parish: textOr(item.parish),
      locality: textOr(item.locality),
      municipalityCode: textOr(item.municipality_code),
      cause: textOr(item.cause ?? item.cause_desc ?? item.general_cause ?? item.cause_type),
      causeFamily: textOr(item.cause_family),
      fireType: textOr(item.fire_type),
      burnedAreaHa: numberOrNull(item.area_total_ha ?? item.total_area ?? item.burned_area ?? item.area_ha),
      startedAt,
      firstResponseAt: isoOrNull(item.first_response_at),
      extinctionAt: isoOrNull(item.extinction_at),
      durationMinutes: numberOrNull(item.duration_min),
      weather: {
        temperatureC: numberOrNull(item.temperature),
        humidityPercent: numberOrNull(item.humidity),
        windSpeedKph: numberOrNull(item.wind_speed),
        fwi: numberOrNull(item.fwi)
      }
    };
  });
}

export function upstreamTimestamp(payload) {
  return isoOrNull(payload?.meta?.timestamp ?? payload?.meta?.generated_at ?? payload?.updated_at);
}
