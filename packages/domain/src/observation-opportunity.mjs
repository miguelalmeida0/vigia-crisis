import { bboxCovers } from './observation-integrity.mjs';
import { createHash } from 'node:crypto';

const CURRENT = new Set(['available', 'online', 'ready']);
const CONFIRMED = new Set(['confirmed', 'committed']);

function validTime(value) { return Number.isFinite(Date.parse(value ?? '')); }
function covers(record, coordinate) {
  const bbox = record.coverage?.bbox ?? record.bbox;
  return Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite) && bboxCovers(bbox, coordinate);
}
function common(record) {
  return {
    id: String(record.id), sourceId: String(record.sourceId ?? record.id), label: String(record.label ?? record.id),
    ownerId: record.ownerId ? String(record.ownerId) : null, evidenceRole: String(record.evidenceRole ?? 'physical_confirmation'),
    informationGain: { state: 'UNMEASURED', value: null }, reliability: { state: 'UNMEASURED', value: null },
    cost: { state: 'UNMEASURED', value: null }
  };
}

export function currentObservationOpportunity(option = {}) {
  if (!option.id || !CURRENT.has(String(option.status ?? 'available').toLowerCase())) return null;
  const owned=Boolean(option.ownerId);
  return {
    ...common(option), kind: 'CURRENT', methodType: String(option.type ?? 'connected_asset'), availability: owned?'AVAILABLE_NOW':'OWNER_UNRESOLVED',
    latency: Number.isFinite(Number(option.etaMinutes)) ? { state: 'ESTIMATED', value: Number(option.etaMinutes), unit: 'minutes', source: 'asset_registry' } : { state: 'UNMEASURED', value: null },
    endpointConfigured: Boolean(option.endpointConfigured), commitment: null,
    limitation: owned?'Availability and ETA are registry assertions. Completion is not assumed until the owner acknowledges and evidence is received.':'The registry marks the asset available, but no responsible owner is configured; it is not an executable acquisition path.'
  };
}

export function scheduledObservationOpportunity(record = {}, coordinate, { now = new Date(), horizonHours = 168 } = {}) {
  if (!record.id || !validTime(record.scheduledAt) || !validTime(record.confirmedAt) || !covers(record, coordinate)) return null;
  const scheduledMs = Date.parse(record.scheduledAt), nowMs = now.getTime();
  if (scheduledMs <= nowMs || scheduledMs > nowMs + horizonHours * 3_600_000 || !CONFIRMED.has(String(record.scheduleState).toLowerCase())) return null;
  if (!record.ownerId || !record.confirmationId) return null;
  return {
    ...common(record), kind: 'FUTURE', methodType: String(record.methodType ?? 'scheduled_source'), availability: 'SCHEDULED_CONFIRMED',
    scheduledAt: new Date(scheduledMs).toISOString(), latency: { state: 'SCHEDULED', value: Math.ceil((scheduledMs - nowMs) / 60_000), unit: 'minutes', source: 'confirmed_schedule' },
    commitment: { id: String(record.confirmationId), confirmedAt: new Date(record.confirmedAt).toISOString(), scheduleState: String(record.scheduleState) },
    coverage: { bbox: [...(record.coverage?.bbox ?? record.bbox)] },
    limitation: String(record.limitation ?? 'The opportunity is scheduled, but usable evidence still depends on acquisition, coverage, quality, ingest and review.')
  };
}

export function rankObservationOpportunities(options = []) {
  const availabilityRank = { AVAILABLE_NOW: 0, SCHEDULED_CONFIRMED: 1, ESTIMATED_CADENCE: 2, MANUAL_REQUEST: 3, PASS_DEPENDENT: 4, CREDENTIAL_REQUIRED: 5, OWNER_UNRESOLVED: 6 };
  const ranked = [...options].sort((a, b) => (availabilityRank[a.availability] ?? 9) - (availabilityRank[b.availability] ?? 9)
    || Number(a.latency?.value ?? Number.POSITIVE_INFINITY) - Number(b.latency?.value ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id));
  return {
    options: ranked,
    ranking: {
      state: 'PARTIAL_INFORMATION_GAIN_UNMEASURED', basis: ['evidence_contract_fit', 'confirmed_availability', 'time_to_observation'],
      missingDimensions: ['validated_information_gain', 'measured_reliability', 'comparable_cost'],
      notice: 'Ordering is operational feasibility, not a claimed information-gain estimate.'
    }
  };
}

export const OBSERVATION_OPPORTUNITY_TYPES = Object.freeze(['PREDICTED_ORBITAL_PASS', 'CONFIRMED_PROVIDER_PRODUCT', 'EXPECTED_CADENCE', 'FIELD_CAPACITY', 'UNKNOWN']);

export function createObservationOpportunity(input = {}, { now = new Date(), ttlHours = 24 } = {}) {
  if (!input.eventId) throw new Error('event_id_required');
  if (!input.sourceFamily) throw new Error('source_family_required');
  if (!OBSERVATION_OPPORTUNITY_TYPES.includes(input.opportunityType)) throw new Error('invalid_observation_opportunity_type');
  const createdAt = new Date(input.createdAt ?? now).toISOString();
  const windowStart = validTime(input.windowStart) ? new Date(input.windowStart).toISOString() : null;
  const windowEnd = validTime(input.windowEnd) ? new Date(input.windowEnd).toISOString() : null;
  if ((windowStart && !windowEnd) || (!windowStart && windowEnd) || (windowStart && Date.parse(windowEnd) < Date.parse(windowStart))) throw new Error('invalid_observation_window');
  if (['PREDICTED_ORBITAL_PASS', 'EXPECTED_CADENCE'].includes(input.opportunityType) && !windowStart) throw new Error('observation_window_required');
  const calculationVersion = String(input.calculationVersion ?? 'vigia.observation-opportunity.v2');
  const stable = JSON.stringify({ eventId: input.eventId, sourceFamily: input.sourceFamily, platform: input.platform, windowStart, windowEnd, opportunityType: input.opportunityType, authority: input.authority, calculationVersion });
  return Object.freeze({
    id: input.id ?? `opportunity:${createHash('sha256').update(stable).digest('hex').slice(0, 32)}`,
    eventId: String(input.eventId), sourceFamily: String(input.sourceFamily), platform: String(input.platform ?? input.sourceFamily),
    windowStart, windowEnd, opportunityType: input.opportunityType, authority: String(input.authority ?? 'VIGIA_UNKNOWN'),
    coverageAssumptions: input.coverageAssumptions ?? {}, qualityDependencies: input.qualityDependencies ?? {},
    blockerReason: input.blockerReason ? String(input.blockerReason) : null,
    evidenceNeedId: input.evidenceNeedId ? String(input.evidenceNeedId) : null,
    createdAt, expiresAt: new Date(input.expiresAt ?? (Date.parse(createdAt) + ttlHours * 3_600_000)).toISOString(),
    calculationVersion, canCloseEvidenceNeed: input.canCloseEvidenceNeed === true
  });
}
