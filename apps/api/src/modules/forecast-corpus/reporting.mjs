import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { writeJsonAtomic } from '../../shared/json-file.mjs';
import { CORPUS_SOURCES } from './source-portfolio.mjs';

const safe = (value) => String(value).replace(/[^a-z0-9._-]+/gi, '_');
export async function writeCorpusDataCards(paths, quality) {
  await mkdir(paths.cards, { recursive: true });
  const cards = CORPUS_SOURCES.map((source) => ({ schemaVersion: 'vigia.corpus-provider-data-card.v1', id: source.id, purpose: source.products.join('; '), coverage: source.regions, period: source.archivePeriod, resolution: source.estimatedVolume, collectionProcess: source.accessMethod, knowledgeTimeSemantics: source.knowledgeTimeQuality, labelConstruction: source.perimeterSequenceCapability === 'FINAL_ONLY' ? 'Retrospective label only.' : 'No label is inferred solely from source presence.', negativeConstruction: 'Source emptiness is never a negative without a separate valid observation opportunity.', knownBias: [source.blocker], knownMissingness: [source.blocker], licence: source.licenceId, appropriateUse: source.perimeterSequenceCapability, inappropriateUse: source.perimeterSequenceCapability === 'FINAL_ONLY' ? 'Issue-time progression feature.' : 'Independent truth without lineage.' }));
  for (const card of cards) await writeJsonAtomic(path.join(paths.cards, `${safe(card.id)}.json`), card);
  const combined = { schemaVersion: 'vigia.forecast-corpus-data-card.v1', purpose: 'Knowledge-time wildfire forecast evaluation.', coverage: quality.regions, period: quality.seasons, collectionProcess: 'Bounded manifest through Bronze, Silver, Gold and deterministic replay.', knowledgeTimeSemantics: 'availableToVigiaAt must not exceed forecastInformationCutoff.', labelConstruction: 'Later progression revisions are target labels only.', negativeConstruction: 'Requires source health, physical opportunity, official and physical absence checks.', knownBias: quality.knownBiases, knownMissingness: quality.unresolvedBlockers, licence: quality.licensingState, appropriateUse: 'Corpus readiness research and leakage-safe evaluation after all gates pass.', inappropriateUse: 'Model promotion, operational action, or claims of skill while decision is CORPUS_NOT_READY.', providerCards: cards.map((item) => item.id) };
  await writeJsonAtomic(path.join(paths.cards, 'combined-corpus.json'), combined); return { providerCards: cards.length, combinedCard: true };
}
export async function writeCorpusReport(paths, report) {
  await writeJsonAtomic(path.join(paths.reports, 'corpus-quality.json'), report);
  const lines = ['# Historical forecast corpus quality', '', `Decision: **${report.decision}**`, '', `Discovered incidents: ${report.incidentsDiscovered}`, `Forecast-eligible incidents: ${report.incidentsEligible}`, `Eligible examples: ${report.examplesEligible}`, `Valid negative controls: ${report.negativeControls.valid}`, `Leakage violations: ${report.leakageViolations}`, '', '## Failed gates', '', ...(report.failedGates.length ? report.failedGates.map((item) => `- ${item}`) : ['- None']), '', '## Unresolved blockers', '', ...(report.unresolvedBlockers.length ? report.unresolvedBlockers.map((item) => `- ${item}`) : ['- None']), '', 'This report does not imply model promotion or forecasting skill.', ''];
  await writeFile(path.join(paths.reports, 'corpus-quality.md'), lines.join('\n'), { mode: 0o600 });
}
