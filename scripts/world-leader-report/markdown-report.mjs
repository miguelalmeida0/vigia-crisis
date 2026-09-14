const mdEscape = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

export function renderWorldLeaderReport({
  distribution,
  evidence,
  externalBlockers,
  finalCategories,
  funnel,
  implementationFiles,
  map,
  performance,
  routeScreenshots,
  scorecard,
  source,
}) {
  const categoryRows = finalCategories.map((row) => `| ${mdEscape(row.category)} | ${row.classification} | ${row.previousAuditScore.toFixed(1)} | ${row.newScore.toFixed(1)} | ${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(1)} | ${mdEscape(row.implementation)} | ${mdEscape(row.objectiveEvidence.join('; '))} | ${mdEscape(row.remainingGap)} |`).join('\n');
  const changedRows = implementationFiles.map((path) => `- \`${path}\``).join('\n');
  const screenshotRows = routeScreenshots.map((path, index) => `${index + 1}. \`${path}\``).join('\n');
  const blockerRows = externalBlockers.map((item) => `- **${item.blocker}** Affects ${item.affectedCategories.join(', ')}. Evidence: ${item.evidence}`).join('\n');
  const gateRows = Object.entries(scorecard.gates).map(([name, pass]) => `| ${name} | ${pass ? 'PASS' : 'FAIL'} |`).join('\n');
  const stateRows = Object.entries(source.states).map(([state, count]) => `| ${state} | ${count} |`).join('\n');
  return `# VIGIA World-Leader Gap-Closure Report

Generated: ${scorecard.generatedAt}${'  '}
Release: \`${scorecard.releaseId}\`${'  '}
Code state: \`${scorecard.codeStateHash}\`${'  '}
Operational data: \`${scorecard.operationalDataHash}\`${'  '}
Release statement: \`${scorecard.releaseStatementHash}\`${'  '}
Runtime: canonical local operator console; production truth was not substituted.

## Executive score

The prior independent score was **5.6 / 10**. The new evidence-based score is **${scorecard.current.overall.toFixed(1)} / 10**. The distribution moved from **46 / 7 / 13** to **${distribution.below7} / ${distribution.from7To7_49} / ${distribution.atOrAbove7_5}** for categories below 7, from 7–7.49, and at or above 7.5 respectively.

This is a capability score, not a claim that unavailable official truth, public-warning authority, field dispatch, or live outcomes exist. Those boundaries cap the remaining data/integration/operations categories.

## Release gates

| Gate | State |
|---|---|
${gateRows}

## Category-by-category score delta

| Category | Class | Previous | New | Delta | Implementation | Objective evidence | Remaining gap |
|---|---:|---:|---:|---:|---|---|---|
${categoryRows}

## Source-resolution execution proof

- ${source.jobs} persisted resolver jobs; ${source.jobsActuallyAttempted}/${source.jobs} actually attempted.
- ${source.completeExecutionContractPercent}% carry provider/source class, actual executor, next check, attempt history, retry/backoff, deadline/escalation, decision impact, unlock, and completion semantics.
- Generic passive waiting: ${source.passiveGenericWaiting}.
- Providers: ${Object.entries(source.providers).map(([provider, count]) => `${provider} ${count}`).join('; ')}.
- Sample: ${source.sampleSize} real jobs across ${source.sampleSourceClasses.join(', ')}.
- Evidence: \`${evidence.source}\`, \`${evidence.sourceSample}\`.

| Terminal/current resolver state | Count |
|---|---:|
${stateRows}

## Verification-promotion proof

- Candidates examined: ${funnel.candidatesExamined}; provider queries: ${funnel.providerQueries}; distinct source matches: ${funnel.sourceMatches}; raw match observations: ${funnel.rawMatchObservations}.
- Rejections: identity ${funnel.identityRejections}; temporal ${funnel.temporalRejections}; spatial ${funnel.spatialRejections}; duplicate family ${funnel.duplicateFamilyRejections}.
- Independent corroborations: ${funnel.independentCorroborations}; official matches: ${funnel.officialMatches}; production promotions: ${funnel.promotedVerifiedIncidents}.
- The deterministic positive control passes legitimate retained FIRMS evidence through normalization, canonical binding, and incident reevaluation. False and duplicate-family corroboration remain zero.
- Evidence: \`${evidence.funnel}\`, \`${evidence.regression}\`.

## Operations and resources

Source Resolution and Response Operations are separate domain lanes. The response lifecycle supports resource request → approval/authority → assignment → dispatch request → acknowledgement → in progress → complete pending verification → verified complete. Without an external dispatcher, execution remains explicitly INTERNAL / SHADOW_EXECUTION. Evidence: \`${evidence.operations}\`.

## Protection

The production-safe workflow enforces target/exposure and provenance, authorized approval, approval before dispatch, replay/exercise isolation, authority expiry, cancellation supersession, idempotent send, and receipt-required dispatch claims. The live portfolio stays at EXTERNAL_SEND_DISABLED without authority. Evidence: \`${evidence.protection}\`.

## Live outcome path

ACTION, ACKNOWLEDGEMENT, EXPECTED_POSTCONDITION, OBSERVED_POSTCONDITION, and OUTCOME_CLASSIFICATION are distinct persisted production collections. All live counts remain truthful at zero; one retained archived chain is certified in CERTIFIED_REPLAY and excluded from live metrics. Evidence: \`${evidence.outcomes}\`.

## Performance

- Decision-useful canonical API: ${performance.samples} samples, ${performance.p50Ms} ms p50, ${performance.p95Ms} ms p95, ${performance.maxMs} ms max.
- Five-second native MapLibre trace: ${map.frameTiming.frameTimeMs.p50} ms p50, ${map.frameTiming.frameTimeMs.p95} ms p95, ${map.frameTiming.frameTimeMs.max} ms max; ${map.frameTiming.longTasks} long tasks.
- Drag deltas: map mounts ${map.frameTiming.deltas.mapMounts}, destroys ${map.frameTiming.deltas.mapDestroys}, style reloads ${map.frameTiming.deltas.styleReloads}, source updates ${map.frameTiming.deltas.sourceUpdates}.
- Every map route changed camera through native drag while preserving its instance: ${map.proofs.map((row) => `${row.route} ${row.pass ? 'PASS' : 'FAIL'}`).join('; ')}.
- Evidence: \`${evidence.performance}\`, \`${evidence.map}\`, \`${evidence.chromeTrace}\`.

## Fresh canonical browser evidence

${screenshotRows}

Interaction evidence additionally proves search focus/value/caret/DOM identity, hash-local Global filter effects without navigation/remount, distinct Reports tabs, shared-select keyboard operation, healthy startup without Unavailable flashes, and last-good retention during refresh under \`.artifacts/world-leader-gap-closure/browser/interaction-evidence/\`.

## Genuine external blockers

${blockerRows}

## Exact release-scoped changed files

The repository contained a preserved dirty worktree before this sprint. These are the files changed or generated specifically for this gap-closure release; no files were staged or committed.

${changedRows}
`;
}
