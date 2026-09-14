export function bboxCovers(bbox, coordinate) {
  if (!Array.isArray(bbox) || bbox.length < 4 || !Array.isArray(coordinate)) return false;
  const [west, south, east, north] = bbox.map(Number);
  const [lon, lat] = coordinate.map(Number);
  return [west, south, east, north, lon, lat].every(Number.isFinite)
    && lon >= west && lon <= east && lat >= south && lat <= north;
}

export function sceneAgeHours(acquiredAt, now = new Date()) {
  const time = Date.parse(acquiredAt);
  return Number.isFinite(time) ? Math.max(0, (now.getTime() - time) / 3_600_000) : null;
}

export function observationSuitability(scene, now = new Date()) {
  if (!scene?.acquiredAt) return { level: 'unavailable', reasons: ['Acquisition time unavailable'], currentEnough: false };
  const ageHours = sceneAgeHours(scene.acquiredAt, now);
  const cloud = Number.isFinite(Number(scene.cloudCover)) ? Number(scene.cloudCover) : null;
  const isRadar = scene.sensor === 'Sentinel-1';
  const currentEnough = ageHours !== null && ageHours <= 72;
  const cloudSuitable = isRadar || cloud === null || cloud <= 35;
  const level = currentEnough && cloudSuitable ? 'good' : ageHours !== null && ageHours <= 24 * 14 && cloudSuitable ? 'limited' : 'poor';
  const reasons = [
    ageHours === null ? 'Age unknown' : ageHours <= 24 ? 'Acquired within 24 hours' : ageHours <= 72 ? 'Acquired within 72 hours' : `Observation is ${Math.round(ageHours / 24)} days old`,
    isRadar ? 'Radar is not blocked by cloud' : cloud === null ? 'Cloud cover not reported' : `${Math.round(cloud)}% cloud cover`,
    scene.resolutionMeters ? `${scene.resolutionMeters} m nominal resolution` : 'Resolution not reported'
  ];
  return { level, reasons, currentEnough, cloudSuitable, ageHours, cloudCover: cloud };
}
