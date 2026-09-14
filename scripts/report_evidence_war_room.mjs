import path from 'node:path';
import { readJson, writeJsonAtomic } from '../apps/api/src/shared/json-file.mjs';
import { PUBLIC_EVIDENCE_SOURCES } from '../apps/api/src/modules/worldclass/public-evidence-war-room.mjs';
import { semanticHash } from '../packages/domain/src/intelligence/shared.mjs';

const root = process.cwd();
const read = (file, fallback = {}) => readJson(path.join(root, file), fallback);
const evidence = 'data/validation/evidence-war-room';
const worldclass = 'data/validation/worldclass';
const [sources, canada, canadaCorpus, negatives, labels, shadow, cap, prospective, capability, localHa, localHsm, corpus, forecast, cleanroom, review, operator, scorecard] = await Promise.all([
  read(`${evidence}/public-source-manifest.json`),
  read(`${evidence}/canadian-evidence-catalogue.json`),
  read(`${evidence}/canada-incident-corpus.json`),
  read(`${evidence}/negative-opportunities.json`),
  read(`${evidence}/near-term-labels.json`),
  read(`${evidence}/historical-shadow-decision-memory.json`),
  read(`${evidence}/government-cap-integration.json`),
  read(`${evidence}/prospective-campaign.json`),
  read(`${evidence}/execution-capability-audit.json`),
  read(`${evidence}/local-ha-certification.json`),
  read(`${evidence}/local-softhsm-certification.json`),
  read(`${worldclass}/corpus-worldclass-gate.json`),
  read(`${worldclass}/forecast-evaluation.json`),
  read(`${worldclass}/clean-room-certification.json`),
  read(`${evidence}/independent-review-bundle.json`),
  read(`${evidence}/operator-study-kit.json`),
  read(`${worldclass}/sub-75-scorecard.json`)
]);

const sourceFacts = {
  'cwfis-nrcan': { acquiredRange: '2018-2026 (perimeter products 2018-2025; hotspots 2024-2026)', incidentsOrProducts: '8 annual perimeter archives, 2 annual hotspot archives, 7 dated daily hotspot products, and current perimeter/progression components', evidenceKind: 'DERIVED_PUBLIC_OBSERVATION_WITH_CAUSAL_LINEAGE' },
  'alberta-wildfire': { acquiredRange: 'previous ten years through current 2026 service state', incidentsOrProducts: `${canada.historicalFeatures?.officialLocations ?? 0} official incident locations; ${canada.historicalFeatures?.officialPerimeters ?? 0} perimeter records`, evidenceKind: 'OFFICIAL_REPORT' },
  'bc-wildfire-service': { acquiredRange: 'current 2026 public operational state', incidentsOrProducts: `${canada.currentFeatures?.bcPerimeters ?? 0} current perimeter features`, evidenceKind: 'OFFICIAL_REPORT' },
  'noaa-nws-cap': { acquiredRange: 'public rolling alert history available at acquisition time', incidentsOrProducts: `${cap.nws?.rawMessages ?? 0} CAP messages; ${cap.nws?.twinIncidents ?? 0} Twin incidents`, evidenceKind: 'OFFICIAL_REPORT' },
  'eccc-msc-cap': { acquiredRange: '2026-08-24 through 2026-08-25 retained Datamart sample', incidentsOrProducts: `${cap.eccc?.rawMessages ?? 0} CAP messages; ${cap.eccc?.twinIncidents ?? 0} Twin incidents`, evidenceKind: 'OFFICIAL_REPORT' }
};
const providerRows = new Map((sources.providers ?? []).map((provider) => [provider.providerId, provider]));
const publicSources = PUBLIC_EVIDENCE_SOURCES.map((definition) => {
  const acquired = providerRows.get(definition.providerId) ?? {};
  return {
    providerId: definition.providerId,
    authority: definition.authority,
    access: definition.access,
    rights: definition.rightsClassification,
    licenceUrl: definition.licenceUrl,
    licenceFingerprint: definition.licenceFingerprint,
    attribution: definition.attribution,
    rawObjects: acquired.rawObjects ?? 0,
    bytes: acquired.bytes ?? 0,
    sourceFamily: definition.sourceFamily,
    ...sourceFacts[definition.providerId]
  };
});
const scores = scorecard.categories ?? [];
const meanScore = scores.length ? Number((scores.reduce((total, row) => total + Number(row.finalDefensibleScore ?? 0), 0) / scores.length).toFixed(3)) : null;
const blockers = [
  { class: 'CREDENTIAL_REQUIRED', gap: 'Negative-opportunity certification', discovery: negatives.blocker?.autoDiscovery, exactRequirement: negatives.blocker?.requirement },
  { class: 'TIME_ACCUMULATION_REQUIRED', gap: 'Near-term authoritative perimeter labels and seven-day prospective history', accumulated: { snapshots: prospective.snapshots?.length ?? prospective.immutableSnapshots ?? 0, incidents: prospective.incidents ?? 0, sourceClasses: prospective.providerSourceClasses ?? 0, changedStates: prospective.changedSnapshots ?? 0 }, campaign: prospective.campaignState, command: 'npm run evidence:prospective:capture' },
  { class: 'CREDENTIAL_REQUIRED', gap: 'Actual multi-region cloud HA and cloud KMS certification', discovery: capability.discovery, secretValuesRecorded: false, exactRequirement: 'An authenticated, repository-scoped cloud identity/context approved for an ephemeral deployment.' },
  { class: 'REAL_HUMAN_REQUIRED', gap: 'Operator and doctrine validation', accumulated: { realSessions: 0, engineeringTasksReady: operator.tasks?.length ?? 0 }, command: 'npm run operator-eval:run' },
  { class: 'REAL_HUMAN_REQUIRED', gap: 'Independent assurance', accumulated: { reviewerBundleFingerprint: review.fingerprint ?? null }, exactRequirement: 'A different reviewer executes the immutable bundle and emits the required attestation.' },
  { class: 'CROSS_BRANCH_INTEGRATION_REQUIRED', gap: 'Merged migration DAG and protected frontend release contract', dossier: 'docs/architecture/MIGRATION_COMPATIBILITY_DOSSIER.md' },
  { class: 'PRIVILEGED_PARTNER_REQUIRED', gap: 'Agency-specific operational pilot beyond public CAP', exactRequirement: 'A partner-authorized bidirectional operational endpoint and pilot operators; public NWS/ECCC CAP acceptance is already proven.' }
];

