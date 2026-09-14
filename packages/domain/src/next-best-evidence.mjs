import { createHash } from 'node:crypto';
import { evidenceFamilyGroup } from './evidence-closure-plan.mjs';

const FAMILY_LABEL = Object.freeze({ viirs: 'VIIRS thermal', sentinel3_slstr: 'Sentinel-3 SLSTR FRP', sentinel2_msi: 'Sentinel-2 MSI optical', field: 'Field observation', domain_expert_review: 'Qualified expert review' });
function id(prefix, value) { return `${prefix}:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)}`; }
function normalized(value) { return String(value ?? '').trim().toLowerCase().replaceAll('-', '_'); }
function timeScore(minutes) { if (!Number.isFinite(minutes)) return 0; return minutes <= 30 ? 20 : minutes <= 180 ? 14 : minutes <= 720 ? 8 : 3; }

export function decideNextBestEvidence({ eventId, unknowns = [], currentEvidenceFamilies = [], candidates = [], now = new Date(), decisionVersion = 'vigia.next-best-evidence.v1' } = {}) {
  if (!eventId) throw new Error('event_id_required');
  const decidedAt = new Date(now).toISOString(), occupied = new Set(currentEvidenceFamilies.map(evidenceFamilyGroup));
  const options = candidates.map((candidate) => {
    const family = normalized(candidate.sourceFamily), independent = !occupied.has(evidenceFamilyGroup(family));
    const start = Date.parse(candidate.windowStart ?? ''), etaMinutes = Number.isFinite(start) ? Math.max(0, Math.ceil((start - Date.parse(decidedAt)) / 60_000)) : Number(candidate.etaMinutes);
    const contractFit = candidate.canCloseEvidenceNeed === true && independent ? 40 : candidate.canCloseEvidenceNeed === true ? 15 : 0;
    const independence = independent ? 25 : 0, timeliness = timeScore(etaMinutes), geometry = candidate.coverageAssumptions?.intersectionMethod || candidate.coverageAssumptions?.geometry ? 15 : 0;
    const executable = candidate.opportunityType === 'FIELD_CAPACITY' && !candidate.coverageAssumptions?.ownerId ? 0 : candidate.blockerReason ? 0 : 10;
    const score = contractFit + independence + timeliness + geometry + executable;
    return { id: id('evidence-path', { eventId, family, opportunityId: candidate.id ?? null, decisionVersion }), sourceFamily: family, label: FAMILY_LABEL[family] ?? family,
      opportunityId: candidate.id ?? null, opportunityType: candidate.opportunityType ?? 'UNKNOWN', etaMinutes: Number.isFinite(etaMinutes) ? etaMinutes : null,
      score, scoreComponents: { closureContractFit: contractFit, independentSourceFamily: independence, timeliness, eventSpecificGeometry: geometry, executablePath: executable },
      scoreQualification: 'Transparent ordinal operations ranking (max 110); not calibrated information gain, reliability, probability, or utility.',
      canCloseEvidenceNeed: candidate.canCloseEvidenceNeed === true && independent, authority: candidate.authority ?? 'VIGIA_UNKNOWN', blockerReason: candidate.blockerReason ?? null,
      dependencies: candidate.qualityDependencies ?? {}, unknownsAddressed: unknowns.map((item) => item.code ?? item).filter(Boolean) };
  }).sort((a, b) => b.score - a.score || (a.etaMinutes ?? Number.POSITIVE_INFINITY) - (b.etaMinutes ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id));
  const selected = options.find((item) => item.canCloseEvidenceNeed && !item.blockerReason) ?? options[0] ?? null;
  return Object.freeze({ id: id('next-best-evidence', { eventId, truth: unknowns, selected: selected?.id ?? null, decidedAt }), eventId: String(eventId), decidedAt, decisionVersion,
    selectedPathId: selected?.id ?? null, selected, options, unmeasuredDimensions: ['validated_information_gain', 'empirical_path_reliability', 'comparable_financial_cost'],
    notice: 'Ranking is recomputed from attributable evidence, closure fit, independence, timing, geometry and executability. Unknown dimensions remain null.' });
}

export function evidenceCandidates({ event = {}, opportunities = [] } = {}) {
  const candidates = [...opportunities];
  for (const family of ['viirs', 'sentinel3_slstr', 'sentinel2_msi']) if (!candidates.some((item) => normalized(item.sourceFamily) === family)) candidates.push({ id: `unavailable:${event.id}:${family}`, sourceFamily: family, opportunityType: 'UNKNOWN', authority: 'NO_GOVERNED_OPPORTUNITY', blockerReason: 'No event-specific governed opportunity is currently available.', canCloseEvidenceNeed: false });
  candidates.push({ id: `field:${event.id}`, sourceFamily: 'field', opportunityType: 'FIELD_CAPACITY', authority: 'MANUAL_ASSIGNMENT_REQUIRED', coverageAssumptions: { ownerId: null }, qualityDependencies: { requiresOwnerAcknowledgement: true, requiresAttributableEvidence: true }, blockerReason: 'No field owner has accepted this path.', canCloseEvidenceNeed: true });
  candidates.push({ id: `expert:${event.id}`, sourceFamily: 'domain_expert_review', opportunityType: 'FIELD_CAPACITY', authority: 'QUALIFIED_REVIEWER_REQUIRED', coverageAssumptions: { ownerId: null }, qualityDependencies: { requiresQualifiedReviewer: true }, blockerReason: 'No qualified reviewer has accepted this path.', canCloseEvidenceNeed: false });
  return candidates;
}
