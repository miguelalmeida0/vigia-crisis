import { haversineKm } from '../../../../../packages/domain/src/geo.mjs';
import { nearestByCoordinate } from '../../shared/geo.mjs';

const CURRENT_MINUTES = 20;
const DELAYED_MINUTES = 180;
const VIIRS_MATCH_KM = 2.5;
const VIIRS_MATCH_HOURS = 8;

function ageMinutes(value, nowMs) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.UTC(2000, 0, 1)) return null;
  const age = (nowMs - timestamp) / 60_000;
  return age >= -5 ? Math.max(0, age) : null;
}

function freshnessFor(item, nowMs) {
  const value = item.updatedAt ?? item.startedAt;
  const age = ageMinutes(value, nowMs);
  if (age === null) return { state: 'unknown', ageMinutes: null, label: 'Update time unavailable' };
  if (age <= CURRENT_MINUTES) return { state: 'current', ageMinutes: age, label: 'Current' };
  if (age <= DELAYED_MINUTES) return { state: 'delayed', ageMinutes: age, label: 'Delayed' };
  return { state: 'stale', ageMinutes: age, label: 'Stale' };
}

function latestViirsMatch(incident, detections, nowMs) {
  const candidates = detections.map((item) => ({ item, distanceKm: haversineKm(incident.coordinate, item.coordinate), ageMinutes: ageMinutes(item.observedAt, nowMs) }))
    .filter((candidate) => candidate.distanceKm <= VIIRS_MATCH_KM && candidate.ageMinutes !== null && candidate.ageMinutes <= VIIRS_MATCH_HOURS * 60)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.ageMinutes - b.ageMinutes);
  const match = candidates[0];
  return match ? { ...match.item, distanceKm: match.distanceKm, ageMinutes: match.ageMinutes } : null;
}

function riskMatch(subject, risks) {
  const exact = risks.find((item) => item.municipalityCode && item.municipalityCode === subject.municipalityCode);
  if (exact) return { ...exact, distanceKm: 0 };
  const nearest = nearestByCoordinate(subject.coordinate, risks);
  return nearest ? { ...nearest.item, distanceKm: nearest.distanceKm } : null;
}

function weatherMatch(subject, weather) {
  const nearest = nearestByCoordinate(subject.coordinate, weather);
  return nearest ? { ...nearest.item, distanceKm: nearest.distanceKm } : null;
}

