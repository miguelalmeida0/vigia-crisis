import { acquireCanadianEvidence } from '../apps/api/src/modules/worldclass/public-evidence-war-room.mjs';
import { acquireGovernmentCapEvidence } from '../apps/api/src/modules/worldclass/government-cap-evidence.mjs';
import { buildHistoricalShadowDecisions } from '../apps/api/src/modules/worldclass/historical-shadow-evidence.mjs';
import { auditExecutionCapabilities, reportScientificEvidence } from '../apps/api/src/modules/worldclass/public-evidence-evaluation.mjs';

const root = process.cwd(), command = process.argv[2] ?? 'all', args = new Map(process.argv.slice(3).filter((item) => item.startsWith('--')).map((item) => { const [key, ...rest] = item.slice(2).split('='); return [key, rest.length ? rest.join('=') : true]; }));
const integer = (name, fallback) => { const value = Number(args.get(name) ?? fallback); if (!Number.isSafeInteger(value) || value < 1) throw new Error(`invalid_${name}`); return value; };
const compact = (value) => ({ schemaVersion: value.schemaVersion, passed: value.passed, fingerprint: value.fingerprint, rawObjects: value.rawObjects, bytes: value.bytes, discoveredIncidents: value.discoveredIncidents ?? value.incidents?.discovered, forecastEligible: value.forecastEligibleIncidents ?? value.incidents?.forecastEligible, episodes: value.episodes?.length, acquisitionOpportunities: value.acquisitionOpportunities, informationValueOutcomes: value.informationValueOutcomes?.length, totals: value.totals, cloud: value.cloud, localHa: value.localHa, kms: value.kms });
const output = {};

if (command === 'canada' || command === 'all') {
  const result = await acquireCanadianEvidence({ projectRoot: root, historicalYears: integer('years', 10), includeLargeHotspotArchives: args.get('skip-large-archives') !== true });
  output.canada = compact(result.catalogue);
}
if (command === 'shadow' || command === 'all') output.shadow = compact(await buildHistoricalShadowDecisions({ projectRoot: root, maximumEpisodes: integer('episodes', 100) }));
if (command === 'cap' || command === 'all') output.cap = compact(await acquireGovernmentCapEvidence({ projectRoot: root, nwsMaximumMessages: integer('nws-messages', 75), ecccMaximumMessages: integer('eccc-messages', 150), ecccDays: integer('eccc-days', 3) }));
if (command === 'capabilities' || command === 'all') output.capabilities = compact(await auditExecutionCapabilities({ projectRoot: root }));
if (command === 'science' || command === 'all') { const result = await reportScientificEvidence({ projectRoot: root }); output.science = { validNegatives: result.negative.validNegatives, hardNegatives: result.negative.hardNegatives, nearTermLabels: result.nearTerm.labelCandidates.length, snapshots: result.nearTerm.snapshots, fingerprint: result.nearTerm.fingerprint }; }
if (!['all', 'canada', 'shadow', 'cap', 'capabilities', 'science'].includes(command)) throw new Error('Usage: node scripts/evidence_war_room.mjs [all|canada|shadow|cap|capabilities|science] [--years=10] [--skip-large-archives] [--episodes=100] [--nws-messages=75] [--eccc-messages=150] [--eccc-days=3]');
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