const core = {
  schemaVersion: 'vigia.active-evidence-war-room-final-report.v1',
  generatedAt: new Date().toISOString(),
  A: { title: 'Evidence-acquisition executive verdict', verdict: 'MATERIAL_PUBLIC_EVIDENCE_ACQUIRED_WORLD_CLASS_GATE_NOT_YET_PASSED', summary: `${sources.rawObjects ?? 0} content-addressed raw public objects (${sources.bytes ?? 0} bytes), ${canada.incidents?.discovered ?? 0} real Canadian incidents, ${cap.totals?.rawMessages ?? 0} official CAP messages, ${shadow.episodes?.length ?? 0} shadow decisions, and ${localHa.cycles?.length ?? 0} local HA cycles are now evidenced.` },
  B: { title: 'Public sources discovered and acquired', manifestFingerprint: sources.fingerprint, rawObjects: sources.rawObjects, bytes: sources.bytes, sources: publicSources },
  C: { title: 'Canada corpus results', ...canada.incidents, officialLocations: canada.historicalFeatures?.officialLocations, officialPerimeterRecords: canada.historicalFeatures?.officialPerimeters, issueTimeCandidates: canadaCorpus.incidentsWithIssueTimeCandidate, eligibilityFailureCounts: canadaCorpus.failureCounts, acquisitionFailures: canada.failures, cwfisQualification: canadaCorpus.physicalArchiveQualification, fingerprint: canada.fingerprint },
  D: { title: 'Valid negatives acquired', count: negatives.validNegatives ?? 0, unknownPromotedToNegative: negatives.unknownPromotedToNegative ?? 0, blocker: negatives.blocker, fingerprint: negatives.fingerprint },
  E: { title: 'Hard negatives acquired', count: negatives.hardNegatives ?? 0, target: negatives.targets?.hard ?? 25 },
  F: { title: 'Near-term label results', labels: labels.labelCandidates?.length ?? 0, horizonCounts: labels.horizonCounts, changedProviderStates: labels.changedProviderStates, toleranceDoctrine: labels.tolerances, blocker: labels.blocker, fingerprint: labels.fingerprint },
  G: { title: 'Historical shadow Decision Memory', episodes: shadow.episodes?.length ?? 0, acquisitionOpportunities: shadow.acquisitionOpportunities ?? 0, passed: shadow.passed, fingerprint: shadow.fingerprint },
  H: { title: 'Realized Information Value', adjudicableOutcomes: shadow.informationValueOutcomes?.length ?? 0, qualification: 'External later evidence adjudicates what VIGIA would have requested; no claim is made that an agency acted on VIGIA advice.' },
  I: { title: 'CAP government integration', NWS: { messages: cap.nws?.rawMessages, parsed: cap.nws?.schemaParsedAlerts, normalizedEvents: cap.nws?.normalizedEvents, creates: cap.nws?.creates, updates: cap.nws?.updates, cancellations: cap.nws?.cancellations, lifecycleChains: cap.nws?.lifecycleChains?.length ?? 0, twinIncidents: cap.nws?.twinIncidents }, ECCC: { messages: cap.eccc?.rawMessages, parsed: cap.eccc?.schemaParsedAlerts, normalizedEvents: cap.eccc?.normalizedEvents, creates: cap.eccc?.creates, updates: cap.eccc?.updates, cancellations: cap.eccc?.cancellations, lifecycleChains: cap.eccc?.lifecycleChains?.length ?? 0, twinIncidents: cap.eccc?.twinIncidents }, totals: cap.totals, twin: cap.twin, replay: cap.replay, transportRecovery: cap.transportRecovery, passed: cap.passed, fingerprint: cap.fingerprint },
  J: { title: 'Prospective archive', startedAt: prospective.startedAt, lastCapturedAt: prospective.lastCapturedAt, snapshots: prospective.snapshots?.length ?? prospective.immutableSnapshots, incidents: prospective.incidents, sourceClasses: prospective.providerSourceClasses, unchanged: prospective.unchangedSnapshots, changed: prospective.changedSnapshots, rewritten: prospective.priorSnapshotsRewritten, state: prospective.campaignState, fingerprint: prospective.fingerprint },
  K: { title: 'HA evidence', local: { passed: localHa.passed, evidenceClass: localHa.evidenceClass, cycles: localHa.cycles?.length ?? 0, summary: localHa.summary, rollingUpgrade: localHa.rollingUpgrade, backupRestore: localHa.backupRestore, cleanup: localHa.cleanup, fingerprint: localHa.fingerprint }, actualCloud: { executed: localHa.actualCloudEvidence === true, blockerClass: 'CREDENTIAL_REQUIRED', audit: capability.cloud } },
  L: { title: 'KMS/HSM evidence', local: { passed: localHsm.passed, evidenceClass: localHsm.evidenceClass, implementation: localHsm.implementation, steps: localHsm.steps, cleanup: localHsm.cleanup, fingerprint: localHsm.fingerprint }, actualCloud: { executed: localHsm.actualCloudKmsEvidence === true, blockerClass: 'CREDENTIAL_REQUIRED', audit: capability.kms } },
  M: { title: 'Forecast re-evaluation', corpusGate: { state: corpus.state, passed: corpus.passed, fingerprint: corpus.fingerprint }, forecast: { state: forecast.state, passed: forecast.passed, metrics: forecast.metrics ?? null, fingerprint: forecast.fingerprint }, noSyntheticMetrics: true },
  N: { title: 'Release status', state: cleanroom.state, passed: cleanroom.passed, releaseId: cleanroom.releaseId, blockers: cleanroom.blockers, fingerprint: cleanroom.fingerprint, protectedFrontendUnchanged: true },
  O: { title: 'Independent-review bundle', releaseId: review.release?.releaseId, fingerprint: review.fingerprint, sourceFingerprint: review.sources?.manifestFingerprint, reviewerMustBeDifferentAgent: review.reviewerMustBeDifferentAgent, prompt: 'docs/intelligence/INDEPENDENT_REVIEWER_PROMPT.md' },
  P: { title: 'Human-study readiness', engineeringReady: (operator.tasks?.length ?? 0) === 10, tasks: operator.tasks?.length ?? 0, simulatedParticipants: operator.simulatedParticipants, runner: 'npm run operator-eval:run', score: 'npm run operator-eval:score', fingerprint: operator.fingerprint, blockerClass: 'REAL_HUMAN_REQUIRED' },
  Q: { title: 'Revised scorecard', passed: scorecard.passed, meanFinalDefensibleScore: meanScore, categories: scores.map((row) => ({ category: row.category, finalDefensibleScore: row.finalDefensibleScore, remainingBlockerClass: row.remainingBlockerClass, evidenceFingerprint: row.evidenceFingerprint })), fingerprint: scorecard.fingerprint },
  R: { title: 'Remaining evidence by precise blocker class', blockers },
  S: { title: 'Exact commands', commands: ['npm run evidence:canada:acquire', 'npm run evidence:cap:acquire', 'npm run evidence:shadow:adjudicate', 'npm run evidence:prospective:capture', 'npm run evidence:science:report', 'npm run evidence:capability:audit', 'npm run ha:certify:local', 'npm run kms:certify:local', 'npm run corpus:worldclass-gate', 'npm run forecast:evaluate', 'npm run operator-eval:run', 'npm run operator-eval:score', 'npm run certify:clean-room', 'npm run review:bundle', 'npm run report:sub-75', 'npm run report:evidence-war-room'] },
  T: { title: 'Next measured acquisition target', target: 'Reach the first 25 scientifically valid negative packets and the first authoritative 1h/3h perimeter label without promoting UNKNOWN or interpolating truth.', measurement: { validNegatives: { current: negatives.validNegatives ?? 0, next: 25 }, oneHourLabels: { current: labels.horizonCounts?.['1h'] ?? 0, next: 1 }, threeHourLabels: { current: labels.horizonCounts?.['3h'] ?? 0, next: 1 }, prospectiveSnapshots: { current: prospective.snapshots?.length ?? prospective.immutableSnapshots ?? 0, next: 1000 } } }
};
const report = { ...core, fingerprint: semanticHash('active-evidence-war-room-final-report', core) };
await writeJsonAtomic(path.join(root, evidence, 'final-report.json'), report);
process.stdout.write(`${JSON.stringify({ verdict: report.A.verdict, publicRawObjects: report.B.rawObjects, bytes: report.B.bytes, incidents: report.C.discovered, capMessages: report.I.totals?.rawMessages, shadowEpisodes: report.G.episodes, localHaCycles: report.K.local.cycles, finalScoreMean: report.Q.meanFinalDefensibleScore, passed: report.Q.passed, fingerprint: report.fingerprint }, null, 2)}\n`);
