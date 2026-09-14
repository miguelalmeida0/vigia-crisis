import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { calibrateInformationValue, createDecisionOutcome, createInformationValueOutcome, createProspectiveCaptureManifest, createProspectiveSnapshot, createShadowOperationsRecord } from '../../../../../packages/domain/src/decision-foundry/index.mjs';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { writeJsonAtomic } from '../../shared/json-file.mjs';
import { FileIntelligenceRepository } from '../intelligence/file-intelligence-repository.mjs';
import { decisionFoundryPaths } from './decision-foundry-paths.mjs';

function defaultRepository(projectRoot, clock) { return new FileIntelligenceRepository({ filePath: path.join(decisionFoundryPaths(projectRoot).runtime, 'semantic-repository.json'), clock }); }

export class ProspectiveArchiveService {
  constructor({ projectRoot = process.cwd(), repository = null, clock = () => new Date() } = {}) { this.projectRoot = projectRoot; this.clock = clock; this.repository = repository ?? defaultRepository(projectRoot, clock); }
  async initialize() { return this.repository.initialize(); }
  async registerManifest(input) { await this.initialize(); const manifest = createProspectiveCaptureManifest(input); await this.repository.putObject('PROSPECTIVE_CAPTURE_MANIFEST', manifest.id, manifest, { semanticIdentity: manifest.fingerprint, rights: manifest.rights }); return manifest; }
  async capture(manifest, input) {
    await this.initialize();
    const prior = (await this.repository.listObjects({ kind: 'PROSPECTIVE_ARCHIVE_SNAPSHOT', incidentId: input.incidentId, limit: 500 })).results.filter((row) => row.payload.manifestId === manifest.id).sort((a, b) => a.payload.sequence - b.payload.sequence);
    const snapshot = createProspectiveSnapshot({ ...input, manifest, sequence: prior.length + 1, previousSnapshotFingerprint: prior.at(-1)?.payload.fingerprint ?? null });
    await this.repository.persistArchiveSnapshot(snapshot, { rights: manifest.rights }); return snapshot;
  }
  async history(incidentId, options = {}) {
    const page = await this.repository.listObjects({ kind: 'PROSPECTIVE_ARCHIVE_SNAPSHOT', incidentId, ...options });
    return { ...page, results: page.results.map((row) => row.payload).sort((left, right) => left.sequence - right.sequence || left.fingerprint.localeCompare(right.fingerprint)) };
  }
}

export class DecisionMemoryService {
  constructor({ projectRoot = process.cwd(), repository = null, clock = () => new Date() } = {}) { this.projectRoot = projectRoot; this.clock = clock; this.repository = repository ?? defaultRepository(projectRoot, clock); }
  async initialize() { return this.repository.initialize(); }
  async recordPacket(packet) { await this.initialize(); return this.repository.persistDecisionPacket(packet, { rights: packet.rights }); }
  async adjudicate(input) { await this.initialize(); const outcome = createDecisionOutcome(input); await this.repository.persistDecisionOutcome(outcome); return outcome; }
  async recordInformationValue(input) { await this.initialize(); const outcome = createInformationValueOutcome(input); await this.repository.persistInformationValueOutcome(outcome); return outcome; }
  async calibration() { await this.initialize(); const rows = (await this.repository.listObjects({ kind: 'INFORMATION_VALUE_OUTCOME', limit: 500 })).results.map((row) => row.payload); return calibrateInformationValue(rows); }
  async recordShadow(input) { await this.initialize(); const record = createShadowOperationsRecord(input); await this.repository.putObject('SHADOW_OPERATIONS_RECORD', record.id, record, { incidentId: record.incidentId, knowledgeTime: record.recordedAt }); return record; }
}