function urgency({ freshness, risk, weather, thermal, incident }) {
  let score = 12;
  if (freshness.state === 'current') score += 16;
  else if (freshness.state === 'delayed') score += 7;
  else if (freshness.state === 'stale') score -= 16;
  if (thermal) score += 24;
  score += Math.max(0, Number(risk?.level ?? 0) - 2) * 6;
  const humidity = Number(weather?.humidityPercent); const wind = Number(weather?.windSpeedKph);
  if (Number.isFinite(humidity) && humidity <= 25) score += 8;
  if (Number.isFinite(wind) && wind >= 25) score += 8;
  if (incident.aerial > 0) score += Math.min(8, incident.aerial * 2);
  if (incident.important) score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function band(score) {
  if (score >= 75) return 'critical-watch';
  if (score >= 55) return 'high';
  if (score >= 35) return 'elevated';
  return 'context';
}

function frpTrend(history = []) {
  const values = history.filter((item) => Number.isFinite(Number(item.frpMw))).slice(-4);
  if (values.length < 2) return { direction: 'unknown', deltaMw: null, deltaPercent: null };
  const first = Number(values[0].frpMw); const last = Number(values.at(-1).frpMw);
  const deltaMw = last - first; const deltaPercent = Math.abs(first) > .1 ? deltaMw / Math.abs(first) * 100 : null;
  return { direction: deltaMw > 3 ? 'rising' : deltaMw < -3 ? 'cooling' : 'steady', deltaMw, deltaPercent };
}

function sourceSummary(world, thermalMetadata) {
  return { occurrences: world.sources?.fires ?? null, weather: world.sources?.weather ?? null, fireRisk: world.sources?.riskToday ?? null, viirs: world.sources?.firms ?? null, thermal: thermalMetadata };
}

function nearestReport(detection, incidents) {
  const matches = incidents.map((item) => ({ item, distanceKm: haversineKm(detection.coordinate, item.coordinate) }))
    .filter((item) => Number.isFinite(item.distanceKm)).sort((a, b) => a.distanceKm - b.distanceKm);
  return matches[0] ?? null;
}

function alertForIncident(item) {
  if (item.thermal.viirsMatch) return { id: `thermal:${item.id}`, type: 'thermal-supported', severity: item.thermal.trend.direction === 'rising' ? 'critical' : 'high', incidentId: item.id, coordinate: item.coordinate, title: `${item.municipality} has independent thermal support`, detail: item.thermal.trend.direction === 'rising' ? 'VIIRS FRP trend is rising across recent detections.' : 'A recent VIIRS thermal point matches the public occurrence.' };
  if (item.freshness.ageMinutes !== null && item.freshness.ageMinutes <= 10) return { id: `new:${item.id}`, type: 'new-report', severity: item.urgency.score >= 75 ? 'critical' : 'high', incidentId: item.id, coordinate: item.coordinate, title: `New report near ${item.municipality}`, detail: `Public occurrence updated ${Math.max(0, Math.round(item.freshness.ageMinutes))} minutes ago.` };
  if (item.resources.deltaOperatives >= 10) return { id: `resources:${item.id}`, type: 'mobilization', severity: 'high', incidentId: item.id, coordinate: item.coordinate, title: `Resources increasing near ${item.municipality}`, detail: `Reported responders increased by ${item.resources.deltaOperatives} during this session.` };
  if (item.urgency.score >= 75 && item.freshness.state !== 'stale') return { id: `context:${item.id}`, type: 'high-attention', severity: 'high', incidentId: item.id, coordinate: item.coordinate, title: `${item.municipality} needs attention`, detail: 'Current report, fire danger and local weather context combine into the highest attention band.' };
  return null;
}

export class LiveFireService {
  #worldService; #thermalAdapter; #clock; #resourceHistory = new Map(); #thermalHistory = new Map();
  constructor({ worldService, thermalAdapter, clock = () => new Date() }) { this.#worldService = worldService; this.#thermalAdapter = thermalAdapter; this.#clock = clock; }

  async snapshot() {
    const now = this.#clock(); const nowMs = now.getTime();
    const [world, thermalMetadata] = await Promise.all([
      this.#worldService.snapshot(),
      this.#thermalAdapter.metadata().catch((error) => ({ state: 'unavailable', selectedProvider: null, selected: null, providers: [], error: String(error.message ?? error), fetchedAt: now.toISOString() }))
    ]);
    const fires = world.fires ?? []; const detections = world.thermalDetections ?? [];
    const incidents = fires.map((incident) => this.#incident(incident, world, nowMs)).sort((a, b) => b.urgency.score - a.urgency.score || Number(a.freshness.ageMinutes ?? 1e9) - Number(b.freshness.ageMinutes ?? 1e9));
    const thermalCandidates = detections.map((detection) => this.#thermalCandidate(detection, incidents, world, nowMs)).filter(Boolean);
    const alerts = [...incidents.map(alertForIncident).filter(Boolean), ...thermalCandidates.map((item) => ({ id: `unmatched:${item.id}`, type: 'satellite-only', severity: Number(item.frpMw) >= 20 ? 'critical' : 'high', thermalId: item.id, coordinate: item.coordinate, title: 'Satellite thermal signal has no nearby active report', detail: `${item.satellite || 'VIIRS'} · ${Number.isFinite(Number(item.frpMw)) ? `${Math.round(item.frpMw)} MW · ` : ''}${Math.round(item.nearestReportKm ?? 999)} km from the nearest current report.` }))]
      .sort((a, b) => ({ critical: 0, high: 1, elevated: 2 }[a.severity] ?? 3) - ({ critical: 0, high: 1, elevated: 2 }[b.severity] ?? 3));
    const current = incidents.filter((item) => item.freshness.state === 'current'); const supported = incidents.filter((item) => item.thermal.viirsMatch); const recent = incidents.filter((item) => Number(item.freshness.ageMinutes) <= 60);
    return {
      meta: { mode: world.meta?.mode ?? 'public-sources', region: 'Portugal mainland', generatedAt: now.toISOString(), refreshTargetSeconds: 30, notice: 'Near-real-time public-source wildfire intelligence. Source latency and detection limits remain visible; not an official emergency channel.' },
      summary: { activeReports: incidents.length, currentReports: current.length, reportsLastHour: recent.length, viirsSupported: supported.length, viirsPoints: detections.length, unmatchedThermal: thermalCandidates.length, maxRiskMunicipalities: (world.riskToday ?? []).filter((item) => Number(item.level) === 5).length, alertCount: alerts.length, highestUrgency: incidents[0]?.urgency ?? null },
      thermal: { ...thermalMetadata, overlayUrl: thermalMetadata.state === 'current' ? '/api/v4/live/thermal/overlay?provider=auto&time=latest' : null, replaySlots: thermalMetadata.selected?.timeSlots?.slice(-18) ?? [] },
      sources: sourceSummary(world, thermalMetadata), incidents, thermalCandidates, alerts,
      risk: (world.riskToday ?? []).filter((item) => Number(item.level) >= 4), warnings: world.warnings ?? []
    };
  }

  #incident(incident, world, nowMs) {
    const freshness = freshnessFor(incident, nowMs); const risk = riskMatch(incident, world.riskToday ?? []); const weather = weatherMatch(incident, world.weather ?? []); const viirsMatch = latestViirsMatch(incident, world.thermalDetections ?? [], nowMs);
    const resourceHistory = this.#remember(this.#resourceHistory, incident.id, { at: nowMs, operatives: incident.operatives, ground: incident.ground, aerial: incident.aerial }, 24); const resourceDelta = resourceHistory.length >= 2 ? Number(resourceHistory.at(-1).operatives) - Number(resourceHistory[0].operatives) : 0;
    const thermalHistory = viirsMatch ? this.#remember(this.#thermalHistory, incident.id, { at: Date.parse(viirsMatch.observedAt), frpMw: viirsMatch.frpMw }, 12) : []; const score = urgency({ freshness, risk, weather, thermal: viirsMatch, incident });
    return { ...incident, freshness, truthStage: viirsMatch ? 'corroborated' : 'reported', live: true, risk, weather, thermal: { state: viirsMatch ? 'matched' : world.sources?.firms?.state === 'not_configured' ? 'not_configured' : 'no_viirs_match', viirsMatch, trend: frpTrend(thermalHistory) }, resources: { deltaOperatives: resourceDelta }, urgency: { score, band: band(score) } };
  }

  #thermalCandidate(detection, incidents, world, nowMs) {
    const age = ageMinutes(detection.observedAt, nowMs); if (age === null || age > VIIRS_MATCH_HOURS * 60) return null;
    const nearest = nearestReport(detection, incidents); if (nearest && nearest.distanceKm <= VIIRS_MATCH_KM) return null;
    const subject = { coordinate: detection.coordinate }; const risk = riskMatch(subject, world.riskToday ?? []); const weather = weatherMatch(subject, world.weather ?? []);
    return { ...detection, id: `thermal:${detection.id}`, state: 'satellite-only', ageMinutes: age, nearestReportKm: nearest?.distanceKm ?? null, nearestReportId: nearest?.item?.id ?? null, risk, weather, operationalClaim: false, notice: 'Satellite-only thermal candidate. It is not a confirmed fire until independently correlated or locally verified.' };
  }

  #remember(store, id, value, limit) { const entries = store.get(id) ?? []; if (!entries.length || entries.at(-1).at !== value.at || JSON.stringify(entries.at(-1)) !== JSON.stringify(value)) entries.push(value); while (entries.length > limit) entries.shift(); store.set(id, entries); return entries; }
}

export { freshnessFor, latestViirsMatch, urgency, frpTrend };
