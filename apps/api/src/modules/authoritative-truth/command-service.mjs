import { readJson } from '../../shared/json-file.mjs';
import { readNetworkState, truthPaths, writeNetworkState } from './contracts.mjs';
import { buildIncrementalOfficialLabels } from './label-factory.mjs';
import { scoreOfficialForecasts } from './forecast-scoring-service.mjs';
import { updateDecisionPackets } from './decision-service.mjs';
import { replayTruthNetwork } from './replay-service.mjs';
import { writeNetworkArtifacts } from './artifact-service.mjs';
import { reconcileNetworkStateIdentity } from './network-repository.mjs';

async function stateRequired(projectRoot) { const state = await readNetworkState(projectRoot); if (!state) throw new Error('authoritative_truth_state_required'); return reconcileNetworkStateIdentity(state); }
export async function authoritativeRevisions({ projectRoot = process.cwd(), clock = () => new Date() } = {}) { const state = await stateRequired(projectRoot); await writeNetworkArtifacts(state, { projectRoot, clock }); return readJson(truthPaths(projectRoot).revisions, {}); }
export async function authoritativeConflicts({ projectRoot = process.cwd(), clock = () => new Date() } = {}) { const state = await stateRequired(projectRoot); await writeNetworkArtifacts(state, { projectRoot, clock }); return readJson(truthPaths(projectRoot).conflicts, {}); }
export async function refreshAuthoritativeLabels({ projectRoot = process.cwd(), clock = () => new Date() } = {}) { const state = await stateRequired(projectRoot), before = state.labels.length, result = buildIncrementalOfficialLabels(state, [...new Set(Object.values(state.sequences).map((item) => item.incidentId))], clock().toISOString()), byId = new Map(state.revisions.map((item) => [item.revisionId, item])), revisions = result.created.map((item) => byId.get(item.laterRevisionId)).filter(Boolean); updateDecisionPackets(state, revisions, clock().toISOString()); await scoreOfficialForecasts(state, { projectRoot, clock }); await writeNetworkState(projectRoot, state); const replay = await replayTruthNetwork({ projectRoot, clock, state }); await writeNetworkArtifacts(state, { projectRoot, clock, replay }); const artifact = await readJson(truthPaths(projectRoot).labels, {}); return { ...artifact, createdThisRun: state.labels.length - before };
}
export async function scoreAuthoritativeForecasts({ projectRoot = process.cwd(), clock = () => new Date() } = {}) { const state = await stateRequired(projectRoot), result = await scoreOfficialForecasts(state, { projectRoot, clock }); await writeNetworkState(projectRoot, state); await writeNetworkArtifacts(state, { projectRoot, clock }); return { schemaVersion: 'vigia.official-forecast-score-command.v1', ...result }; }