export async function runProspectiveKnowledgeTimeDemo({ projectRoot = process.cwd(), repository = null } = {}) {
  const paths = decisionFoundryPaths(projectRoot), livePath = path.join(projectRoot, 'data/validation/reality-network/latest-live-run.json'), live = JSON.parse(await readFile(livePath, 'utf8'));
  const incidentId = live.selection?.providerIncidentId; if (!incidentId) throw new Error('prospective_demo_current_incident_missing');
  const providerRows = (live.providers ?? []).filter((provider) => provider.status === 'LIVE' && provider.rawProducts?.length).slice(0, 2), products = providerRows.map((provider) => provider.rawProducts[0]);
  if (products.length < 2) throw new Error('prospective_demo_two_source_snapshots_required');
  const archive = new ProspectiveArchiveService({ projectRoot, repository, clock: () => new Date(live.completedAt) });
  const manifest = await archive.registerManifest({ id: `prospective-demo:${live.runId}`, mode: 'ONCE', providers: providerRows.map((provider) => provider.providerId), products: products.map((product) => product.providerProductId), regions: ['western-us'], incidentIds: [incidentId], cadenceSeconds: 300, retentionDays: 365, startedAt: live.startedAt, rights: { state: live.rights?.allowed === false ? 'BLOCKED' : 'READY', licenceId: 'MIXED_APPROVED_PROVIDER_RIGHTS', attribution: live.rights?.attributions ?? [] } });
  const retained = (await archive.history(incidentId, { limit: 500 })).results.filter((item) => item.manifestId === manifest.id), snapshots = [];
  for (let index = 0; index < products.length; index += 1) {
    const provider = providerRows[index], product = products[index], received = provider.completedAt;
    const existing = retained.find((item) => item.providerId === provider.providerId && item.productId === product.providerProductId && item.rawObjectHash === product.checksumSha256);
    snapshots.push(existing ?? await archive.capture(manifest, { incidentId, providerId: provider.providerId, productId: product.providerProductId, providerPublishedAt: product.sourceTimestamp, vigiaReceivedAt: received, rawObjectReference: product.id, rawObjectHash: product.checksumSha256, sourceHealth: { state: provider.status, latencyMs: provider.latencyMs }, perimeterRevision: provider.providerId === 'nifc-wfigs' ? { sourceTimestamp: product.sourceTimestamp } : null, physicalObservations: provider.physicalFamilies ?? [], evidenceState: live.twin?.incidents?.find?.((item) => item.incidentId === live.selection.twinIncidentId)?.evaluation ?? null, evidenceDebt: live.consumerSnapshot?.evidenceDebt ?? null, hypotheses: null, decisionPacket: null, shadowActions: live.shadow?.actions ?? [], lineage: { runHash: live.runHash, rawProductId: product.id } }));
  }
  const firstAfter = (await archive.history(incidentId, { limit: 10 })).results.find((item) => item.fingerprint === snapshots[0].fingerprint);
  const core = { schemaVersion: 'vigia.prospective-knowledge-time-demo.v1', sourceRunId: live.runId, sourceRunHash: live.runHash, incidentId, manifest, snapshots, firstSnapshotImmutable: firstAfter?.fingerprint === snapshots[0].fingerprint, rawBytes: products.reduce((sum, product) => sum + Number(product.byteLength ?? 0), 0), providers: providerRows.map((provider) => provider.providerId), consequentialActionsExecuted: 0 };
  const report = { ...core, fingerprint: semanticHash('prospective-knowledge-time-demo', core) }; await writeJsonAtomic(path.join(paths.demos, 'prospective-knowledge-time.json'), report); return report;
}

export async function writeLearningReport({ projectRoot = process.cwd(), repository = null } = {}) {
  const memory = new DecisionMemoryService({ projectRoot, repository }); await memory.initialize(); const calibration = await memory.calibration();
  const decisionOutcomes = await memory.repository.listObjects({ kind: 'DECISION_OUTCOME', limit: 500 }), shadows = await memory.repository.listObjects({ kind: 'SHADOW_OPERATIONS_RECORD', limit: 500 }), archive = await memory.repository.listObjects({ kind: 'PROSPECTIVE_ARCHIVE_SNAPSHOT', limit: 500 });
  const core = { schemaVersion: 'vigia.operational-learning-report.v1', decisionOutcomes: decisionOutcomes.results.length, shadowRecords: shadows.results.length, prospectiveSnapshots: archive.results.length, calibration };
  const report = { ...core, fingerprint: semanticHash('operational-learning-report', core) }; await writeJsonAtomic(path.join(decisionFoundryPaths(projectRoot).reports, 'operational-learning.json'), report); return report;
}
