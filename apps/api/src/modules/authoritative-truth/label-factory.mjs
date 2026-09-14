import { fingerprint } from './contracts.mjs';
import { OFFICIAL_TRUTH_DOCTRINE } from './doctrine.mjs';
import { revisionIsAdmitted } from './network-repository.mjs';

const parse = (value) => value ? Date.parse(value) : NaN;
const explicitChronology = (revision) => ['EXPLICIT_PROVIDER_PUBLICATION_FIELD', 'LEGACY_EXPLICIT_PROVIDER_FIELD'].includes(revision.clocks?.chronologyBasis) && Number.isFinite(parse(revision.clocks.providerPublishedAt));

function eligibleRevision(revision) {
  return revision.authorityClass === OFFICIAL_TRUTH_DOCTRINE.strictLabelAuthorityClass && revision.quality?.valid === true && revision.rights?.permitScientificRetention === true && explicitChronology(revision);
}

export function buildIncrementalOfficialLabels(state, touchedIncidentIds, at) {
  const byId = new Map(state.revisions.map((item) => [item.revisionId, item])), existing = new Set(state.labels.map((item) => item.labelId)), created = [], rejected = [];
  for (const incidentId of [...new Set(touchedIncidentIds)]) {
    const sequences = Object.values(state.sequences).filter((item) => item.incidentId === incidentId && item.projectionState !== 'HISTORICAL_IDENTITY_BRANCH'); for (const sequence of sequences) { const revisions = sequence.revisionIds.map((id) => byId.get(id)).filter((item) => item && revisionIsAdmitted(state, item.revisionId)).filter(eligibleRevision).sort((a, b) => parse(a.clocks.providerPublishedAt) - parse(b.clocks.providerPublishedAt) || a.revisionId.localeCompare(b.revisionId));
    for (let issueIndex = 0; issueIndex < revisions.length - 1; issueIndex += 1) for (const [horizon, tolerance] of Object.entries(OFFICIAL_TRUTH_DOCTRINE.horizons)) {
      const issue = revisions[issueIndex], candidates = revisions.slice(issueIndex + 1).filter((later) => OFFICIAL_TRUTH_DOCTRINE.allowedRevisionClasses.includes(later.revisionClassification)).map((later) => ({ later, offsetMinutes: (parse(later.clocks.providerPublishedAt) - parse(issue.clocks.providerPublishedAt)) / 60_000 })).filter((item) => item.offsetMinutes >= tolerance.minimumOffset && item.offsetMinutes <= tolerance.maximumOffset && parse(item.later.clocks.availableToVigiaAt) > parse(issue.clocks.availableToVigiaAt)).sort((a, b) => Math.abs(a.offsetMinutes - tolerance.preferredOffset) - Math.abs(b.offsetMinutes - tolerance.preferredOffset) || a.later.revisionId.localeCompare(b.later.revisionId));
      if (!candidates.length) { rejected.push({ incidentId, issueRevisionId: issue.revisionId, horizon, reason: 'NO_ACCEPTED_LATER_REVISION_INSIDE_FIXED_TOLERANCE' }); continue; }
      const { later, offsetMinutes } = candidates[0], core = { schemaVersion: 'vigia.authoritative-perimeter-label.v1', incidentId, providerId: issue.providerId, region: issue.region, authorityClass: issue.authorityClass, issueRevisionId: issue.revisionId, laterRevisionId: later.revisionId, horizon, targetMinutes: tolerance.targetMinutes, minimumOffset: tolerance.minimumOffset, maximumOffset: tolerance.maximumOffset, preferredOffset: tolerance.preferredOffset, actualOffsetMinutes: Number(offsetMinutes.toFixed(3)), issueTime: issue.clocks.providerPublishedAt, issueAvailableToVigiaAt: issue.clocks.availableToVigiaAt, laterTruthTime: later.clocks.providerPublishedAt, laterTruthAvailableToVigiaAt: later.clocks.availableToVigiaAt, issueGeometryHash: issue.normalizedGeometryHash, laterGeometryHash: later.normalizedGeometryHash, laterRevisionClassification: later.revisionClassification, publicationChronologyRequirement: OFFICIAL_TRUTH_DOCTRINE.chronologyRequirement, geometryQuality: later.quality.quality, futureEvidenceInIssueFeatures: false, interpolationUsed: false, rights: later.rights, lineage: { issueRawObjectId: issue.rawObjectId, laterRawObjectId: later.rawObjectId, issueRevisionId: issue.revisionId, laterRevisionId: later.revisionId }, doctrineVersion: OFFICIAL_TRUTH_DOCTRINE.version };
      const label = { ...core, labelId: fingerprint('authoritative-perimeter-label', core) }; if (!existing.has(label.labelId)) { existing.add(label.labelId); state.labels.push(label); created.push(label); }
    }
    }
  }
  for (const label of created) { const eventCore = { schemaVersion: 'vigia.authoritative-truth-internal-event.v1', type: 'AUTHORITATIVE_FORECAST_LABEL_CREATED', occurredAt: at, incidentId: label.incidentId, labelId: label.labelId, horizon: label.horizon, authorityClass: label.authorityClass, externalConsequentialActions: 0, automationRequested: ['REBUILD_AFFECTED_EXAMPLES', 'RERUN_AFFECTED_BASELINES', 'RERUN_FORECAST_SCORING', 'RERUN_SCIENTIFIC_TRUTH_GATE', 'GENERATE_UPDATED_REPORT'] }; state.internalEvents.push({ ...eventCore, eventId: fingerprint('authoritative-truth-event', eventCore) }); }
  return { created, rejected, durationMs: 0 };
}

export function labelSummary(state) {
  const horizons = Object.fromEntries(Object.keys(OFFICIAL_TRUTH_DOCTRINE.horizons).map((name) => [name, state.labels.filter((item) => item.horizon === name).length])), incidentCounts = Object.fromEntries(Object.keys(horizons).map((name) => [name, new Set(state.labels.filter((item) => item.horizon === name).map((item) => item.incidentId)).size]));
  return { horizons, incidentCounts, total: state.labels.length, strictAuthorityClass: OFFICIAL_TRUTH_DOCTRINE.strictLabelAuthorityClass, sensorDerivedLabelsCounted: 0, doctrine: OFFICIAL_TRUTH_DOCTRINE };
}
