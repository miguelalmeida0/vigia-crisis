import { doctorTruthNetwork, truthNetworkStatus, watchTruthNetwork } from '../apps/api/src/modules/authoritative-truth/watcher-service.mjs';
import { authoritativeConflicts, authoritativeRevisions, refreshAuthoritativeLabels, scoreAuthoritativeForecasts } from '../apps/api/src/modules/authoritative-truth/command-service.mjs';
import { replayTruthNetwork } from '../apps/api/src/modules/authoritative-truth/replay-service.mjs';
import { reportAuthoritativeTruth } from '../apps/api/src/modules/authoritative-truth/report-service.mjs';
import { evaluateAuthoritativeTruthGate } from '../apps/api/src/modules/authoritative-truth/gate-service.mjs';
import { demoAuthoritativeTruthNetwork } from '../apps/api/src/modules/authoritative-truth/demo-service.mjs';
import { verifyAuthoritativeTruthNetwork } from '../apps/api/src/modules/authoritative-truth/verification-service.mjs';

const descriptions = Object.freeze({
  doctor: 'Inspect live provider change capabilities and record only capabilities the official service actually exposes.',
  watch: 'Run the bounded official perimeter watcher once or for a bounded duration with durable campaign recovery.',
  status: 'Report campaign health, watched incidents, raw objects, publications, revisions, labels, cursors, and resumability.',
  revisions: 'Materialize append-only authoritative sequences and classified meaningful geometry revisions.',
  conflicts: 'Materialize official-source conflicts without silently discarding a provider representation.',
  labels: 'Incrementally build strict authoritative 1h/3h/6h/12h/24h labels under the fixed doctrine.',
  score: 'Score eligible pre-truth forecasts and mandatory baselines against later official geometry.',
  replay: 'Verify raw hashes, revision chains, label fingerprints, restart recovery, and backup/restore.',
  report: 'Generate the A–Z authoritative crisis-truth report.',
  gate: 'Evaluate the strict authoritative crisis-truth gate without lowering label or chronology requirements.',
  demo: 'Run two bounded real-source cycles and demonstrate changed or unchanged evidence, resumability, and replay.',
  verify: 'Run the adversarial/property suite, complete regression suite, database certification, smoke, replay, and performance gates.'
});

const args = process.argv.slice(3), command = process.argv[2], help = !command || command === '--help' || args.includes('--help');
if (help) {
  const usage = command && descriptions[command] ? `Usage: node scripts/authoritative_truth_network.mjs ${command}${command === 'watch' ? ' [--once | --duration=1h] [--incident=ID | --region=REGION | --all-active] [--resume=CAMPAIGN]' : ''}\n\n${descriptions[command]}\n` : `Usage: node scripts/authoritative_truth_network.mjs <command> [options]\n\n${Object.entries(descriptions).map(([name, value]) => `  ${name.padEnd(10)} ${value}`).join('\n')}\n`;
  process.stdout.write(`${usage}\nBounded defaults, provider-safe cadence, redacted diagnostics, atomic persistence, clean shutdown, deterministic fingerprints, and meaningful nonzero failure exits apply to every command. No watcher remains in the background after the command exits.\n`); process.exit(0);
}
if (!descriptions[command]) { process.stderr.write(`Unknown command: ${command}\n`); process.exit(64); }
const value = (name) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const duration = (input) => { if (!input) return 0; const match = String(input).match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/); if (!match) throw new Error('duration_must_use_ms_s_m_or_h'); const factors = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }, result = Number(match[1]) * factors[match[2]]; if (!(result > 0 && result <= 86_400_000)) throw new Error('duration_outside_bounded_24h_maximum'); return result; };
const handlers = { doctor: doctorTruthNetwork, watch: watchTruthNetwork, status: truthNetworkStatus, revisions: authoritativeRevisions, conflicts: authoritativeConflicts, labels: refreshAuthoritativeLabels, score: scoreAuthoritativeForecasts, replay: replayTruthNetwork, report: reportAuthoritativeTruth, gate: evaluateAuthoritativeTruthGate, demo: demoAuthoritativeTruthNetwork, verify: verifyAuthoritativeTruthNetwork };
try {
  const durationMs = duration(value('duration')), options = { projectRoot: process.cwd() };
  if (command === 'watch') Object.assign(options, { once: args.includes('--once') || !durationMs, durationMs, incident: value('incident'), region: value('region'), allActive: args.includes('--all-active'), resume: value('resume') });
  const result = await handlers[command](options), output = { schemaVersion: result.schemaVersion, state: result.decision ?? result.state ?? (result.passed === true ? 'PASS' : undefined), passed: result.passed, campaignId: result.campaignId, fingerprint: result.fingerprint ?? result.statusFingerprint ?? null, resumeCommand: result.resumeCommand ?? null };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`); if (['report', 'gate'].includes(command) && result.passed !== true) process.exitCode = 2;
} catch (error) { process.stderr.write(`${JSON.stringify({ command, error: String(error.message ?? error), secretsRecorded: false }, null, 2)}\n`); process.exitCode = 1; }
