// Real-data acceptance for VIGIA Intelligence VIII.
//
// Runs the collection-intelligence engine over the REAL retained Évora
// Operational Picture captured during Mega VII
// (docs/handoffs/mega-vii/live-proof.json), and prints what VIGIA now knows
// about its own unknowns.
//
// It reads a retained capture. It performs no acquisition, contacts no source,
// and writes nothing. Anything it cannot derive from that capture is reported as
// unavailable rather than filled in.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {informationRequirements, knowledgeStateFromPicture} from '../packages/domain/src/intelligence/information-requirements.mjs';
import {explainRequirement, nextVerificationTasks} from '../packages/domain/src/intelligence/collection-tasking.mjs';
import {requirementSourceIndex} from '../packages/domain/src/intelligence/collection-sources.mjs';
import {reconcileRequirements} from '../packages/domain/src/intelligence/collection-lifecycle.mjs';
import {previewKnowledgeImpact} from '../packages/domain/src/intelligence/epistemic-impact.mjs';
import {controlledSituation} from '../apps/api/test/collection-intelligence-fixture.mjs';

const corpusFile = process.env.VIGIA_ACCEPTANCE_CORPUS ?? 'docs/handoffs/mega-vii/live-proof.json';
const outputFile = process.env.VIGIA_ACCEPTANCE_OUTPUT ?? 'docs/handoffs/intelligence-viii/acceptance-real-evora.json';
const proof = JSON.parse(await readFile(corpusFile, 'utf8'));

const percentile = (values, quantile) => {
  const rows = [...values].sort((left, right) => left - right);
  return rows.length ? Number(rows[Math.min(rows.length - 1, Math.ceil(rows.length * quantile) - 1)].toFixed(2)) : null;
};
const timed = (label, work, iterations = 20) => {
  const rows = [];
  let value = null;
  for (let index = 0; index < iterations; index += 1) { const started = performance.now(); value = work(); rows.push(performance.now() - started); }
  return {label, value, p50Ms: percentile(rows, .5), p95Ms: percentile(rows, .95), iterations};
};

const lanes = [];
for (const [lane, capture] of [['historical (support intact)', proof.historical], ['current (routes expired)', proof.picture]]) {
  if (!capture?.support) continue;
  const state = knowledgeStateFromPicture(capture);
  const requirementsRun = timed('requirements', () => informationRequirements(state));
  const requirements = requirementsRun.value;
  const sourceIndex = requirementSourceIndex(requirements, {sources: [], at: requirements.evaluatedAt});
  const taskingRun = timed('tasking', () => nextVerificationTasks(requirements, {sourcesByRequirementId: sourceIndex, limit: 5}));
  const lifecycle = reconcileRequirements({retained: [], generated: requirements.requirements, at: requirements.evaluatedAt});

  lanes.push({
    lane,
    incidentId: capture.incident.id,
    incidentName: capture.incident.name,
    knownAt: capture.knownAt,
    origin: requirements.origin,
    requirementCount: requirements.total,
    byClass: Object.fromEntries([...new Set(requirements.requirements.map((row) => row.requirementClass))].map((requirementClass) => [requirementClass, requirements.requirements.filter((row) => row.requirementClass === requirementClass).length])),
    lifecycle: {open: lifecycle.open, resolved: lifecycle.resolved, expired: lifecycle.expired, openedEvents: lifecycle.events.length},
    performance: {requirements: {p50Ms: requirementsRun.p50Ms, p95Ms: requirementsRun.p95Ms}, tasking: {p50Ms: taskingRun.p50Ms, p95Ms: taskingRun.p95Ms}},
    tasks: taskingRun.value.tasks.map((task) => ({
      rank: task.rank,
      requirementClass: task.requirementClass,
      subject: task.subject.name,
      question: task.question,
      currentKnownState: task.currentKnownState.state,
      reasons: task.reasons,
      sourceState: task.sourceTasking?.state ?? null,
      explanation: explainRequirement(requirements.requirements.find((row) => row.id === task.requirementId), {sourceTasking: task.sourceTasking}).facts
    }))
  });
}

