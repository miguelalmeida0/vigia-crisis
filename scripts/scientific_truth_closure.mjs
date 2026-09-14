import { acquireGoesOpportunities, certifyGoesNegatives, doctorScientificTruth } from '../apps/api/src/modules/scientific-truth/goes-opportunity-service.mjs';
import { bindCanadianIncidents, buildHardNegativeProduct, captureCanadianWeather, materializeCanadianFuel, materializeCanadianTerrain } from '../apps/api/src/modules/scientific-truth/canada-binding-service.mjs';
import { buildPerimeterLabels, campaignStatus, capturePerimeters } from '../apps/api/src/modules/scientific-truth/perimeter-service.mjs';
import { auditDecisionLearning, recomputeOutcomes } from '../apps/api/src/modules/scientific-truth/decision-learning-service.mjs';
import { buildScientificCorpora, evaluateScience } from '../apps/api/src/modules/scientific-truth/science-service.mjs';
import { buildReleaseImages } from '../apps/api/src/modules/scientific-truth/release-service.mjs';
import { verifyScientificTruthClosure } from '../apps/api/src/modules/scientific-truth/verification-service.mjs';
import { buildScientificTruthClosureReport } from '../apps/api/src/modules/scientific-truth/report-service.mjs';

const commands = Object.freeze({
  doctor: ['Check public GOES access, local parsers, candidate floor, credential presence without printing secrets.', doctorScientificTruth],
  goes: ['Acquire and pair 3–6 recent public GOES-18 ABI FDCF/ACMF scans for at most 300 bounded candidates.', acquireGoesOpportunities],
  negatives: ['Certify sensor-specific GOES negatives from the retained paired-scan artifact; UNKNOWN never counts.', certifyGoesNegatives],
  hard: ['Build nearby-distinct-incident association hard negatives from bound real physical observations.', buildHardNegativeProduct],
  bind: ['Stream the retained 2024/2025 CWFIS ZIPs and bind at most 200 observations per unambiguous incident.', bindCanadianIncidents],
  fuel: ['Materialize at most 50 bounded official NRCan 30 m FBP WCS GeoTIFF packs.', materializeCanadianFuel],
  terrain: ['Materialize at most 50 bounded official CanElevation DTM WCS GeoTIFF packs.', materializeCanadianTerrain],
  weather: ['Capture at most 20 bounded issue-time ECCC HRDPS-PROGNOS packs and write the historical order manifest.', captureCanadianWeather],
  perimeters: ['Capture official BC/Alberta and CWFIS perimeter products and rebuild the append-only campaign.', capturePerimeters],
  labels: ['Build 1h/3h/6h/12h/24h labels without interpolation, identical-state growth, or correction relabeling.', buildPerimeterLabels],
  status: ['Report campaign publications, meaningful revisions, horizons, restart recovery, rights, and replay.', campaignStatus],
  audit: ['Audit the registered Decision Memory cohort, chronology, authority, completeness, and biases.', auditDecisionLearning],
  outcomes: ['Recompute all 100 shadow outcomes without discarding null/unobservable measurements.', recomputeOutcomes],
  corpora: ['Build four deterministic task-specific corpora, splits, leakage audits, and replay.', buildScientificCorpora],
  evaluate: ['Run deterministic non-black-box scientific baselines only where corpus gates allow.', evaluateScience],
  release: ['Build two local Docker images, immutable digests, SPDX SBOMs, and migration provenance.', buildReleaseImages],
  verify: ['Run adversarial, full, static, database, and smoke verification and classify only the frozen frontend baseline.', verifyScientificTruthClosure],
  report: ['Write the A–Z critical-gate report and fail with exit 2 unless the closure gate passes.', buildScientificTruthClosureReport]
});
const command = process.argv[2], args = process.argv.slice(3), help = args.includes('--help') || !command || command === '--help';
if (help) { const selected = commands[command]; process.stdout.write(selected ? `Usage: node scripts/scientific_truth_closure.mjs ${command} [--limit=N] [--scans=3]\n\n${selected[0]}\n\nAll commands use bounded defaults, content-addressed raw retention, rights checks, resumable artifacts, no secret output, safe atomic writes, and nonzero failure exit codes.\n` : `Usage: node scripts/scientific_truth_closure.mjs <command> [options]\n\n${Object.entries(commands).map(([name, [description]]) => `  ${name.padEnd(12)} ${description}`).join('\n')}\n`); process.exit(0); }
if (!commands[command]) { process.stderr.write(`Unknown command: ${command}\n`); process.exit(64); }
const number = (name, fallback) => { const value = args.find((item) => item.startsWith(`--${name}=`))?.split('=')[1]; return value === undefined ? fallback : Number(value); }, options = { projectRoot: process.cwd() };
if (command === 'goes') Object.assign(options, { scans: number('scans', 3), maximumCandidates: number('limit', 160) });
if (command === 'negatives' || command === 'hard') options.target = number('limit', command === 'negatives' ? 100 : 25);
if (command === 'bind') options.maximumObservationsPerIncident = number('limit', 80);
if (command === 'fuel' || command === 'terrain' || command === 'weather') options.limit = number('limit', command === 'weather' ? 10 : 25);
try { const report = await commands[command][1](options), output = { schemaVersion: report.schemaVersion, state: report.decision ?? report.state ?? (report.passed === true ? 'PASS' : undefined), passed: report.passed, fingerprint: report.fingerprint, artifact: report.releaseId ?? null }; process.stdout.write(`${JSON.stringify(output, null, 2)}\n`); if (command === 'report' && report.passed !== true) process.exitCode = 2; } catch (error) { process.stderr.write(`${JSON.stringify({ error: String(error.message ?? error), command }, null, 2)}\n`); process.exitCode = 1; }
