#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessThermalCandidate, assessThermalCandidateV3Candidate } from '../packages/domain/src/thermal-candidate-policy.mjs';
import { thermalTrend } from '../packages/domain/src/fire-event-tracker.mjs';
import { thermalDetectionMetrics } from '../packages/domain/src/thermal-detection-benchmark.mjs';
import { buildThermalContextResolver } from '../packages/domain/src/thermal-site-context.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpus = JSON.parse(await readFile(path.join(root, 'data/validation/detection/portugal-2024-v3-area-time-corpus.json')));
const context = JSON.parse(await readFile(path.join(root, 'data/reference/portugal-thermal-context-v1.json')));
const resolveContext = buildThermalContextResolver(context);
const HIGH_PRECISION = new Set(['DIRECT_HIGH_TEMPERATURE_INDUSTRIAL', 'THERMAL_POWER', 'WASTE_PROCESSING', 'INDUSTRIAL_WORKS']);
const ALL_CONTEXT = new Set([...HIGH_PRECISION, 'INDUSTRIAL_LANDUSE', 'QUARRY']);
const compact = (metrics) => Object.fromEntries(['cases', 'truePositives', 'falsePositives', 'trueNegatives', 'falseNegatives', 'precision', 'recall', 'specificity', 'falsePositiveRate', 'balancedAccuracy', 'matthewsCorrelationCoefficient'].map((key) => [key, metrics[key]]));

function evaluate(item, rule) {
  const now = new Date(Date.parse(item.observations.at(-1)?.at ?? item.timeWindow.end) + 300_000);
  const event = { observations: item.observations, thermal: thermalTrend(item.observations, { now }), thermalMemory: item.detectorContext.thermalMemory };
  let assessment = assessThermalCandidateV3Candidate(event, { now });
  const siteContext = resolveContext(item.coordinate);
  if (assessment.decision === 'SUPPRESS_OFFSHORE_LAND_CONTEXT' && siteContext.insidePortugal === true) assessment = assessThermalCandidate(event, { now });
  const heat = siteContext.heatContext;
  const maxFrp = Math.max(...item.observations.map((observation) => Number(observation.frpMw) || 0), 0);
  const contextMatch = heat && rule.classes.has(heat.contextClass) && heat.distanceKm <= rule.distanceKm;
  const suppress = assessment.qualifiesAsFireCandidate && contextMatch && maxFrp <= rule.maximumFrpMw && (!rule.singleOnly || item.observations.length === 1);
  return { ...item, predictedPositive: Boolean(assessment.qualifiesAsFireCandidate && !suppress), siteContext, maxFrpMw: maxFrp, v4Suppressed: Boolean(suppress) };
}

const rules = [];
for (const [name, classes] of [['HIGH_PRECISION', HIGH_PRECISION], ['ALL_CONTEXT', ALL_CONTEXT]]) for (const distanceKm of [.1, .25, .5, 1]) for (const maximumFrpMw of [1, 2, 4, 6]) for (const singleOnly of [true, false]) rules.push({ name, classes, distanceKm, maximumFrpMw, singleOnly });
const rows = [];
for (const rule of rules) {
  const outcome = { rule: { ...rule, classes: [...rule.classes] }, splits: {} };
  for (const split of ['DEVELOPMENT', 'VALIDATION', 'FROZEN_CONFIRMATORY']) {
    const selected = corpus.windows.filter((item) => item.evaluationSplit === split && (split !== 'FROZEN_CONFIRMATORY' || item.confirmatoryCohort)).map((item) => evaluate(item, rule));
    outcome.splits[split] = compact(thermalDetectionMetrics(selected));
  }
  const aggregateRecall = Math.min(...Object.values(outcome.splits).map((item) => item.recall ?? 0));
  const aggregateSpecificity = Math.min(...Object.values(outcome.splits).map((item) => item.specificity ?? 0));
  outcome.gate = { aggregateRecall, aggregateSpecificity, pass: aggregateRecall >= .95 && aggregateSpecificity >= .95 };
  rows.push(outcome);
}
rows.sort((a, b) => Number(b.gate.pass) - Number(a.gate.pass) || b.gate.aggregateSpecificity - a.gate.aggregateSpecificity || b.gate.aggregateRecall - a.gate.aggregateRecall);
console.log(JSON.stringify({ contextDatasetHash: context.datasetHash, evaluatedRules: rows.length, top: rows.slice(0, 12) }, null, 2));
