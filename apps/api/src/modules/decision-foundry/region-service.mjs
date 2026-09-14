import { adjudicateRegion, selectSecondRegion } from '../../../../../packages/domain/src/decision-foundry/index.mjs';
import { writeJsonAtomic } from '../../shared/json-file.mjs';
import { decisionFoundryPaths } from './decision-foundry-paths.mjs';

const PORTUGAL_EVIDENCE = Object.freeze(['docs/intelligence/portugal-partner-access-dossier.md']);
const CANADA_EVIDENCE = Object.freeze([
  'https://cwfis.cfs.nrcan.gc.ca/ha/nfdb',
  'https://cwfis.cfs.nrcan.gc.ca/downloads/docs/en/references/cwfif/cwfis-data-placemat.pdf',
  'https://cwfis.cfs.nrcan.gc.ca/downloads/nfdb/fire_poly/current_version/NFDB_documentation_EN.pdf',
  'https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps-datamart_en/',
  'https://open.canada.ca/data/en/dataset/851e6a27-a250-41e6-9cd0-d7ff96455dd6',
]);

export async function adjudicateSecondRegions({ projectRoot = process.cwd() } = {}) {
  const portugal = adjudicateRegion({
    regionId: 'portugal', authoritativeIncidentIdentity: 'READY', progressionSequence: 'FINAL_ONLY', issueTimeWeather: 'AVAILABLE', fuelTerrainContext: 'ADEQUATE', futureLabels: 'FINAL_ONLY', knowledgeTimeSemantics: 'INSUFFICIENT_TIMESTAMPS', rights: 'ADEQUATE', physicalObservations: 'AVAILABLE', negativeOpportunities: 'MISSING', partnerRequired: true, expectedIncidentCount: 0, engineeringCost: 'MEDIUM', externalDependency: 'Partner-provided operational perimeter revisions, provider publication times, written use rights, and label doctrine.', evidenceReferences: PORTUGAL_EVIDENCE,
  });
  const canada = adjudicateRegion({
    regionId: 'canada', authoritativeIncidentIdentity: 'READY', progressionSequence: 'PARTNER_REQUIRED', issueTimeWeather: 'AVAILABLE', fuelTerrainContext: 'READY', futureLabels: 'PARTNER_REQUIRED', knowledgeTimeSemantics: 'PARTNER_REQUIRED', rights: 'ADEQUATE', physicalObservations: 'AVAILABLE', negativeOpportunities: 'CONDITIONAL', partnerRequired: true, expectedIncidentCount: 1, engineeringCost: 'MEDIUM', externalDependency: 'Archived operational perimeter snapshots with provider publication chronology, or a governed prospective shadow-capture agreement.', evidenceReferences: CANADA_EVIDENCE,
  });
  const selection = selectSecondRegion([portugal, canada]), result = { schemaVersion: 'vigia.region-adjudication-report.v1', regions: [portugal, canada], selection };
  await writeJsonAtomic(decisionFoundryPaths(projectRoot).regions, result);
  return result;
}
