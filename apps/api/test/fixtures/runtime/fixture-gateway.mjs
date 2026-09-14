import { SOURCE_DEFINITIONS } from '../../../src/modules/world/source-catalog.mjs';

const at = (base, minutes) => new Date(base.getTime() - minutes * 60_000).toISOString();
function synthetic(value) {
  if (Array.isArray(value)) return value.map(synthetic);
  if (!value || typeof value !== 'object') return value;
  return { ...Object.fromEntries(Object.entries(value).map(([key,item])=>[key,synthetic(item)])), provenance: { synthetic: true, universe: 'test' } };
}

function state(id, now, upstreamMinutes = 2) {
  return {
    id,
    ...SOURCE_DEFINITIONS[id],
    state: 'current',
    fetchedAt: now.toISOString(),
    upstreamAt: at(now, upstreamMinutes),
    error: null
  };
}

export class FixtureGateway {
  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
  }

  async snapshot() {
    const now = this.clock();
    const weather = [
      { id: 'w-viseu', name: 'Viseu', coordinate: [-7.92, 40.66], observedAt: at(now, 34), temperatureC: 36, humidityPercent: 21, windSpeedKph: 31, windDirectionId: 6, precipitationMm: 0 },
      { id: 'w-cb', name: 'Castelo Branco', coordinate: [-7.48, 39.82], observedAt: at(now, 28), temperatureC: 38, humidityPercent: 18, windSpeedKph: 27, windDirectionId: 5, precipitationMm: 0 },
      { id: 'w-leiria', name: 'Leiria', coordinate: [-8.81, 39.74], observedAt: at(now, 31), temperatureC: 33, humidityPercent: 32, windSpeedKph: 22, windDirectionId: 7, precipitationMm: 0 },
      { id: 'w-faro', name: 'Faro', coordinate: [-7.93, 37.02], observedAt: at(now, 36), temperatureC: 35, humidityPercent: 27, windSpeedKph: 24, windDirectionId: 4, precipitationMm: 0 }
    ];
    const fires = [
      { id: 'fx-1', nature: 'Incêndio rural', status: 'active', district: 'Viseu', municipality: 'São Pedro do Sul', parish: 'Pindelo dos Milagres', municipalityCode: '1816', coordinate: [-8.045, 40.755], startedAt: at(now, 47), updatedAt: at(now, 3), operatives: 82, ground: 23, aerial: 2, important: true, resourceBand: 'very-high' },
      { id: 'fx-2', nature: 'Incêndio rural', status: 'active', district: 'Castelo Branco', municipality: 'Proença-a-Nova', parish: 'Sobreira Formosa', municipalityCode: '0508', coordinate: [-7.79, 39.77], startedAt: at(now, 82), updatedAt: at(now, 4), operatives: 51, ground: 16, aerial: 1, important: false, resourceBand: 'high' },
      { id: 'fx-3', nature: 'Incêndio em mato', status: 'active', district: 'Leiria', municipality: 'Pedrógão Grande', parish: '', municipalityCode: '1013', coordinate: [-8.145, 39.92], startedAt: at(now, 25), updatedAt: at(now, 2), operatives: 24, ground: 7, aerial: 0, important: false, resourceBand: 'moderate' },
      { id: 'fx-4', nature: 'Incêndio rural', status: 'active', district: 'Faro', municipality: 'Monchique', parish: 'Alferce', municipalityCode: '0809', coordinate: [-8.49, 37.32], startedAt: at(now, 67), updatedAt: at(now, 6), operatives: 39, ground: 11, aerial: 1, important: false, resourceBand: 'high' }
    ];
    const riskToday = [
      { id: '1816', municipalityCode: '1816', name: 'São Pedro do Sul', coordinate: [-8.08, 40.76], level: 5, label: 'Maximum', forecastDay: now.toISOString().slice(0, 10) },
      { id: '1823', municipalityCode: '1823', name: 'Viseu', coordinate: [-7.91, 40.66], level: 5, label: 'Maximum', forecastDay: now.toISOString().slice(0, 10) },
      { id: '0508', municipalityCode: '0508', name: 'Proença-a-Nova', coordinate: [-7.92, 39.75], level: 5, label: 'Maximum', forecastDay: now.toISOString().slice(0, 10) },
      { id: '0502', municipalityCode: '0502', name: 'Castelo Branco', coordinate: [-7.49, 39.82], level: 5, label: 'Maximum', forecastDay: now.toISOString().slice(0, 10) },
      { id: '1013', municipalityCode: '1013', name: 'Pedrógão Grande', coordinate: [-8.14, 39.92], level: 4, label: 'Very high', forecastDay: now.toISOString().slice(0, 10) },
      { id: '0809', municipalityCode: '0809', name: 'Monchique', coordinate: [-8.56, 37.32], level: 5, label: 'Maximum', forecastDay: now.toISOString().slice(0, 10) },
      { id: '0603', municipalityCode: '0603', name: 'Arganil', coordinate: [-8.05, 40.22], level: 4, label: 'Very high', forecastDay: now.toISOString().slice(0, 10) },
      { id: '0402', municipalityCode: '0402', name: 'Bragança', coordinate: [-6.76, 41.81], level: 4, label: 'Very high', forecastDay: now.toISOString().slice(0, 10) }
    ];
    const earthObservations = riskToday.map((risk, index) => {
      const code = risk.municipalityCode;
      const latestAt = at(now, 7 + index * 3);
      const previousAt = at(now, 5_760 + index * 17);
      const latest = { id: `SYNTHETIC-${code}-CURRENT`, acquiredAt: latestAt, cloudCover: 4 + index * 3, previewUrl: `/assets/fixtures/locations/${code}-current.webp`, bbox: [risk.coordinate[0] - .16, risk.coordinate[1] - .11, risk.coordinate[0] + .16, risk.coordinate[1] + .11], fixture: true };
      const previous = { id: `SYNTHETIC-${code}-BEFORE`, acquiredAt: previousAt, cloudCover: 3 + index * 2, previewUrl: `/assets/fixtures/locations/${code}-before.webp`, bbox: latest.bbox, fixture: true };
      const older = { id: `SYNTHETIC-${code}-OLDER`, acquiredAt: at(now, 11_520 + index * 31), cloudCover: 8 + index, previewUrl: `/assets/fixtures/locations/${code}-before.webp`, bbox: latest.bbox, fixture: true };
      return { id: `fixture-${code}`, label: risk.name, municipalityCode: code, coordinate: risk.coordinate, latest, previous, scenes: [latest, previous, older], availableCount: 3 };
    });
    const history = riskToday.flatMap((risk, riskIndex) => Array.from({ length: 2 + (riskIndex % 5) }, (_, index) => ({
      id: `history:${risk.id}:${index}`,
      coordinate: [risk.coordinate[0] + index * 0.01, risk.coordinate[1] - index * 0.008],
      year: now.getUTCFullYear() - (index % 2),
      municipality: risk.name,
      municipalityCode: risk.municipalityCode,
      cause: index % 2 ? 'Negligent use of fire' : 'Unknown',
      burnedAreaHa: 1.2 + index * 3.4,
      startedAt: `${now.getUTCFullYear() - (index % 2)}-07-${String(10 + index).padStart(2, '0')}T13:00:00Z`
    })));
    const thermalDetections = [
      { id: 't-1', coordinate: [-8.043, 40.757], observedAt: at(now, 11), confidence: 'high', frpMw: 18.2, satellite: 'S-NPP', instrument: 'VIIRS', source: 'NASA FIRMS fixture' },
      { id: 't-2', coordinate: [-7.795, 39.772], observedAt: at(now, 17), confidence: 'nominal', frpMw: 11.7, satellite: 'NOAA-20', instrument: 'VIIRS', source: 'NASA FIRMS fixture' },
      { id: 't-monchique-early', coordinate: [-8.493, 37.322], observedAt: at(now, 75), confidence: 'high', frpMw: 18, satellite: 'NOAA-20', instrument: 'VIIRS', source: 'NASA FIRMS fixture' },
      { id: 't-monchique-mid', coordinate: [-8.491, 37.321], observedAt: at(now, 60), confidence: 'high', frpMw: 34, satellite: 'NOAA-21', instrument: 'VIIRS', source: 'NASA FIRMS fixture' },
      { id: 't-monchique-latest', coordinate: [-8.489, 37.319], observedAt: at(now, 46), confidence: 'high', frpMw: 57, satellite: 'S-NPP', instrument: 'VIIRS', source: 'NASA FIRMS fixture' },
      { id: 't-satellite-only', coordinate: [-7.26, 39.92], observedAt: at(now, 9), confidence: 'high', frpMw: 23, satellite: 'NOAA-21', instrument: 'VIIRS', source: 'NASA FIRMS fixture' }
    ];

    const entries = {
      fires, riskToday, riskTomorrow: riskToday.map((item) => ({ ...item, level: Math.max(3, item.level - (item.id === '1816' ? 0 : 1)) })),
      weather,
      warnings: [{ id: 'warn-1', areaName: 'Viseu', type: 'Heat', level: 'orange', description: 'Persistent hot and dry conditions.', startAt: at(now, 80), endAt: at(now, -500) }],
      history,
      copernicus: earthObservations,
      firms: thermalDetections
    };

    return Object.fromEntries(Object.entries(entries).map(([id, data]) => [id, {
      id,
      data: synthetic(data),
      state: state(id === 'copernicus' || id === 'firms' ? id : id, now, id === 'history' ? 720 : 2)
    }]));
  }
}
