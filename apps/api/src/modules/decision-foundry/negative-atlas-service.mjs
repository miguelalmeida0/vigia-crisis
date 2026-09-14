import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { certifyNegativeAtlas, createNegativeAtlasEntry } from '../../../../../packages/domain/src/decision-foundry/index.mjs';
import { dataFoundryPaths } from '../data-foundry/foundry-paths.mjs';
import { decisionFoundryPaths } from './decision-foundry-paths.mjs';

const CATEGORY_TO_TAXONOMY = Object.freeze({
  INDUSTRIAL_LANDUSE: 'INDUSTRIAL_THERMAL_EVENT',
  INDUSTRIAL_WORKS: 'INDUSTRIAL_THERMAL_EVENT',
  GAS_FLARE: 'INDUSTRIAL_THERMAL_EVENT',
  VOLCANIC: 'VOLCANIC_THERMAL_EVENT',
  PRESCRIBED_FIRE: 'PRESCRIBED_OR_MANAGED_FIRE',
  AGRICULTURAL_BURN: 'AGRICULTURAL_BURN',
  PERSISTENT_ANOMALY: 'AMBIGUOUS_THERMAL_EVENT',
  VIEW_GEOMETRY_ARTEFACT: 'AMBIGUOUS_THERMAL_EVENT',
});

export async function buildNegativeOpportunityAtlas({ projectRoot = process.cwd() } = {}) {
  const foundry = dataFoundryPaths(projectRoot), paths = decisionFoundryPaths(projectRoot);
  const [ledger, registry] = await Promise.all([
    readJson(foundry.opportunities, { opportunities: [] }),
    readJson(foundry.hardNegatives, { entries: [] }),
  ]);
  const byOpportunity = new Map(registry.entries.map((item) => [item.id.replace(/^hard-negative-registry:/, ''), item]));
  const entries = ledger.opportunities.map((item) => {
    const hard = byOpportunity.get(item.id), proof = item.proof ?? {};
    return createNegativeAtlasEntry({
      id: `atlas:${item.id}`,
      geometry: item.geometry,
      timeWindow: item.window,
      sourceFamily: hard?.sourceFamily ?? item.sourceId ?? 'UNKNOWN',
      label: hard ? (CATEGORY_TO_TAXONOMY[hard.category] ?? 'AMBIGUOUS_THERMAL_EVENT') : 'VALID_NO_WILDFIRE',
      proof: {
        coverage: proof.covered,
        providerHealthy: proof.providerHealthy,
        productAvailable: proof.productAvailable,
        observationOpportunity: proof.retrievalSucceeded && proof.covered && proof.productAvailable,
        qualitySufficient: proof.qualitySufficient,
        officialSourcesChecked: proof.officialSourcesChecked,
        physicalSourcesChecked: proof.physicalSourcesChecked,
        labelDoctrineSatisfied: false,
        knowledgeTimeValid: Boolean(item.createdAt && item.window?.to && Date.parse(item.createdAt) >= Date.parse(item.window.to)),
        rightsPermitUse: false,
      },
      physicalObservationIds: item.originalObservationIds,
      officialCheckIds: [],
      persistentAnomalyIds: hard?.category === 'PERSISTENT_ANOMALY' ? hard.labelEvidence : [],
      prescribedFireCheckIds: hard?.category === 'PRESCRIBED_FIRE' ? hard.labelEvidence : [],
      knowledgeTimeCutoff: item.createdAt ?? item.window?.to,
      reviewState: hard?.reviewState ?? 'AWAITING_CERTIFICATION',
      hardNegativeCategory: hard?.category ?? null,
      rightsManifestId: null,
    });
  });
  const atlas = certifyNegativeAtlas(entries);
  await writeJsonAtomic(paths.atlas, atlas);
  return atlas;
}

export function explainNegativeCandidate(entry) {
  return Object.freeze({
    candidateId: entry.id,
    sourceCoverage: entry.proof.coverage,
    providerHealthy: entry.proof.providerHealthy,
    physicalSourcesChecked: entry.proof.physicalSourcesChecked,
    officialSourcesChecked: entry.proof.officialSourcesChecked,
    persistentAnomalyContext: entry.persistentAnomalyIds,
    prescribedFireContext: entry.prescribedFireCheckIds,
    decision: entry.certified ? entry.label : entry.label === 'UNKNOWN' ? 'UNKNOWN' : 'NO_OPPORTUNITY',
    reasons: entry.rejectionReasons,
    emptyResponseRule: 'An empty provider response is not proof of coverage, health, observation opportunity, quality, or absence.',
    emptyResponseCanCertify: false,
  });
}
