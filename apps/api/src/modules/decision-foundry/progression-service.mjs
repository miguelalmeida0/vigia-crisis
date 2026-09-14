import path from 'node:path';
import { buildHorizonLabels, materializeProgressionSequence } from '../../../../../packages/domain/src/decision-foundry/index.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { corpusPaths } from '../forecast-corpus/corpus-paths.mjs';
import { decisionFoundryPaths } from './decision-foundry-paths.mjs';
import { validateProgressionGeometries } from './geometry-service.mjs';
import { summarizeProgressionForProjection } from './object-set-projection.mjs';

export async function materializeProgressionFactory({ projectRoot = process.cwd(), incidentId = null } = {}) {
  const corpus = corpusPaths(projectRoot), paths = decisionFoundryPaths(projectRoot), gold = await readJson(path.join(corpus.gold, 'forecast-corpus.json'), { incidents: [] }), incidents = gold.incidents.filter((item) => item.perimeterStates?.length && (!incidentId || item.id === incidentId)), outputs = [];
  for (const incident of incidents) { const geometry = await validateProgressionGeometries({ projectRoot, incident }), sequence = materializeProgressionSequence({ incident, geometryResults: geometry.rows }), labels = buildHorizonLabels({ incident, sequence }), progression = { ...sequence, geometryEngine: geometry.engine, geometryResults: geometry.rows }; await Promise.all([writeJsonAtomic(path.join(paths.progressions, `${incident.id}.json`), progression), writeJsonAtomic(path.join(paths.progressionProjectionSummaries, `${incident.id}.json`), summarizeProgressionForProjection(incident.id, progression), { space: 0 }), writeJsonAtomic(path.join(paths.labels, `${incident.id}.json`), labels)]); outputs.push({ incidentId: incident.id, sequence, labels, geometryEngine: geometry.engine }); }
  return outputs;
}