// The preview engine needs a full situation snapshot with facility fields and
// provenance. The retained Operational Picture is a compacted projection that
// does not carry them, and data/runtime/ (which does) is excluded from this
// repository by .gitignore. The demonstration below therefore runs on the
// CONTROLLED_TEST fixture and is labelled as such. It is not real Évora data and
// must never be read as one.
const controlledSnapshot = controlledSituation();
const controlledRun = timed('preview', () => previewKnowledgeImpact(controlledSnapshot, {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'h-x', capability: 'emergencyDepartment'}));
const preview = controlledRun.value;
const controlledPreview = {
  state: 'DEMONSTRATED_ON_CONTROLLED_DATA_ONLY',
  universe: controlledSnapshot.universe,
  reason: 'A knowledge-impact preview needs a full situation snapshot with facility fields and provenance. The retained Operational Picture is a compacted projection without them, and data/runtime/ is excluded from this repository. Run this script on the machine holding data/runtime/ to demonstrate the preview on real retained data.',
  label: preview.label,
  performance: {p50Ms: controlledRun.p50Ms, p95Ms: controlledRun.p95Ms},
  operationalWrites: preview.operationalWrites,
  snapshotUnchanged: JSON.stringify(controlledSnapshot) === JSON.stringify(controlledSituation()),
  assumption: preview.assumption,
  unresolvedBranch: preview.branches.unresolved,
  confirmedBranch: preview.branches.confirmed,
  changes: {
    primaryChanged: preview.changes.primaryChanged,
    affectedCommunityCount: preview.changes.affectedCommunityCount,
    coverageClassificationChangeCount: preview.changes.coverageClassificationChangeCount,
    rankingChanges: preview.changes.rankingChanges
  }
};

const report = {
  schemaVersion: 'vigia.collection-intelligence-acceptance.v1',
  ranAt: new Date().toISOString(),
  corpus: corpusFile,
  corpusNature: 'REAL_RETAINED_OPERATIONAL_CAPTURE',
  corpusBoundary: 'Real Operational Picture responses captured from the running product during Mega VII for incident PT-2026-01F7E2E21A (Évora). They are retained knowledge states, not live observations, and nothing here re-contacts a source.',
  knowledgeImpactPreview: controlledPreview,
  lanes
};
await mkdir(path.dirname(outputFile), {recursive: true});
await writeFile(outputFile, JSON.stringify(report, null, 2));

for (const lane of report.lanes) {
  console.log(`\n=== ${lane.incidentName} · ${lane.lane} · retained ${lane.knownAt} ===`);
  console.log(`${lane.requirementCount} information requirements · ${JSON.stringify(lane.byClass)}`);
  console.log(`requirements p95 ${lane.performance.requirements.p95Ms} ms · tasking p95 ${lane.performance.tasking.p95Ms} ms\n`);
  console.log('NEXT TO VERIFY\n');
  for (const task of lane.tasks) {
    console.log(`${task.rank}. ${task.subject} — ${task.question}`);
    for (const reason of task.reasons) console.log(`   - ${reason}`);
    console.log('');
  }
}
console.log(`\n=== KNOWLEDGE IMPACT PREVIEW · ${controlledPreview.universe} — NOT real Évora data ===`);
console.log(controlledPreview.label);
console.log(`If ${preview.assumption.subjectName} had a verified emergency department:`);
console.log(`  primary: ${controlledPreview.unresolvedBranch.primary?.name} (${controlledPreview.unresolvedBranch.primary?.minutes} min) -> ${controlledPreview.confirmedBranch.primary?.name} (${controlledPreview.confirmedBranch.primary?.minutes} min)`);
console.log(`  retained options: ${controlledPreview.unresolvedBranch.optionCount} -> ${controlledPreview.confirmedBranch.optionCount}`);
console.log(`  communities affected: ${controlledPreview.changes.affectedCommunityCount}`);
console.log(`  coverage classifications that could change: ${controlledPreview.changes.coverageClassificationChangeCount}`);
console.log(`  operational writes: ${controlledPreview.operationalWrites} · snapshot unchanged: ${controlledPreview.snapshotUnchanged} · preview p95 ${controlledPreview.performance.p95Ms} ms`);
console.log(`\nWritten to ${outputFile}`);
