import { isoOrNull, numberOrNull, textOr } from '../../shared/values.mjs';

export const FIRMS_NORMALIZER_VERSION = 'vigia-firms-viirs-v3-native-quality';

export function firmsObservedAt(row) {
  const date = textOr(row.acq_date);
  const rawTime = textOr(row.acq_time).padStart(4, '0');
  if (!date) return null;
  return isoOrNull(`${date}T${rawTime.slice(0, 2)}:${rawTime.slice(2)}:00Z`);
}

export function firmsSatelliteLabel(raw, sourceKey = '') {
  const value = String(raw ?? '').trim().toUpperCase();
  if (sourceKey.includes('NOAA20') || sourceKey.includes('JPSS1') || ['N20', 'NOAA-20', 'NOAA20'].includes(value)) return 'VIIRS NOAA-20';
  if (sourceKey.includes('NOAA21') || sourceKey.includes('JPSS2') || ['N21', 'NOAA-21', 'NOAA21'].includes(value)) return 'VIIRS NOAA-21';
  if (sourceKey.includes('SNPP') || ['N', 'S', 'SNPP', 'S-NPP', 'SUOMI-NPP'].includes(value)) return 'VIIRS S-NPP';
  return value ? `VIIRS ${value}` : 'VIIRS';
}

export function normalizeFirmsRow(row, index, sourceKey, provenance = {}) {
  const lat = numberOrNull(row.latitude);
  const lon = numberOrNull(row.longitude);
  if (lat === null || lon === null) return null;
  const satellite = firmsSatelliteLabel(row.satellite, sourceKey);
  const hotspotType = numberOrNull(row.type);
  return {
    id: String(row.id ?? `${sourceKey}:${row.acq_date}:${row.acq_time}:${lat}:${lon}:${index}`),
    coordinate: [lon, lat],
    observedAt: firmsObservedAt(row),
    confidence: textOr(row.confidence),
    dayNight: ({ D: 'DAY', N: 'NIGHT' })[textOr(row.daynight).toUpperCase()] ?? null,
    frpMw: numberOrNull(row.frp),
    brightnessK: numberOrNull(row.bright_ti4 ?? row.brightness),
    scanKm: numberOrNull(row.scan),
    trackKm: numberOrNull(row.track),
    nominalResolutionKm: .375,
    hotspotType,
    hotspotClass: ({ 0: 'presumed_vegetation_fire', 1: 'active_volcano', 2: 'other_static_land_source', 3: 'offshore_detection' })[hotspotType] ?? 'unclassified',
    satellite,
    instrument: 'VIIRS',
    source: 'NASA FIRMS VIIRS',
    sourceKey,
    sourceFamily: 'viirs',
    independenceGroup: satellite.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    measurementType: 'viirs_mwir_thermal_anomaly_frp',
    provenance: {
      synthetic: false,
      provider: 'NASA FIRMS',
      normalizerVersion: FIRMS_NORMALIZER_VERSION,
      ...provenance
    }
  };
}

export function normalizeFirmsRows(rows, sourceKey, provenance = {}) {
  return rows.map((row, index) => normalizeFirmsRow(row, index, sourceKey, provenance)).filter(Boolean);
}

export function firmsDetectionKey(item) {
  return `${item.satellite}:${item.observedAt}:${item.coordinate.map((value) => Number(value).toFixed(4)).join(':')}`;
}
