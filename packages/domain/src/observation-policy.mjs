function ageHours(value, now) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.max(0, (now.getTime() - ms) / 3_600_000) : Number.POSITIVE_INFINITY;
}

function quality(scene, now) {
  const age = ageHours(scene?.acquiredAt, now);
  const cloud = Number.isFinite(Number(scene?.cloudCover)) ? Number(scene.cloudCover) : 55;
  const resolution=Number(scene?.resolutionMeters); const sensorScore = Number.isFinite(resolution)&&resolution<=3 ? 1.12 : scene?.sensor === 'Sentinel-2' ? 1 : scene?.sensor === 'Sentinel-1' ? .85 : .65;
  const freshness = Math.max(0, 1 - age / (24 * 20));
  const clarity = Math.max(.05, 1 - cloud / 100);
  return sensorScore * .35 + freshness * .4 + clarity * .25;
}

export function resolveObservation({ optical = [], radar = [], thermal = [], baseline = [], now = new Date() }) {
  const usableOptical = optical.filter((scene) => Number(scene.cloudCover ?? 100) <= 35).sort((a, b) => quality(b, now) - quality(a, now));
  const usableRadar = [...radar].sort((a, b) => Date.parse(b.acquiredAt) - Date.parse(a.acquiredAt));
  const primary = usableOptical[0] ?? usableRadar[0] ?? thermal[0] ?? null;
  const comparisonPool = usableOptical.length > 1 ? usableOptical.slice(1) : usableRadar.slice(primary?.sensor === 'Sentinel-1' ? 1 : 0);
  const comparable = comparisonPool.find((scene) => Math.abs(ageHours(scene.acquiredAt, now) - ageHours(primary?.acquiredAt, now)) >= 24 * 5) ?? comparisonPool[0] ?? null;
  const primaryAgeHours = primary ? ageHours(primary.acquiredAt, now) : null;
  return {
    primary,
    comparable,
    radarFallback: primary?.sensor === 'Sentinel-1',
    baseline: baseline[0] ?? null,
    currentCondition: primaryAgeHours === null ? 'unavailable' : primaryAgeHours <= 72 ? 'current' : primaryAgeHours <= 24 * 14 ? 'usable' : 'stale',
    primaryAgeHours,
    quality: primary ? Math.round(quality(primary, now) * 100) : 0,
    notice: primary ? 'Best currently available observation selected using freshness, cloud and sensor suitability.' : 'No defensible current observation is available.'
  };
}
