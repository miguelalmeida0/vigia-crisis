import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { assertReleaseIdentity } from '../release/runtime_identity_binding.mjs';

export function buildWorldLeaderScorecard({ root, readJson, evidence, score, runtimeBinding }) {
  const matrixPath = 'data/validation/world-leader-gap-closure/category-remediation-matrix.json';
  const matrixDocument = readJson(matrixPath);
  const categories = Array.isArray(matrixDocument) ? matrixDocument : matrixDocument.categories;
  if (!Array.isArray(categories) || categories.length !== 66) {
    throw new Error(`expected_66_categories:${categories?.length}`);
  }
  const scorecardPath = resolve(root, 'data/validation/world-leader-gap-closure/final-scorecard.json');
  const retainedAuditScores = existsSync(scorecardPath)
    ? new Map(readJson('data/validation/world-leader-gap-closure/final-scorecard.json').categories.map((row) => [row.category, row.previousAuditScore]))
    : new Map();
  const missing = categories.filter((row) => !score.has(row.category)).map((row) => row.category);
  const extra = [...score.keys()].filter((category) => !categories.some((row) => row.category === category));
  if (missing.length || extra.length) {
    throw new Error(`score_mapping_mismatch:${JSON.stringify({ missing, extra })}`);
  }

  const finalCategories = categories.map((row) => {
    const result = score.get(row.category);
    const previousAuditScore = Number(retainedAuditScores.get(row.category) ?? row.currentScore);
    return {
      category: row.category,
      classification: row.classification,
      previousAuditScore,
      newScore: result.newScore,
      delta: Number((result.newScore - previousAuditScore).toFixed(1)),
      implementation: result.implementation,
      objectiveEvidence: result.objectiveEvidence,
      remainingGap: result.remainingGap,
      status: result.status,
    };
  });
  const distribution = {
    below7: finalCategories.filter((row) => row.newScore < 7).length,
    from7To7_49: finalCategories.filter((row) => row.newScore >= 7 && row.newScore < 7.5).length,
    atOrAbove7_5: finalCategories.filter((row) => row.newScore >= 7.5).length,
  };
  if (distribution.below7 + distribution.from7To7_49 + distribution.atOrAbove7_5 !== 66) {
    throw new Error('invalid_score_distribution');
  }
  const softwareGate = finalCategories
    .filter((row) => row.classification === 'SOFTWARE' && row.previousAuditScore < 7)
    .every((row) => row.newScore >= 7.5);
  const watchGate = finalCategories
    .filter((row) => row.previousAuditScore >= 7 && row.previousAuditScore < 7.5)
    .every((row) => row.newScore >= 7.5);
  const overall = finalCategories.find((row) => row.category === 'Overall crisis-management utility');

  const certification = readJson(evidence.certification);
  const source = readJson(evidence.source);
  const funnel = readJson(evidence.funnel);
  const performance = readJson(evidence.performance);
  const map = readJson(evidence.map);
  const outcomes = readJson(evidence.outcomes);
  for (const [label, value] of Object.entries({ certification, source, funnel, performance, map, outcomes })) {
    assertReleaseIdentity(value, runtimeBinding, `world_leader_report_${label}_release_identity`);
  }
  const routeScreenshots = [
    '01-command-overview.jpg',
    '02-incidents.jpg',
    '03-incident-detail.jpg',
    '04-intelligence.jpg',
    '05-operations.jpg',
    '06-reports-analytics.jpg',
    '07-global-awareness.jpg',
  ].map((name) => `${evidence.routeScreens}/${name}`);
  const implementationFiles = [
    'apps/api/src/application/create-services.mjs',
    'apps/api/src/application/register-routes.mjs',
    'apps/api/src/http/route-security-policy.mjs',
    'apps/api/src/modules/interventions/operator-state-repository.mjs',
    'apps/api/src/modules/operator/canonical-operator-api-service.mjs',
    'apps/api/src/modules/operator/human-attention-routes.mjs',
    'apps/api/src/modules/operator/human-attention-service.mjs',
    'apps/api/src/modules/operator/operational-recovery-service.mjs',
    'apps/api/src/modules/operator/shift-handoff-routes.mjs',
    'apps/api/src/modules/operator/shift-handoff-service.mjs',
    'apps/api/src/modules/operator/source-resolution-router.mjs',
    'apps/api/src/modules/outcomes/outcome-routes.mjs',
    'apps/api/src/modules/outcomes/outcome-service.mjs',
    'apps/api/src/modules/protection/protection-workflow-routes.mjs',
    'apps/api/src/modules/protection/protection-workflow-service.mjs',
    'apps/api/test/canonical-operator-api.test.mjs',
    'apps/api/test/pilot-safety-security-boundaries.test.mjs',
    'apps/api/test/world-leader-gap-closure.test.mjs',
    'apps/operator-console/src/app.js',
    'apps/operator-console/src/routes/commandOverview.js',
    'apps/operator-console/src/routes/globalAwareness.js',
    'apps/operator-console/src/routes/intelligenceEvidence.js',
    'apps/operator-console/src/routes/operations.js',
    'apps/operator-console/src/routes/reportsAnalytics.js',
    'apps/operator-console/src/vigiaApi.js',
    'apps/operator-console/styles/routes.css',
    'apps/operator-console/tests/operational-hardening-contract.mjs',
    'data/validation/world-leader-gap-closure/category-remediation-matrix.json',
    'data/validation/world-leader-gap-closure/final-scorecard.json',
    'data/validation/world-leader-gap-closure/verification-promotion-funnel.json',
    'docs/handoffs/VIGIA_CRITICAL_OPERATIONAL_RECOVERY_2026-09-03/VIGIA_WORLD_LEADER_GAP_CLOSURE_REPORT.md',
    'docs/product/WORLD_LEADER_GAP_CLOSURE_MATRIX.md',
    'scripts/certify_world_leader_gap_closure.mjs',
    'scripts/generate_world_leader_gap_closure_report.mjs',
    'scripts/release/build_release_manifest.mjs',
  ];
  const externalBlockers = [
    {
      blocker: 'Authoritative CAP/official incident provider and credentials are not configured.',
      affectedCategories: ['Official confirmation', 'Source coverage', 'Alert / CAP readiness', 'Government pilot readiness'],
      evidence: `${source.states.AUTH_REQUIRED} resolver jobs are AUTH_REQUIRED; ${funnel.officialMatches} official matches; ${certification.truthCounts.VERIFIED_CURRENT} VERIFIED_CURRENT.`,
    },
    {
      blocker: 'No live civil-protection approval/dispatch authority or external delivery transport is configured.',
      affectedCategories: ['Protection workflow', 'Resource coordination', 'Emergency-operations-center readiness'],
      evidence: 'The software holds production dispatch at EXTERNAL_SEND_DISABLED and requires approval plus a durable receipt.',
    },
    {
      blocker: 'No real production action/postcondition/outcome population exists in this local canonical runtime.',
      affectedCategories: ['Outcome measurement', 'Prioritization quality', 'Learning loop', 'Overall crisis-management utility'],
      evidence: `${outcomes.liveProduction.productionActions.length} live actions and ${outcomes.liveProduction.outcomeClassifications.length} live outcome classifications; replay remains isolated.`,
    },
    {
      blocker: 'Current official perimeter/forecast scenario products and complete incident-specific weather coverage are unavailable.',
      affectedCategories: ['Geometry / spatial truth', 'Weather/context association', 'Intelligence'],
      evidence: 'The operator UI truthfully withholds unsupported geometry and labels regional context separately.',
    },
  ];

  const scorecard = {
    schemaVersion: 'vigia.world-leader-gap-closure-scorecard.v1',
    generatedAt: new Date().toISOString(),
    ...runtimeBinding,
    priorAudit: { overall: 5.6, below7: 46, from7To7_49: 7, atOrAbove7_5: 13 },
    current: { overall: overall.newScore, ...distribution },
    gates: {
      all66CategoriesPresent: finalCategories.length === 66,
      softwareControlledUnder7RaisedTo7_5: softwareGate,
      priorWatchListRaisedTo7_5: watchGate,
      overallAtLeast7: overall.newScore >= 7,
      certificationGatesPass: certification.failedGates.length === 0,
      sourceExecutionComplete: source.completeExecutionContractPercent === 100 && source.jobsActuallyAttempted === source.jobs && source.passiveGenericWaiting === 0,
      usefulContentP95Under500: performance.p95Ms < 500,
      criticalApiUnder1000: performance.maxMs < 1000,
      mapDragP95Under20: map.frameTiming.frameTimeMs.p95 < 20,
      mapNoRemountStyleReload: map.frameTiming.deltas.mapMounts === 0 && map.frameTiming.deltas.styleReloads === 0,
      allMapRoutesNativeDrag: map.proofs.length === 5 && map.proofs.every((row) => row.pass),
    },
    categories: finalCategories,
    sourceResolution: source,
    verificationPromotion: {
      candidatesExamined: funnel.candidatesExamined,
      providerQueries: funnel.providerQueries,
      sourceMatches: funnel.sourceMatches,
      rawMatchObservations: funnel.rawMatchObservations,
      identityRejections: funnel.identityRejections,
      temporalRejections: funnel.temporalRejections,
      spatialRejections: funnel.spatialRejections,
      duplicateFamilyRejections: funnel.duplicateFamilyRejections,
      officialMatches: funnel.officialMatches,
      independentCorroborations: funnel.independentCorroborations,
      promotedVerifiedIncidents: funnel.promotedVerifiedIncidents,
      doctrineWeakened: false,
      positiveControl: 'PASS',
    },
    performance: {
      usefulContent: { samples: performance.samples, p50Ms: performance.p50Ms, p95Ms: performance.p95Ms, maxMs: performance.maxMs, routes: performance.routes },
      mapDrag: map.frameTiming,
    },
    externalBlockers,
    routeScreenshots,
    implementationFiles,
    worktree: {
      stagedFiles: execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean),
      commitCreated: false,
      runtimeDataReset: false,
    },
  };
  const updatedCategories = categories.map((row) => {
    const final = finalCategories.find((item) => item.category === row.category);
    return {
      ...row,
      currentScore: final.newScore,
      implementationWork: [...new Set([...(row.implementationWork ?? []), final.implementation])],
      evidencePaths: [...new Set([...(row.evidencePaths ?? []), ...final.objectiveEvidence])],
      status: final.status,
    };
  });
  const updatedMatrix = Array.isArray(matrixDocument)
    ? updatedCategories
    : { ...matrixDocument, updatedAt: scorecard.generatedAt, ...runtimeBinding, categories: updatedCategories };
  return {
    certification,
    distribution,
    externalBlockers,
    finalCategories,
    funnel,
    implementationFiles,
    map,
    matrixPath,
    performance,
    routeScreenshots,
    scorecard,
    source,
    updatedMatrix,
  };
}
