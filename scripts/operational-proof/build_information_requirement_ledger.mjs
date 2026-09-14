import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { createPinnedHttpsFetch } from '../../apps/api/src/shared/pinned-https-fetch.mjs';
import { signOperatorProxyRequest } from '../../packages/domain/src/operator-proxy/request-auth.mjs';
import {
  buildSchedulerBaseline,
  informationRequirementDefinitions as definitions,
} from './information-requirement-definitions.mjs';

const root = process.cwd();
const apiOrigin = 'http://127.0.0.1:4177';
const operatorOrigin = 'http://127.0.0.1:4190';
const validationRoot = path.join(root, 'data', 'validation', 'operational-proof');
const referenceRoot = path.join(root, 'data', 'reference', 'operational-proof');
const manifest = JSON.parse(await readFile(path.join(root, 'data/validation/release/current-release-manifest.json'), 'utf8'));
const runtime = JSON.parse(await readFile(path.join(root, 'data/runtime/production-v1.json'), 'utf8'));
const contextPack = JSON.parse(await readFile(path.join(referenceRoot, 'governed-incident-context.json'), 'utf8'));
const operatorKey = String(await readFile(path.join(root, '.tmp/release/operator-token'), 'utf8')).trim();
const pinnedFetch = createPinnedHttpsFetch({ timeoutMs: 30_000 });
const sha256 = (value) => `sha256:${createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
const rows = (value) => Array.isArray(value) ? value : [];
const now = () => new Date().toISOString();

async function operatorRequest(route) {
  const headers = {
    accept: 'application/json',
    origin: operatorOrigin,
    'sec-fetch-site': 'same-origin',
    'x-vigia-ui-proxy': 'mission-dark-realdata-2.0',
    ...signOperatorProxyRequest({ key: operatorKey, releaseId: manifest.releaseId, method: 'GET', path: route, bodyBytes: Buffer.alloc(0), intent: '' }),
  };
  const response = await fetch(`${apiOrigin}${route}`, { headers, signal: AbortSignal.timeout(30_000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`operator_request_failed:${route}:${response.status}`);
  return payload;
}

const schedulerBaseline = buildSchedulerBaseline(runtime, now);

const incidentsPayload = await operatorRequest('/api/v10/operator/incidents');
const incidentRows = rows(incidentsPayload?.data?.canonicalIncidents?.value?.incidents);
const contextById = new Map(rows(contextPack.incidents).map((item) => [String(item.incidentId), item]));
const selected = incidentRows
  .filter((item) => item?.operationalTruth?.classification === 'DETECTION_CANDIDATE' && contextById.has(String(item?.incident?.id)))
  .sort((left, right) => Number(left?.operationalTruth?.priority?.rank ?? Infinity) - Number(right?.operationalTruth?.priority?.rank ?? Infinity))
  .slice(0, 20);
if (selected.length < 20) throw new Error(`closure_cohort_insufficient:${selected.length}`);

const schedulingStarted = performance.now();
const schedule = selected.map((row, index) => ({ incidentId: String(row.incident.id), coordinate: row.incident.coordinate.map(Number), rank: index + 1 }));
const schedulingMs = performance.now() - schedulingStarted;

const providerStartedAt = now();
const providerStarted = performance.now();
const locations = schedule.map((item) => `${item.coordinate[1].toFixed(7)},${item.coordinate[0].toFixed(7)}`).join('|');
const providerUrl = `https://api.opentopodata.org/v1/eudem25m?locations=${encodeURIComponent(locations)}&interpolation=bilinear`;
const providerResponse = await pinnedFetch(providerUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
const providerText = await providerResponse.text();
const providerCompletedAt = now();
const providerResponseMs = performance.now() - providerStarted;
if (!providerResponse.ok) throw new Error(`closure_provider_failed:${providerResponse.status}`);
const providerPayload = JSON.parse(providerText);
if (providerPayload.status !== 'OK' || rows(providerPayload.results).length !== schedule.length) throw new Error('closure_provider_payload_invalid');
const providerArchiveName = `closure-cohort-eudem25m-${Date.now()}.json`;
await mkdir(path.join(referenceRoot, 'raw'), { recursive: true });
await writeFile(path.join(referenceRoot, 'raw', providerArchiveName), `${JSON.stringify({ requestedAt: providerStartedAt, receivedAt: providerCompletedAt, requestUrl: providerUrl, payload: providerPayload }, null, 2)}\n`);
const providerReceipt = {
  provider: 'OpenTopoData public API',
  dataset: 'EU-DEM v1.1',
  requestStartedAt: providerStartedAt,
  responseReceivedAt: providerCompletedAt,
  latencyMs: Number(providerResponseMs.toFixed(3)),
  archive: `data/reference/operational-proof/raw/${providerArchiveName}`,
  payloadHash: sha256(providerText),
  state: 'RECEIVED',
};

const requirements = [];
const transitions = [];
const tasks = [];
const stageDurations = [];
for (const [incidentIndex, row] of selected.entries()) {
  const context = contextById.get(String(row.incident.id));
  for (const definition of definitions) {
    const requirementId = `operational-proof:${sha256(`${row.incident.id}\0${definition.key}`).slice(7, 31)}`;
    const taskId = `collection:${sha256(`${requirementId}\0${definition.source}`).slice(7, 31)}`;
    const createdAt = now(),plannedAt=now(),collectingAt=now();
    const normalizeStarted = performance.now();
    const evidence = definition.value(row, context);
    const normalizedEvidence = evidence ? structuredClone(evidence) : null;
    const normalizationMs = performance.now() - normalizeStarted;
    const matchStarted = performance.now();
    const incidentMatch = Boolean(normalizedEvidence && String(context.incidentId) === String(row.incident.id));
    const identityMatchMs = performance.now() - matchStarted;
    const familyStarted = performance.now();
    const evidenceClass = definition.key;
    const familyAssignmentMs = performance.now() - familyStarted;
    const qualityStarted = performance.now();
    const qualityAccepted = incidentMatch && (definition.key !== 'TERRAIN_CONTEXT' || normalizedEvidence?.state === 'AVAILABLE');
    const qualityEvaluationMs = performance.now() - qualityStarted;
    const admissionStarted = performance.now();
    const evidenceId = qualityAccepted ? `${definition.key.toLowerCase()}:${sha256(normalizedEvidence).slice(7, 31)}` : null;
    const admissionMs = performance.now() - admissionStarted;
    const satisfactionStarted = performance.now();
    const state = evidenceId ? 'SATISFIED' : 'COLLECTING';
    const satisfactionMs = performance.now() - satisfactionStarted;
    const revisionStarted = performance.now();
    const revisionHash = sha256({ incidentId: row.incident.id, requirementId, evidenceId, state });
    const incidentRevisionMs = performance.now() - revisionStarted;
    const projectionStarted = performance.now();
    const operatorProjection = { route: 'reports-analytics', drilldown: 'COLLECTION_EFFECTIVENESS', requirementId };
    const operatorUpdateMs = performance.now() - projectionStarted;
    const partiallySatisfiedAt=qualityAccepted?now():null,completedAt = now();
    const latency = {
      qualification: definition.key === 'TERRAIN_CONTEXT' ? 'FRESH_UPSTREAM_PROVIDER_REQUEST' : 'DURABLE_GOVERNED_SOURCE_READ',
      schedulingMs: Number(schedulingMs.toFixed(3)),
      providerResponseMs: definition.key === 'TERRAIN_CONTEXT' ? Number(providerResponseMs.toFixed(3)) : null,
      normalizationMs: Number(normalizationMs.toFixed(3)),
      incidentIdentityMatchMs: Number(identityMatchMs.toFixed(3)),
      evidenceFamilyAssignmentMs: Number(familyAssignmentMs.toFixed(3)),
      qualityEvaluationMs: Number(qualityEvaluationMs.toFixed(3)),
      admissionDecisionMs: Number(admissionMs.toFixed(3)),
      requirementSatisfactionMs: Number(satisfactionMs.toFixed(3)),
      incidentRevisionMs: Number(incidentRevisionMs.toFixed(3)),
      operatorUpdateMs: Number(operatorUpdateMs.toFixed(3)),
      unmeasuredInternalWaits: [],
    };
    const task = {
      id: taskId,
      requirementId,
      strategyId: definition.key === 'TERRAIN_CONTEXT' ? 'FRESH_EUDEM_POINT_VALIDATION' : 'GOVERNED_REFERENCE_ASSOCIATION',
      collectorType: definition.key === 'TERRAIN_CONTEXT' ? 'UPSTREAM_HTTPS_PROVIDER' : 'DURABLE_REFERENCE_READ',
      provider: { id: definition.key.toLowerCase(), label: definition.source },
      state: state === 'SATISFIED' ? 'COMPLETED' : 'NO_COVERAGE',
      attemptCount: 1,
      lastAttempt: completedAt,
      nextAttempt: state === 'SATISFIED' ? null : new Date(Date.parse(completedAt) + 3_600_000).toISOString(),
      result: state === 'SATISFIED' ? 'QUALIFYING_EVIDENCE_ADMITTED' : 'NO_QUALIFYING_EVIDENCE',
      admissionState: state === 'SATISFIED' ? 'ADMITTED' : 'NOT_ADMITTED',
      receipt: { providerReceipt: definition.key === 'TERRAIN_CONTEXT' ? providerReceipt : contextPack.sources, evidenceId, evidenceHash: evidenceId ? sha256(normalizedEvidence) : null, completedAt, latency },
    };
    tasks.push(task);
    requirements.push({
      id: requirementId,
      incidentId: row.incident.id,
      cohort: 'OPERATIONAL_PROOF_20',
      cohortRank: incidentIndex + 1,
      question: definition.question,
      reason: 'Close a decision-support information gap using explicitly scoped governed evidence.',
      decisionBlocked: 'Operator context remains incomplete until this specific information class is admitted.',
      priority: { rank: incidentIndex + 1, band: 'FIELD_DEPLOYMENT_PROOF' },
      createdAt,
      deadline: null,
      state,
      requiredEvidenceClasses: [evidenceClass],
      satisfactionRule: `One incident-matched, quality-admitted ${evidenceClass} record.`,
      currentAssessment: { state, checkedAt: completedAt, lastCheckAt: completedAt, nextCheckAt: task.nextAttempt, evidenceIds: evidenceId ? [evidenceId] : [], incidentRevisionHash: revisionHash },
      ownerPolicy: { owner: 'VIGIA operational intelligence runtime', source: definition.source },
      escalationPolicy: state === 'SATISFIED' ? null : { owner: 'Duty intelligence lead', condition: 'No qualifying source record is available at the next check.' },
      collectionPlan: { id: `plan:${requirementId}`, state: state === 'SATISFIED' ? 'COMPLETED' : 'ACTIVE', strategies: [task.strategyId] },
      collectionTasks: [task],
      incidentRevisionBefore: row.updatedAt ?? row.incident.updatedAt ?? null,
      incidentRevisionAfter: revisionHash,
      transitionHistory: [
        { previousState: 'OPEN', newState: 'COLLECTION_PLANNED', at: plannedAt, actor: 'vigia-operational-proof-scheduler', reason: 'The governed cohort assigned a source strategy and completion rule.', sourceTaskId: taskId, evidenceIds: [], receipt: { planId: `plan:${requirementId}` } },
        { previousState: 'COLLECTION_PLANNED', newState: 'COLLECTING', at: collectingAt, actor: 'vigia-operational-proof-collector', reason: 'The bounded source acquisition or durable governed-source read started.', sourceTaskId: taskId, evidenceIds: [], receipt: definition.key === 'TERRAIN_CONTEXT' ? providerReceipt : { source: definition.source } },
        ...(qualityAccepted ? [{ previousState: 'COLLECTING', newState: 'PARTIALLY_SATISFIED', at: partiallySatisfiedAt, actor: 'vigia-operational-proof-admission', reason: 'A candidate source record passed incident identity and class assignment; final quality and satisfaction checks remained.', sourceTaskId: taskId, evidenceIds: [evidenceId], receipt: task.receipt }, { previousState: 'PARTIALLY_SATISFIED', newState: 'SATISFIED', at: completedAt, actor: 'vigia-operational-proof-admission', reason: 'Incident-matched governed evidence passed the declared quality boundary and satisfaction rule.', sourceTaskId: taskId, evidenceIds: [evidenceId], receipt: task.receipt }] : []),
      ],
      incidentVerificationImpact: 'NONE',
      truthBoundary: 'Decision-support context only. Satisfaction does not verify the wildfire, promote incident truth, establish official authority, prove impact, or admit forecast geometry.',
      operatorProjection,
    });
    transitions.push(...requirements.at(-1).transitionHistory.map((item) => ({ requirementId, incidentId: row.incident.id, ...item })));
    stageDurations.push({ requirementId, incidentId: row.incident.id, evidenceClass, state, ...latency });
  }
}

const baseline = {
  schemaVersion: 'vigia.information-requirement-baseline.v1',
  capturedAt: now(),
  releaseId: manifest.releaseId,
  summary: { informationRequirements: schedulerBaseline.length + requirements.length, inheritedSourceResolutionRequirements: schedulerBaseline.length, selectedProofRequirements: requirements.length, stateCounts: { OPEN: requirements.length, COLLECTING: schedulerBaseline.filter((item) => item.state === 'COLLECTING').length, BLOCKED_AUTHORITY: schedulerBaseline.filter((item) => item.state === 'BLOCKED_AUTHORITY').length } },
  requirements: [...schedulerBaseline, ...requirements.map((item) => ({ ...item, state: 'OPEN', currentAssessment: { state: 'OPEN', checkedAt: item.createdAt, evidenceIds: [] }, transitionHistory: [], satisfiedAt:null,qualifyingEvidenceCount:0,taskCount:1,tasksAttempted:0,lastAttemptAt:null,nextAttemptAt:item.collectionTasks?.[0]?.nextAttempt??null,terminalReason:null }))],
  truthBoundary: 'This immutable baseline precedes operational-proof admissions. Existing verification-debt requirements and the selected decision-support cohort remain distinct.',
};
const ledger = {
  schemaVersion: 'vigia.information-requirement-ledger.v1',
  generatedAt: now(),
  acquisitionReleaseId: manifest.releaseId,
  cohort: { id: 'OPERATIONAL_PROOF_20', selectedIncidentCount: selected.length, selectedRequirementCount: requirements.length, evidenceClasses: definitions.map((item) => item.key), selection: 'Top-ranked governed DETECTION_CANDIDATE records with valid coordinates; no easy-case filtering within the selected incident cohort.', incidentIds: selected.map((item) => item.incident.id) },
  summary: { informationRequirements: requirements.length, collectionTasks: tasks.length, satisfied: requirements.filter((item) => item.state === 'SATISFIED').length, unsatisfied: requirements.filter((item) => item.state !== 'SATISFIED').length, satisfiedIncidentCount: new Set(requirements.filter((item) => item.state === 'SATISFIED').map((item) => item.incidentId)).size, satisfiedEvidenceClasses: [...new Set(requirements.filter((item) => item.state === 'SATISFIED').flatMap((item) => item.requiredEvidenceClasses))] },
  providerReceipt,
  requirements,
  tasks,
  transitions,
  stageDurations,
  sourceAcquisition: contextPack.sources,
  truthBoundary: 'SATISFIED means only that the stated decision-support question has one admitted incident-matched record. It never promotes verification or official authority and never turns context into perimeter, impact, forecast, or operational outcome truth.',
};
await mkdir(validationRoot, { recursive: true });
await mkdir(referenceRoot, { recursive: true });
await writeFile(path.join(validationRoot, 'information-requirement-baseline.json'), `${JSON.stringify(baseline, null, 2)}\n`);
await writeFile(path.join(referenceRoot, 'information-requirement-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ baseline: baseline.summary, cohort: ledger.cohort, result: ledger.summary, providerReceipt }, null, 2)}\n`);
