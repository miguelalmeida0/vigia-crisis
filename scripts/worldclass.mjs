#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adjudicateOutcomes, certifyCompartments, cleanRoomCertification, corpusWorldclassGate, doctrineCoverage, forecastEvaluation, haCertification, partnerGatewayDoctor, prepareOperatorEvaluation, regionalShadowArchive, releaseCanary, releaseRollback, sub75Report, worldclassDoctor } from '../apps/api/src/modules/worldclass/certification-service.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), command = process.argv[2] ?? 'help', args = process.argv.slice(3), value = (name) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const descriptions = {
  doctor: 'Run the aggregate fail-closed world-class readiness doctor.', ha: 'Validate imported evidence from 100 real multi-region failover cycles.', security: 'Run compartment adversarial checks and report RLS/KMS/independent gates.', archive: 'Prepare or validate the bounded seven-day regional shadow campaign.', outcomes: 'Adjudicate the existing real outcome ledger; never creates outcomes.', doctrine: 'Compile and certify the deterministic 100-state doctrine corpus.', corpus: 'Apply scientific corpus promotion gates; never trains a model.', forecast: 'Write the preregistered evaluation ladder and enforce the corpus block.', operator: 'Prepare or validate the external-practitioner evaluation package.', partner: 'Validate and ingest one configured real allowlisted CAP feed.', canary: 'Request a bounded canary through the configured release controller.', rollback: 'Request an idempotent rollback through the configured release controller.', cleanroom: 'Build the clean-room kit and validate an independent reviewer attestation.', report: 'Write the two-score sub-7.5 scorecard and final defensible decision.',
};
function help() { console.log(`Usage: node scripts/worldclass.mjs <command> [options]\n\n${descriptions[command] ?? 'Commands: ' + Object.keys(descriptions).join(', ')}\n\nOptions:\n  --evidence=<path>              HA or regional-campaign evidence JSON\n  --results=<path>               Real operator-session results JSON\n  --reviewer-attestation=<path>  Independent clean-room attestation JSON\n  --release-id=<id>              Exact immutable release identity\n  --json                         Print the full artifact instead of the gate summary\n  --help                         Show help and exit 0\n\nDefaults are bounded, foreground-only, deterministic, secret-redacting, and perform no simulated external evidence.`); }
if (args.includes('--help') || args.includes('-h') || command === 'help') { help(); process.exit(0); }

let report;
try {
  if (command === 'doctor') report = await worldclassDoctor({ projectRoot });
  else if (command === 'ha') report = await haCertification({ projectRoot, evidenceFile: value('evidence') });
  else if (command === 'security') report = await certifyCompartments({ projectRoot });
  else if (command === 'archive') report = await regionalShadowArchive({ projectRoot, evidenceFile: value('evidence') });
  else if (command === 'outcomes') report = await adjudicateOutcomes({ projectRoot });
  else if (command === 'doctrine') report = await doctrineCoverage({ projectRoot });
  else if (command === 'corpus') report = await corpusWorldclassGate({ projectRoot });
  else if (command === 'forecast') report = await forecastEvaluation({ projectRoot });
  else if (command === 'operator') report = await prepareOperatorEvaluation({ projectRoot, resultsFile: value('results') });
  else if (command === 'partner') report = await partnerGatewayDoctor({ projectRoot });
  else if (command === 'canary') report = await releaseCanary({ projectRoot, environment: process.env, releaseId: value('release-id') });
  else if (command === 'rollback') report = await releaseRollback({ projectRoot, environment: process.env, releaseId: value('release-id') });
  else if (command === 'cleanroom') report = await cleanRoomCertification({ projectRoot, reviewerAttestationFile: value('reviewer-attestation') });
  else if (command === 'report') report = await sub75Report({ projectRoot });
  else { console.error(JSON.stringify({ error: `unknown_command:${command}` })); process.exit(2); }
  const names = { doctor: 'worldclass-doctor.json', ha: 'ha-certification.json', security: 'security-compartments.json', archive: 'regional-shadow-archive.json', outcomes: 'outcome-adjudication.json', doctrine: 'doctrine-coverage.json', corpus: 'corpus-worldclass-gate.json', forecast: 'forecast-evaluation.json', operator: 'operator-evaluation-package.json', partner: 'partner-gateway-doctor.json', canary: 'release-canary.json', rollback: 'release-rollback.json', cleanroom: 'clean-room-certification.json', report: 'sub-75-scorecard.json' }, output = args.includes('--json') ? report : { schemaVersion: report.schemaVersion, state: report.state ?? report.decision ?? (report.passed ? 'PASS' : 'BLOCKED'), passed: report.passed === true, fingerprint: report.fingerprint, artifact: `data/validation/worldclass/${names[command]}` };
  console.log(JSON.stringify(output, null, 2)); if (report.passed !== true) process.exitCode = 3;
} catch (error) { console.error(JSON.stringify({ command, error: String(error.message ?? error), secretsRecorded: false })); process.exitCode = /required|invalid|unknown/.test(String(error.message ?? error)) ? 2 : 1; }
