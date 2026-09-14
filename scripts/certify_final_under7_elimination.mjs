import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { signOperatorProxyRequest } from '../packages/domain/src/operator-proxy/request-auth.mjs';
import { bindReleaseIdentity, probeCanonicalRuntimeIdentity } from './release/runtime_identity_binding.mjs';

const root = process.cwd();
const apiOrigin = 'http://127.0.0.1:4177';
const operatorOrigin = 'http://127.0.0.1:4190';
const artifactRoot = path.join(root, '.artifacts/final-under7-elimination');
const validationRoot = path.join(root, 'data/validation/final-gap-closure');
const rows = (value) => Array.isArray(value) ? value : [];
const section = (payload, key) => payload?.data?.[key]?.value ?? null;
const manifest = JSON.parse(await readFile(path.join(root, 'data/validation/release/current-release-manifest.json'), 'utf8'));
const runtimeProof = await probeCanonicalRuntimeIdentity({ manifest });
const runtimeBinding = runtimeProof.identity;
const key = String(await readFile(path.join(root, '.tmp/release/operator-token'), 'utf8')).trim();
const writeJson = async (base, relative, value) => { const target = path.join(base, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(bindReleaseIdentity(value,runtimeBinding), null, 2)}\n`); return target; };

async function request(route) {
  const bodyBytes = Buffer.alloc(0);
  const headers = { accept: 'application/json', origin: operatorOrigin, 'sec-fetch-site': 'same-origin', 'x-vigia-ui-proxy': 'mission-dark-realdata-2.0', ...signOperatorProxyRequest({ key, releaseId: manifest.releaseId, method: 'GET', path: route, bodyBytes }) };
  const response = await fetch(`${apiOrigin}${route}`, { headers, signal: AbortSignal.timeout(30_000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`canonical_request_failed:${route}:${response.status}:${payload?.error ?? 'unknown'}`);
  return payload;
}

const [command, incidents, reports, global] = await Promise.all([
  request('/api/v10/operator/command-overview'),
  request('/api/v10/operator/incidents'),
  request('/api/v10/operator/reports'),
  request('/api/v10/operator/global-situational-awareness')
]);
const truth = section(incidents, 'operationalTruth'), gapSummary = section(command, 'gapClosure'), canonical = section(incidents, 'canonicalIncidents');
if (!truth || !gapSummary || !canonical) throw new Error('final_gap_contract_not_ready');
const truthRows = rows(canonical.incidents).map((item) => item.operationalTruth).filter(Boolean);
const incidentId = canonical.incidents?.[0]?.incident?.id;
if (!incidentId) throw new Error('governed_incident_unavailable');
const governedIds = rows(canonical.incidents).map((item) => item?.incident?.id).filter(Boolean);
const detailedIncidents = [];
for (let offset = 0; offset < governedIds.length; offset += 16) {
  const batch = await Promise.all(governedIds.slice(offset, offset + 16).map(async (id) => ({ id, payload: await request(`/api/v10/operator/incidents/${encodeURIComponent(id)}`) })));
  detailedIncidents.push(...batch.map(({ id, payload }) => ({ incidentId: id, incident: section(payload, 'canonicalIncident'), payload })));
}
if (detailedIncidents.some((item) => !item.incident)) throw new Error('per_incident_gap_contract_not_ready');
const sourceCoverageIncidents = detailedIncidents.map(({ incidentId: id, incident }) => ({ incidentId: id, families: rows(incident.sourceCoverage) }));
const independenceIncidents = detailedIncidents.map(({ incidentId: id, incident }) => ({ incidentId: id, ...(incident.independence ?? {}) }));
const geolocationIncidents = detailedIncidents.map(({ incidentId: id, incident }) => ({ incidentId: id, ...(incident.geolocationQuality ?? {}) }));
const spatialTruthIncidents = detailedIncidents.map(({ incidentId: id, incident }) => ({ incidentId: id, ...(incident.spatialTruth ?? {}) }));
const weatherAssociationIncidents = detailedIncidents.map(({ incidentId: id, incident }) => ({ incidentId: id, ...(incident.weatherAssociation ?? {}) }));
const gap = {
  ...gapSummary,
  sourceCoverage: { ...gapSummary.sourceCoverage, incidents: sourceCoverageIncidents },
  independence: { ...gapSummary.independence, incidents: independenceIncidents },
  geolocation: { ...gapSummary.geolocation, incidents: geolocationIncidents },
  spatialTruth: { ...gapSummary.spatialTruth, incidents: spatialTruthIncidents },
  weatherAssociation: { ...gapSummary.weatherAssociation, incidents: weatherAssociationIncidents }
};
const detail = detailedIncidents.find((item) => item.incidentId === incidentId)?.payload ?? await request(`/api/v10/operator/incidents/${encodeURIComponent(incidentId)}`);
const [intelligence, operations] = await Promise.all([
  request(`/api/v10/operator/incidents/${encodeURIComponent(incidentId)}/intelligence`),
  request(`/api/v10/operator/incidents/${encodeURIComponent(incidentId)}/operations`)
]);

const providerMatrix = {
  schemaVersion: 'vigia.final-provider-coverage-matrix.v1',
  generatedAt: gap.generatedAt,
  releaseId: manifest.releaseId,
  selection: 'All providers declared by the final governed gap-closure contract.',
  providers: rows(gap.providers?.inventory).map((item) => ({
    provider: item.provider,
    providerId: item.providerId,
    authorityLevel: item.authorityLevel,
    dataFamily: item.family,
    region: item.region,
    authentication: item.authentication,
    configured: item.configured,
    reachable: item.reachable,
    state: item.state,
    lastSuccess: item.lastSuccess,
    lastFailure: item.lastFailure,
    freshness: item.freshness,
    recordsReceived: item.recordsReceived,
    recordsAdmitted: item.recordsAdmitted,
    canonicalAssociations: item.canonicalAssociations,
    recordsRejected: item.recordsRejected,
    reason: item.reason,
    nextAttempt: item.nextAttempt,
    acquisition: item.acquisition,
    scoreImpact: item.scoreImpact
  }))
};
const changedFiles = JSON.parse(await readFile(path.join(validationRoot, 'changed-files.json'), 'utf8'));
await writeJson(validationRoot, 'changed-files.json', { ...changedFiles, generatedAt: new Date().toISOString(), bindingAuthority: 'Fresh final-under-7 certification against the exact canonical running release.' });
await writeJson(validationRoot, 'provider-coverage-matrix.json', providerMatrix);
await writeJson(validationRoot, 'per-incident-source-coverage.json', { schemaVersion: 'vigia.final-per-incident-source-coverage.v1', generatedAt: gap.generatedAt, releaseId: manifest.releaseId, ...gap.sourceCoverage });
await writeJson(artifactRoot, 'official-confirmation/funnel-and-positive-controls.json', { schemaVersion: 'vigia.final-official-confirmation-proof.v1', generatedAt: gap.generatedAt, releaseId: manifest.releaseId, ...gap.officialConfirmation });
await writeJson(artifactRoot, 'corroboration/source-independence-graph.json', { schemaVersion: 'vigia.final-independent-corroboration-proof.v1', generatedAt: gap.generatedAt, releaseId: manifest.releaseId, ...gap.independence });
await writeJson(artifactRoot, 'freshness/freshness-debt-and-recovery.json', { schemaVersion: 'vigia.final-freshness-proof.v1', generatedAt: gap.generatedAt, releaseId: manifest.releaseId, ...gap.freshness });
await writeJson(artifactRoot, 'geospatial/geolocation-weather-spatial-truth.json', { schemaVersion: 'vigia.final-geospatial-proof.v1', generatedAt: gap.generatedAt, releaseId: manifest.releaseId, geolocation: gap.geolocation, weatherAssociation: gap.weatherAssociation, spatialTruth: gap.spatialTruth });
await writeJson(artifactRoot, 'eoc/operational-period-readiness.json', { schemaVersion: 'vigia.final-eoc-readiness-proof.v1', generatedAt: gap.generatedAt, releaseId: manifest.releaseId, command: section(command, 'operationalPeriod'), operations: section(operations, 'operationalPeriod') ?? section(operations, 'operationalTwin')?.eocOperationalPeriod ?? null, runbooks: ['GOVERNMENT_PILOT_RUNBOOK.md', 'OPERATOR_ROLES_AND_AUTHORITY.md', 'INCIDENT_RESPONSE_RUNBOOK.md', 'PROVIDER_FAILURE_RUNBOOK.md', 'PROTECTION_APPROVAL_RUNBOOK.md', 'SHIFT_HANDOFF_RUNBOOK.md', 'AUDIT_AND_EVIDENCE_EXPORT.md'] });

const portfolioTruth = [command, incidents, reports, global].map((payload) => section(payload, 'operationalTruth'));
const selectedTruth = [detail, intelligence, operations].map((payload) => section(payload, 'operationalTruth'));
const canonicalCounts = JSON.stringify(truth.counts);
const selectedClassification = truthRows.find((item) => item.incidentId === incidentId)?.classification;
const tests = execFileSync(process.execPath, ['--test', 'apps/api/test/final-under7-elimination.test.mjs'], { cwd: root, encoding: 'utf8' });
const gates = {
  sevenRouteTruthContract: portfolioTruth.every((value) => value && JSON.stringify(value.counts) === canonicalCounts) && selectedTruth.every((value) => value?.classification === selectedClassification),
  onlyVerifiedCurrentCountsActive: truthRows.every((item) => item.countsAsActive === (item.classification === 'VERIFIED_CURRENT')),
  directIpmaActivated: providerMatrix.providers.filter((item) => ['ipma-direct-weather', 'ipma-direct-warnings'].includes(item.providerId)).every((item) => item.configured && item.reachable),
  providerInventoryComplete: providerMatrix.providers.length >= 11,
  eightFamilyCoverageContract: rows(gap.sourceCoverage?.incidents).length === truthRows.length && rows(gap.sourceCoverage?.incidents).every((item) => rows(item.families).length === 8),
  positiveControlReachability: gap.officialConfirmation?.promotionReachable === true && rows(gap.officialConfirmation?.positiveControls).length >= 3,
  noFalseLiveOfficialPromotion: Number(gap.officialConfirmation?.liveVerifiedCurrent ?? -1) === Number(truth.counts?.VERIFIED_CURRENT ?? -2),
  publicOfficialSourcesExhausted: gap.officialConfirmation?.publicSourcesExhausted === true,
  independenceGraphComplete: rows(gap.independence?.incidents).length === truthRows.length && gap.independence?.duplicateFamilyInflation === 0,
  governedGeolocation95: Number(gap.geolocation?.percent ?? 0) >= 95,
  weatherAssociationComplete: Object.values(gap.weatherAssociation?.counts ?? {}).reduce((sum, value) => sum + Number(value ?? 0), 0) === truthRows.length,
  spatialKindsSeparated: gap.spatialTruth?.truthBoundaryEnforced === true && rows(gap.spatialTruth?.distinctKinds).length === 6,
  priorityExplainable: detailedIncidents.every(({ incident }) => Number.isInteger(incident?.operationalTruth?.priority?.rank) && rows(incident?.operationalTruth?.priority?.factors).length && Array.isArray(incident?.operationalTruth?.priority?.missingFactors) && incident?.operationalTruth?.priority?.explanation && incident?.operationalTruth?.priority?.revision && incident?.operationalTruth?.priority?.whyRankedAboveNext && incident?.operationalTruth?.priority?.algorithmVersion === 'vigia.operational-priority.v4'),
  capAndEocSoftwareTests: /fail 0/.test(tests) && /pass 5/.test(tests),
  capTransportDisabledInCanonicalRuntime: section(operations, 'protectWorkflow')?.dispatch?.externalSendEnabled !== true,
  outcomeMeasurementReadinessProjected: Boolean(section(reports, 'outcomeMeasurement')?.production?.measurementReadiness),
  externalBlockersExact: rows(gap.externalBlockers).length >= 2 && rows(gap.externalBlockers).every((item) => item.whyVigiaCannotControl && item.implemented && item.externalParty && item.needed && item.immediateEffect && rows(item.positiveControl).length)
};
const failedGates = Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name);
const certification = {
  schemaVersion: 'vigia.final-under7-elimination-certification.v1',
  state: failedGates.length ? 'FAIL' : 'PASS',
  generatedAt: new Date().toISOString(),
  releaseId: manifest.releaseId,
  runtimeProof:{probedAt:runtimeProof.probedAt,api:'READY',fieldnet:'READY',fieldnetReadiness:'READY',operator:'READY'},
  selectedIncidentId: incidentId,
  truthCounts: truth.counts,
  providerSummary: { count: providerMatrix.providers.length, configured: providerMatrix.providers.filter((item) => item.configured).length, reachable: providerMatrix.providers.filter((item) => item.reachable).length },
  sourceCoverage: { available: gap.sourceCoverage?.availableFamilyAssignments, expected: gap.sourceCoverage?.totalExpectedFamilyAssignments, percent: gap.sourceCoverage?.percent },
  corroboration: gap.independence?.counts,
  freshness: gap.freshness?.metrics,
  geolocation: { usable: gap.geolocation?.usable, denominator: gap.geolocation?.denominator, percent: gap.geolocation?.percent },
  weather: gap.weatherAssociation?.counts,
  officialConfirmation: { liveFunnel: gap.officialConfirmation?.liveFunnel, positiveControls: rows(gap.officialConfirmation?.positiveControls).map((item) => item.controlId), liveVerifiedCurrent: gap.officialConfirmation?.liveVerifiedCurrent },
  outcomeMeasurementReadiness: section(reports, 'outcomeMeasurement')?.production?.measurementReadiness,
  gates: Object.entries(gates).map(([name, passed]) => ({ name, state: passed ? 'PASS' : 'FAIL' })),
  failedGates,
  externalBlockers: gap.externalBlockers,
  testEvidence: { command: 'node --test apps/api/test/final-under7-elimination.test.mjs', passed: /fail 0/.test(tests), output: tests }
};
await probeCanonicalRuntimeIdentity({ manifest:runtimeBinding });
await writeJson(artifactRoot, 'certification.json', certification);
if (failedGates.length) throw new Error(`final_under7_certification_failed:${failedGates.join(',')}`);
process.stdout.write(`${JSON.stringify({ state: 'PASS', releaseId: manifest.releaseId, truthCounts: truth.counts, providerSummary: certification.providerSummary, sourceCoverage: certification.sourceCoverage, corroboration: certification.corroboration, freshness: certification.freshness, geolocation: certification.geolocation, weather: certification.weather, failedGates }, null, 2)}\n`);
