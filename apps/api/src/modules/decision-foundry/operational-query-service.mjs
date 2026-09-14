import path from 'node:path';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { authorizeCompartment } from '../../../../../packages/domain/src/worldclass/index.mjs';
import { FileIntelligenceRepository } from '../intelligence/file-intelligence-repository.mjs';
import { decisionFoundryPaths } from './decision-foundry-paths.mjs';

const boundedText = (value, name, maximum = 256) => { const text = String(value ?? ''); if (!text || text.length > maximum || /[\u0000-\u001f]/.test(text)) throw new Error(`${name}_invalid`); return text; };
const cutoffTime = (value) => { if (value === null || value === undefined) return null; const milliseconds = Date.parse(value); if (!Number.isFinite(milliseconds)) throw new Error('operational_query_knowledge_time_invalid'); return new Date(milliseconds).toISOString(); };
function rightsAllow(row, authority, at) { const state = row.rights?.state, marking = row.marking ?? row.rights?.compartment; if (['BLOCKED', 'DENIED', 'REVOKED'].includes(state)) return false; if (marking && !authorizeCompartment({ context: authority?.compartment, marking, operation: 'READ', at }).allowed) return false; return !row.rights?.requiredCapability || authority?.capabilities?.includes(row.rights.requiredCapability); }

export class OperationalIntelligenceQueryServiceV2 {
  constructor({ projectRoot = process.cwd(), repository = null, clock = () => new Date() } = {}) { this.projectRoot = projectRoot; this.clock = clock; this.repository = repository ?? new FileIntelligenceRepository({ filePath: path.join(decisionFoundryPaths(projectRoot).runtime, 'semantic-repository.json'), clock }); this.metrics = { requests: 0, repositoryQueries: 0, rejectedConsistencyTokens: 0 }; }
  async initialize() { return this.repository.initialize(); }
  async incidentSnapshot(incidentId, { kinds = null, knowledgeTime = null, projectionVersion = null, authority = null } = {}) {
    const boundedIncidentId = boundedText(incidentId, 'operational_query_incident'), allowedKinds = kinds ? new Set(kinds.map((kind) => boundedText(kind, 'operational_query_kind', 128))) : null, cutoff = cutoffTime(knowledgeTime);
    await this.initialize(); this.metrics.requests += 1; this.metrics.repositoryQueries += 1;
    let page; try { page = await this.repository.listObjects({ incidentId: boundedIncidentId, limit: 500, projectionVersion }); } catch (error) { if (error.code === 'CONSISTENCY_TOKEN_MISMATCH') this.metrics.rejectedConsistencyTokens += 1; throw error; }
    const evaluatedAt = this.clock().toISOString(), objects = page.results.filter((row) => (!allowedKinds || allowedKinds.has(row.kind)) && (!cutoff || !row.knowledgeTime || Date.parse(row.knowledgeTime) <= Date.parse(cutoff)) && rightsAllow(row, authority, evaluatedAt));
    const grouped = Object.fromEntries([...new Set(objects.map((row) => row.kind))].sort().map((kind) => [kind, objects.filter((row) => row.kind === kind).map((row) => row.payload)]));
    const truncated = Boolean(page.nextCursor), core = { schemaVersion: 'vigia.operational-intelligence-snapshot.v2', projectionVersion: page.projectionVersion, consistencyToken: page.consistencyToken, knowledgeTimeCutoff: cutoff, generatedAt: evaluatedAt, sourceState: 'REPOSITORY_PROJECTION', partial: page.partial || truncated, degraded: truncated, degradationReasons: truncated ? ['INCIDENT_OBJECT_LIMIT_REACHED'] : [], rightsRestrictions: { applied: true, compartmentAware: true, excludedObjects: page.results.length - objects.length }, replayReference: semanticHash('operational-query-replay', { incidentId: boundedIncidentId, projectionVersion: page.projectionVersion, cutoff, objectFingerprints: objects.map((row) => row.payloadHash) }), incidentId: boundedIncidentId, objects: grouped, queryMetrics: { repositoryQueries: 1, nPlusOneDetected: false } };
    return { ...core, fingerprint: semanticHash('operational-intelligence-snapshot', core) };
  }
  status() { return { schemaVersion: 'vigia.operational-query-service-status.v1', ...this.metrics }; }
}
