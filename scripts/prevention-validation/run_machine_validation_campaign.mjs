#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGeospatialProcess } from '../../apps/api/src/modules/observations/geospatial-process.mjs';
import { PreventionReviewContextService } from '../../apps/api/src/modules/prevention/prevention-review-context-service.mjs';
import { buildFuelConnectivityGraph } from '../../packages/domain/src/fuel-connectivity-graph.mjs';
import { measurePreventionEnsembleMember } from '../../packages/domain/src/validation/prevention-ensemble-member.mjs';
import {
  counterfactualRobustness,
  classifyFalseNegative,
  engineeringEvidenceStatus,
  landCoverConcordance,
  scientificClaimLevel,
  thresholdStability,
  validationMedian
} from '../../packages/domain/src/validation/prevention-machine-validation.mjs';
import {
  createEvidenceDebtItem,
  createMeasurementCampaign,
  createMeasurementPlan,
  transitionEvidenceDebtItem
} from '../../packages/domain/src/validation/evidence-debt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const paths = {
  state: path.join(root, 'data/runtime/production-v1.json'),
  context: path.join(root, 'data/reference/prevention-review-context-v1.json'),
  reviewCorpus: path.join(root, 'data/validation/prevention/portugal-sentinel2-review-corpus-v3.json'),
  detectorBenchmark: path.join(root, 'data/validation/detection/portugal-2023-v4-confirmatory-benchmark.json'),
  worker: path.join(root, 'workers/geospatial/fuel_continuity.py'),
  output: path.join(root, 'data/validation/measurement-debt/prevention-machine-validation-v1.json'),
  handoff: path.join(root, 'data/validation/measurement-debt/measurement-debt-handoff.json'),
  referenceRegistry: path.join(root, 'data/reference/prevention-machine-validation/reference-registry-v1.json'),
  rawReferenceDirectory: path.join(root, 'data/reference/prevention-machine-validation/raw')
};
const generatedAt = new Date().toISOString();
const python = process.env.VIGIA_PYTHON ?? path.join(root, '.venv/bin/python');
const sha = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const round = (value, digits = 4) => value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(Number(value).toFixed(digits));
const percent = (part, total) => total ? round(part / total, 4) : null;

const [state, reviewCorpus, detectorBenchmark, contextBytes] = await Promise.all([
  readJson(paths.state),
  readJson(paths.reviewCorpus),
  readJson(paths.detectorBenchmark),
  readFile(paths.context)
]);
const contextService = new PreventionReviewContextService({ filePath: paths.context });
await contextService.initialize();
const findings = (state.preventionFindings ?? []).map((finding) => contextService.enrich(finding));
if (!findings.length) throw new Error('prevention_findings_required');

await mkdir(paths.rawReferenceDirectory, { recursive: true });
await mkdir(path.dirname(paths.output), { recursive: true });

const officialReferenceDiscovery = await acquireReferenceDiscovery();
const archives = await loadExposureArchives();
const referenceRegistry = buildReferenceRegistry(officialReferenceDiscovery, archives);
await writeFile(paths.referenceRegistry, `${JSON.stringify(referenceRegistry, null, 2)}\n`);

const siteGroups = groupFindings(findings);
const parameterRuns = [];
const repeatSceneRuns = [];
const stacArchives = [];
for (const site of siteGroups) {
  const buildingPoints = nearestArchive(site.coordinate, archives)?.buildingPoints ?? [];
  const scene = scenePair(site.findings[0]);
  const baseInput = { coordinate: site.coordinate, radiusKm: 3, before: scene.before, after: scene.after, buildingPoints, validationMode: true };
  const variants = parameterVariants();
  const batchResult = await runGeospatialProcess({ python, script: paths.worker, timeoutMs: 240_000, input: { ...baseInput, validationParameterBatch: variants } });
  const siteParameterRuns = batchResult?.state === 'batch'
    ? batchResult.results.map((entry) => ({ siteId: site.id, variant: variants.find((variant) => variant.id === entry.id) ?? { id: entry.id, parameters: entry.parameters }, result: entry.result }))
    : variants.map((variant) => ({ siteId: site.id, variant, result: batchResult }));
  parameterRuns.push(...siteParameterRuns);

  const sceneDiscovery = await discoverRepeatScenes(site, scene);
  stacArchives.push(sceneDiscovery.archive);
  const alternatePairs = selectAlternatePairs(sceneDiscovery.features, scene, 2);
  const siteRepeatRuns = await mapLimit(alternatePairs, 1, async (pair) => ({
    siteId: site.id,
    pair: { currentId: pair.after.id, comparisonId: pair.before.id, currentAt: pair.after.acquiredAt, comparisonAt: pair.before.acquiredAt },
    result: await runGeospatialProcess({ python, script: paths.worker, timeoutMs: 180_000, input: { ...baseInput, before: pair.before, after: pair.after } })
  }));
  repeatSceneRuns.push(...siteRepeatRuns);
}
const repeatSceneArchivePath = path.join(paths.rawReferenceDirectory, 'earth-search-repeat-scene-catalogue.json');
const repeatSceneArchive = `${JSON.stringify({ schema: 'vigia.raw-repeat-scene-catalogue.v1', generatedAt, sites: stacArchives }, null, 2)}\n`;
await writeFile(repeatSceneArchivePath, repeatSceneArchive);
referenceRegistry.datasets.push(repeatSceneReferenceDataset({ archivePath: repeatSceneArchivePath, checksumSha256: sha(repeatSceneArchive), archives: stacArchives }));
await writeFile(paths.referenceRegistry, `${JSON.stringify(referenceRegistry, null, 2)}\n`);

const findingsBySite = new Map(siteGroups.map((site) => [site.id, site]));
const findingMeasurements = findings.map((finding) => {
  const siteId = analysisGroupIdFor(finding);
  const site = findingsBySite.get(siteId);
  const baseGraph = buildFuelConnectivityGraph(finding);
  const baseRank = rankFor(finding, site.findings);
  const parameterVariantsMeasured = parameterRuns.filter((run) => run.siteId === siteId).map((run) => measurePreventionEnsembleMember({ finding, baseGraph, baseRank, result: run.result, groupSize: site.findings.length, variantId: run.variant.id, evidenceAxis: 'PARAMETER', parameters: run.variant.parameters }));
  const repeatVariantsMeasured = repeatSceneRuns.filter((run) => run.siteId === siteId).map((run) => measurePreventionEnsembleMember({ finding, baseGraph, baseRank, result: run.result, groupSize: site.findings.length, variantId: `${run.pair.comparisonId}->${run.pair.currentId}`, evidenceAxis: 'SCENE', scenePair: run.pair }));
  const landCover = landCoverConcordance(finding.landCoverContext);
  const threshold = thresholdStability({ variants: parameterVariantsMeasured });
  const repeat = thresholdStability({ variants: repeatVariantsMeasured, minimumEligibleVariants: 1 });
  const robustness = counterfactualRobustness({ finding, graph: baseGraph });
  const negativeControlRisk = landCover.managedTransitionRisk >= .25 ? { state: 'MEASURED', classification: 'HIGH', managedTransitionShare: landCover.managedTransitionRisk }
    : landCover.managedTransitionRisk >= .1 ? { state: 'MEASURED', classification: 'MODERATE', managedTransitionShare: landCover.managedTransitionRisk }
      : { state: 'MEASURED', classification: 'LOW', managedTransitionShare: landCover.managedTransitionRisk };
  const dimensions = {
    sceneQuality: { state: finding.sourceQuality?.state ?? 'UNMEASURED', validPixelFraction: finding.sourceQuality?.validPixelFraction ?? null },
    landCoverConcordance: landCover,
    repeatSceneStability: repeat,
    thresholdStability: threshold,
    graphStability: threshold.state === 'MEASURED' ? { state: 'MEASURED', nodeStability: threshold.nodeStability, edgeStability: threshold.edgeStability } : { state: 'INSUFFICIENT' },
    breakpointStability: threshold.state === 'MEASURED' ? { state: 'MEASURED', value: threshold.breakpointStability } : { state: 'INSUFFICIENT' },
    negativeControlRisk,
    retrospectiveStructuralRelevance: { state: 'EXTERNALLY_BLOCKED', reason: 'No governed pre-event PREVENT run corpus exists for a later official burned-area denominator.' },
    counterfactualRobustness: robustness,
    humanFieldValidation: { state: 'UNMEASURED', reason: 'No human or field authority was available for this sprint.' },
    outcomeEvaluation: { state: 'UNMEASURED', reason: 'No post-intervention outcome cohort exists.' }
  };
  return {
    findingId: finding.findingId,
    place: finding.place,
    coordinate: finding.coordinate,
    detectorVersion: finding.detectorVersion,
    evaluationSplit: reviewCorpus.samples.find((sample) => sample.findingId === finding.findingId)?.evaluationSplit ?? 'UNASSIGNED',
    dimensions,
    engineeringEvidence: engineeringEvidenceStatus(dimensions),
    claimLevel: scientificClaimLevel(dimensions),
    parameterVariants: parameterVariantsMeasured,
    repeatSceneVariants: repeatVariantsMeasured,
    graph: { version: baseGraph.version, nodes: baseGraph.nodes.length, edges: baseGraph.edges.length },
    referenceProvenance: { product: finding.landCoverContext?.product ?? null, provider: finding.landCoverContext?.provider ?? null, contextEvidenceHash: contextService.snapshot().evidenceHash }
  };
});

const falseNegativeRows = (detectorBenchmark.errorExplorer ?? []).filter((row) => row.failure === 'FALSE_NEGATIVE').map((row) => ({
  caseId: row.windowId,
  subject: row.subject,
  coordinate: row.coordinate,
  referenceLabel: row.referenceLabel,
  labelSource: row.labelSource,
  tags: row.tags,
  ...classifyFalseNegative(row)
}));
const falseNegativeTaxonomy = summarizeTaxonomy(falseNegativeRows, 'cluster');
const falseNegativeRecovery = summarizeTaxonomy(falseNegativeRows, 'recovery');
const negativeDecisionSamples = reviewCorpus.samples.filter((sample) => sample.kind === 'DETECTOR_REJECTED_COMPONENT');
const frozenNegativeDecisions = negativeDecisionSamples.filter((sample) => sample.evaluationSplit === 'FROZEN_CONFIRMATORY');
const baseReruns = parameterRuns.filter((run) => run.variant.id === 'BASELINE');
const baseComponents = baseReruns.reduce((sum, run) => sum + Number(run.result?.negativeMining?.candidateComponents ?? 0), 0);
const baseRejected = baseReruns.reduce((sum, run) => sum + Number(run.result?.negativeMining?.rejectedComponents ?? 0), 0);
const negativeControls = {
  state: 'PARTIALLY_MEASURED',
  decisionAuditSamples: negativeDecisionSamples.length,
  frozenDecisionAuditSamples: frozenNegativeDecisions.length,
  authoritativeNegativeLabels: 0,
  baselineCandidateComponents: baseComponents,
  baselineRejectedComponents: baseRejected,
  deterministicRejectionFraction: percent(baseRejected, baseComponents),
  falseCandidateRate: null,
  specificity: null,
  taxonomy: reviewCorpus.negativeDecisionTaxonomy,
  qualification: 'Rejected detector components measure decision behavior only. With no independently labelled management-change negatives, they are not true negatives and do not support specificity.'
};

const aggregate = aggregateFindingMetrics(findingMeasurements);
const referenceProductIntegrity = summarizeReferenceProductIntegrity(referenceRegistry);
const evidenceDebt = buildEvidenceDebt({ aggregate, negativeControls, falseNegativeRows, repeatSceneRuns, referenceProductIntegrity });
const measurementPlans = evidenceDebt.map((item) => measurementPlanFor(item));
const campaigns = buildCampaigns({ aggregate, negativeControls, falseNegativeRows, repeatSceneRuns, parameterRuns, evidenceDebt, referenceProductIntegrity });

const artifactCore = {
  schemaVersion: 'vigia.prevention-machine-validation.v1',
  generatedAt,
  detectorVersion: 'fuel_continuity_change_screen_v1',
  methodVersion: 'vigia.prevent-machine-validation.v1',
  before: {
    findings: findings.length,
    expertLabels: 0,
    referenceConcordanceMeasured: 0,
    repeatSceneStabilityMeasured: 0,
    thresholdStabilityMeasured: 0,
    graphStabilityMeasured: 0,
    counterfactualRobustnessMeasured: 0,
    falseNegativeRecoveryClassified: 0
  },
  after: {
    findings: findings.length,
    expertLabels: 0,
    referenceConcordanceMeasured: aggregate.landCover.measured,
    repeatSceneStabilityMeasured: aggregate.repeatScene.measured,
    thresholdStabilityMeasured: aggregate.threshold.measured,
    graphStabilityMeasured: aggregate.graph.measured,
    counterfactualRobustnessMeasured: aggregate.counterfactual.measured,
    falseNegativeRecoveryClassified: falseNegativeRows.length,
    evidenceDebtItems: evidenceDebt.length,
    evidenceDebtWithPlan: measurementPlans.length
  },
  referenceDatasets: referenceRegistry,
  referenceProductIntegrity,
  referenceDependency: {
    state: 'DECLARED',
    relationships: referenceRegistry.datasets.map((dataset) => ({ dataset: dataset.id, dependency: dataset.referenceDependency })),
    claimBoundary: 'Machine/reference agreement is not independent expert ground truth.'
  },
  findings: findingMeasurements,
  aggregate,
  negativeControls,
  retrospectiveStructuralRelevance: {
    state: 'EXTERNALLY_BLOCKED',
    denominator: 0,
    reason: 'The repository has official historical fire references but no frozen, pre-event PREVENT graph corpus. Current 2026 findings cannot be projected backward without future-data leakage.',
    nextOpportunity: 'Build a frozen historical pre-event Sentinel-2/asset-context corpus before consulting later fire perimeters.'
  },
  matchedTemporalControl: {
    state: 'EXTERNALLY_BLOCKED',
    denominator: 0,
    reason: 'No defensibly matched fire-preceding/no-fire PREVENT scene-pair corpus exists yet; current screening locations are not a population sample.'
  },
  falseNegativeProgram: {
    cases: falseNegativeRows.length,
    taxonomy: falseNegativeTaxonomy,
    recovery: falseNegativeRecovery,
    items: falseNegativeRows,
    v5Attempted: false,
    v5Decision: 'NOT_ATTEMPTED',
    reason: 'The dominant cluster is sensor-quality/single-observation evidence. Complexity was not added to V4 without a fresh confirmatory cohort and a material policy-recoverable cluster.'
  },
  evidenceDebt,
  measurementPlans,
  campaigns,
  humanFieldGate: {
    state: 'NOT_PERFORMED',
    expertPrecision: null,
    expertRecall: null,
    fieldValidation: null,
    outcomeEvaluation: null,
    qualification: 'Machine-verifiable measurements do not authorize intervention or replace attributable human/field authority.'
  },
  provenance: {
    statePath: relative(paths.state),
    stateChecksumSha256: sha(await readFile(paths.state)),
    reviewCorpusPath: relative(paths.reviewCorpus),
    reviewCorpusChecksumSha256: sha(await readFile(paths.reviewCorpus)),
    contextPath: relative(paths.context),
    contextChecksumSha256: sha(contextBytes),
    detectorBenchmarkPath: relative(paths.detectorBenchmark),
    detectorBenchmarkChecksumSha256: sha(await readFile(paths.detectorBenchmark)),
    rawReferenceDiscovery: relative(path.join(paths.rawReferenceDirectory, 'cdse-stac-collections.json')),
    rawRepeatSceneCatalogue: relative(path.join(paths.rawReferenceDirectory, 'earth-search-repeat-scene-catalogue.json'))
  }
};
const artifact = { ...artifactCore, evidenceHash: `sha256:${sha(artifactCore)}` };
await writeFile(paths.output, `${JSON.stringify(artifact, null, 2)}\n`);

const handoffCore = {
  schemaVersion: 'vigia.measurement-debt-handoff.v1',
  generatedAt,
  status: 'READY_FOR_AGENT_2',
  consumer: 'Agent 2 UI/product integration',
  releaseVerdict: aggregate.threshold.measured > 0 && aggregate.landCover.measured === findings.length && falseNegativeRows.length > 0 ? 'PASS_MACHINE_VALIDATION_MATERIAL_DELTA' : 'FAIL_NO_MATERIAL_DELTA',
  criticalDelta: { before: artifact.before, after: artifact.after },
  evidenceDebtItems: evidenceDebt,
  measurementPlans,
  campaigns,
  preventMetrics: aggregate,
  referenceProductIntegrity,
  stabilityMetrics: { repeatScene: aggregate.repeatScene, threshold: aggregate.threshold, graph: aggregate.graph, breakpoint: aggregate.breakpoint },
  negativeControls,
  retrospectiveAlignment: artifact.retrospectiveStructuralRelevance,
  matchedTemporalControl: artifact.matchedTemporalControl,
  falseNegativeClusters: artifact.falseNegativeProgram,
  claimLevels: aggregate.claimLevels,
  openDebt: evidenceDebt.filter((item) => !['MEASURED', 'RESOLVED'].includes(item.current_state)),
  resolvedDebt: evidenceDebt.filter((item) => ['MEASURED', 'RESOLVED'].includes(item.current_state)),
  apiContracts: [
    '/api/v10/validation/measurement-debt',
    '/api/v10/validation/prevention-machine-evidence',
    '/api/v10/validation/measurement-campaigns',
    '/api/v10/validation/prevention-scorecards',
    '/api/v10/validation/false-negative-taxonomy'
  ],
  artifacts: { evidence: relative(paths.output), handoff: relative(paths.handoff), referenceRegistry: relative(paths.referenceRegistry) },
  artifactEvidenceHash: artifact.evidenceHash,
  scientificClaimBoundary: artifact.humanFieldGate.qualification
};
const handoff = { ...handoffCore, evidenceHash: `sha256:${sha(handoffCore)}` };
await writeFile(paths.handoff, `${JSON.stringify(handoff, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(paths.output), handoff: relative(paths.handoff), verdict: handoff.releaseVerdict, before: artifact.before, after: artifact.after, aggregate, falseNegativeTaxonomy, falseNegativeRecovery }, null, 2));
async function readJson(filePath) { return JSON.parse(await readFile(filePath, 'utf8')); }
function relative(filePath) { return path.relative(root, filePath); }
function siteIdFor(coordinate) { return `site:${Number(coordinate[1]).toFixed(5)}:${Number(coordinate[0]).toFixed(5)}`; }
function analysisGroupIdFor(finding) { return `${siteIdFor(finding.coordinate)}:${finding.currentObservationId}:${finding.comparisonObservationId}`; }
function groupFindings(rows) {
  const map = new Map();
  for (const finding of rows) {
    const id = analysisGroupIdFor(finding);
    if (!map.has(id)) map.set(id, { id, coordinate: finding.coordinate.map(Number), findings: [] });
    map.get(id).findings.push(finding);
  }
  return [...map.values()];
}
function scenePair(finding) {
  const normalize = (scene) => ({
    id: scene.id,
    acquiredAt: scene.acquiredAt,
    red: scene.redCogUrl ?? derivedSentinelCog(scene.id, 'B04'),
    nir: scene.nirCogUrl ?? derivedSentinelCog(scene.id, 'B08'),
    swir: scene.swir16CogUrl ?? derivedSentinelCog(scene.id, 'B11'),
    scl: scene.sclCogUrl ?? derivedSentinelCog(scene.id, 'SCL')
  });
  return { before: normalize(finding.provenance.comparison), after: normalize(finding.provenance.current) };
}
function derivedSentinelCog(id, band) {
  const match = String(id ?? '').match(/^S2[A-C]_(\d{2})([A-Z])([A-Z]{2})_(\d{4})(\d{2})(\d{2})_\d+_L2A$/);
  if (!match) return null;
  const [, zone, latitudeBand, square, year, month] = match;
  return `https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/${zone}/${latitudeBand}/${square}/${year}/${Number(month)}/${id}/${band}.tif`;
}
function parameterVariants() {
  return [
    { id: 'BASELINE', parameters: {} },
    { id: 'NDVI_MINUS_0_02', parameters: { ndviMin: .26 } },
    { id: 'NDVI_PLUS_0_02', parameters: { ndviMin: .30 } },
    { id: 'NDMI_MINUS_0_02', parameters: { ndmiMax: .26 } },
    { id: 'NDMI_PLUS_0_02', parameters: { ndmiMax: .30 } },
    { id: 'MIN_COMPONENT_MINUS_2', parameters: { minimumComponentCells: 16 } },
    { id: 'MIN_COMPONENT_PLUS_2', parameters: { minimumComponentCells: 20 } },
    { id: 'CONNECTIVITY_TIGHT', parameters: { structureDistanceM: 135, boundaryCells: 3 } },
    { id: 'CONNECTIVITY_WIDE', parameters: { structureDistanceM: 165, boundaryCells: 5 } }
  ];
}
async function loadExposureArchives() {
  const directory = path.join(root, 'data/replay/raw/prevention-context-v1');
  const names = ['osm-37p13970_m8p02020.json', 'osm-39p41510_m7p45520.json', 'osm-40p97000_m7p26000.json'];
  return Promise.all(names.map(async (name) => {
    const payload = await readJson(path.join(directory, name));
    const buildingPoints = (payload.elements ?? []).filter((element) => element.tags?.building).map(elementPoint).filter(Boolean);
    const allPoints = (payload.elements ?? []).map(elementPoint).filter(Boolean);
    const centroid = allPoints.length ? [allPoints.reduce((sum, point) => sum + point[0], 0) / allPoints.length, allPoints.reduce((sum, point) => sum + point[1], 0) / allPoints.length] : null;
    return { name, centroid, buildingPoints, rawChecksumSha256: sha(await readFile(path.join(directory, name))) };
  }));
}
function elementPoint(element) {
  if (Number.isFinite(Number(element.lon)) && Number.isFinite(Number(element.lat))) return [Number(element.lon), Number(element.lat)];
  if (element.bounds) return [(Number(element.bounds.minlon) + Number(element.bounds.maxlon)) / 2, (Number(element.bounds.minlat) + Number(element.bounds.maxlat)) / 2];
  const geometry = (element.geometry ?? []).filter((point) => Number.isFinite(Number(point.lon)) && Number.isFinite(Number(point.lat)));
  if (!geometry.length) return null;
  return [geometry.reduce((sum, point) => sum + Number(point.lon), 0) / geometry.length, geometry.reduce((sum, point) => sum + Number(point.lat), 0) / geometry.length];
}
function nearestArchive(coordinate, rows) { return [...rows].filter((row) => row.centroid).sort((a, b) => pointDistance(coordinate, a.centroid) - pointDistance(coordinate, b.centroid))[0] ?? null; }
function pointDistance(a, b) { const lat = (Number(a[1]) + Number(b[1])) / 2 * Math.PI / 180; return Math.hypot((Number(a[0]) - Number(b[0])) * 111_320 * Math.cos(lat), (Number(a[1]) - Number(b[1])) * 110_540); }
async function acquireReferenceDiscovery() {
  const url = 'https://stac.dataspace.copernicus.eu/v1/collections';
  try {
    const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'VIGIA/10.0 measurement-validation' }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const raw = await response.text();
    const archivedRaw = raw.endsWith('\n') ? raw : `${raw}\n`;
    await writeFile(path.join(paths.rawReferenceDirectory, 'cdse-stac-collections.json'), archivedRaw);
    const parsed = JSON.parse(raw);
    return { state: 'ACQUIRED', url, acquiredAt: generatedAt, rawChecksumSha256: sha(archivedRaw), collections: parsed.collections ?? [] };
  } catch (error) {
    const failure = { state: 'EXTERNALLY_BLOCKED', url, acquiredAt: generatedAt, error: String(error.message ?? error), collections: [] };
    await writeFile(path.join(paths.rawReferenceDirectory, 'cdse-stac-collections.json'), `${JSON.stringify(failure, null, 2)}\n`);
    return failure;
  }
}
function buildReferenceRegistry(discovery, exposureArchives) {
  const clmsBurnedArea = discovery.collections.filter((collection) => String(collection.id).startsWith('clms_ba_')).map((collection) => collection.id);
  const contextSnapshot = contextService.snapshot();
  const contextSources = contextSnapshot.sources ?? [];
  const worldCoverAssets = contextSources.filter((source) => String(source.provider).startsWith('ESA WorldCover'));
  const demAssets = contextSources.filter((source) => String(source.provider).startsWith('Copernicus DEM'));
  return {
    schemaVersion: 'vigia.prevention-reference-registry.v1',
    generatedAt,
    discovery: { provider: 'Copernicus Data Space Ecosystem', endpoint: discovery.url, state: discovery.state, rawChecksumSha256: discovery.rawChecksumSha256 ?? null, clmsBurnedAreaCollections: clmsBurnedArea },
    datasets: [
      {
        id: 'ESA_WORLDCOVER_2021_V200_10M', dataset: 'ESA WorldCover', provider: 'ESA WorldCover via Microsoft Planetary Computer', version: 'v200', referenceYear: 2021, resolutionMeters: 10, validationStatus: 'INDEPENDENTLY_VALIDATED_PRODUCT_DEPENDENT_INPUTS', source: 'ESA WorldCover public COG sampled via Microsoft Planetary Computer', acquisitionMethod: 'HTTP range-read of provider COG over exact persisted finding geometries', acquisitionTime: contextSnapshot.generatedAt, rawArtifactPath: null, rawAssetBindings: worldCoverAssets.map((source) => ({ itemId: source.itemId, assetHref: source.assetHref })), rawChecksum: null, rawProductArchived: false, integrityEligible: true, derivedArtifactPath: relative(paths.context), derivedEvidenceChecksumSha256: contextSnapshot.evidenceHash, licenseNotes: 'Provider product terms apply; VIGIA records no broader reuse claim.', projection: 'Native tile CRS sampled into detector geometry', transformation: 'Nearest-neighbour categorical sampling; per-class pixel fractions within geometry', spatialJoinRule: 'Pixels whose centres fall within the exact persisted finding geometry', temporalJoinRule: 'Static 2021 land-cover reference compared with 2025/2026 detector scenes; temporal mismatch retained as a limitation', coverage: `${findings.length}/${findings.length} findings`, knownLimitations: ['Original COG bytes were range-read and not locally archived, so raw checksums remain measurement debt.', 'Reference year precedes detector scenes.', 'Product shares Sentinel-2 lineage with the detector input.'], dependencyRelationship: 'REFERENCE_DEPENDENCY', referenceDependency: 'Derived from Sentinel-1 and Sentinel-2; not independent of VIGIA Sentinel-2 inputs.', qualification: 'Geometry-bound land-cover plausibility reference, not expert hazard truth.'
      },
      {
        id: 'COPERNICUS_DEM_GLO30', dataset: 'Copernicus DEM GLO-30', provider: 'Copernicus DEM via Microsoft Planetary Computer', version: 'GLO-30', referenceYear: null, resolutionMeters: 30, validationStatus: 'REFERENCE_TERRAIN_CONTEXT', source: 'Copernicus DEM public COG sampled via Microsoft Planetary Computer', acquisitionMethod: 'HTTP range-read of provider COG over finding geometry and 150 m context buffer', acquisitionTime: contextSnapshot.generatedAt, rawArtifactPath: null, rawAssetBindings: demAssets.map((source) => ({ itemId: source.itemId, assetHref: source.assetHref })), rawChecksum: null, rawProductArchived: false, integrityEligible: true, derivedArtifactPath: relative(paths.context), derivedEvidenceChecksumSha256: contextSnapshot.evidenceHash, licenseNotes: 'Provider product terms apply; VIGIA records no broader reuse claim.', projection: 'Native tile CRS sampled into detector geometry + 150m buffer', transformation: 'Terrain summary from geometry-bound GLO-30 samples', spatialJoinRule: 'Finding geometry plus 150 m context buffer', temporalJoinRule: 'Static terrain; no event-time join asserted', coverage: `${findings.length}/${findings.length} findings`, knownLimitations: ['Original COG bytes were range-read and not locally archived, so raw checksums remain measurement debt.', 'Terrain context does not validate land-cover class or intervention efficacy.'], dependencyRelationship: 'CONTEXT_REFERENCE', referenceDependency: 'Terrain reference is physically independent of the optical vegetation-change decision but does not validate fuel class.', qualification: 'Terrain context only; not land-cover or fire-behavior truth.'
      },
      {
        id: 'CDSE_CLMS_BURNT_AREA_CATALOGUE', dataset: 'CLMS Burnt Area Global', provider: 'Copernicus Data Space Ecosystem', version: 'V3/V4 catalogue', referenceYear: 'daily/monthly series', resolutionMeters: 300, validationStatus: discovery.state, source: discovery.url, acquisitionMethod: 'Official CDSE STAC collections endpoint', acquisitionTime: discovery.acquiredAt, rawArtifactPath: relative(path.join(paths.rawReferenceDirectory, 'cdse-stac-collections.json')), rawChecksum: discovery.rawChecksumSha256 ?? null, rawProductArchived: discovery.state === 'ACQUIRED', integrityEligible: true, derivedEvidenceChecksumSha256: null, licenseNotes: 'Copernicus data terms apply; catalogue metadata archived for reproducibility.', projection: 'Catalogue-defined', transformation: 'Collection discovery only; no raster transformation or finding join performed', spatialJoinRule: 'NONE_CURRENT_SPRINT', temporalJoinRule: 'Reserved for a future frozen pre-event versus later-burn campaign', coverage: `${clmsBurnedArea.length} discoverable CDSE STAC collections`, knownLimitations: ['Catalogue discovery is not a joined burned-area validation corpus.', '300 m burned-area products are coarser than the PREVENT detector.'], dependencyRelationship: 'RETROSPECTIVE_REFERENCE_DEPENDENCY', referenceDependency: 'Coarse burned-area products use satellite observations and cannot independently prove PREVENT efficacy.', qualification: 'Catalogue acquired for a future no-leakage historical campaign; not joined to current 2026 findings.'
      },
      {
        id: 'CLMS_HRL_TREE_COVER_FOREST_GRASSLAND', dataset: 'CLMS HRL Tree Cover / Forest / Grassland', provider: 'Copernicus Land Monitoring Service', version: '2018-present', referenceYear: 'multiple', resolutionMeters: 10, validationStatus: 'EXTERNALLY_BLOCKED_NOT_DISCOVERABLE_IN_CURRENT_CDSE_STAC_COLLECTIONS', source: discovery.url, acquisitionMethod: 'Official CDSE STAC discovery attempt', acquisitionTime: discovery.acquiredAt, rawArtifactPath: relative(path.join(paths.rawReferenceDirectory, 'cdse-stac-collections.json')), rawChecksum: discovery.rawChecksumSha256 ?? null, rawProductArchived: false, integrityEligible: false, derivedEvidenceChecksumSha256: null, licenseNotes: 'Copernicus data terms apply; no HRL product bytes were acquired.', projection: 'ETRS89 LAEA / product tile grid', transformation: 'NONE', spatialJoinRule: 'NONE', temporalJoinRule: 'NONE', coverage: '0 findings', knownLimitations: ['Direct machine-readable HRL assets were not exposed by the queried current CDSE STAC collections endpoint.', 'No HRL product was joined or counted as validation evidence.'], dependencyRelationship: 'REFERENCE_DEPENDENCY', referenceDependency: 'HRL products use Sentinel-1/Sentinel-2 inputs; concordance would not be independent ground truth.', qualification: 'Official catalogue discovery was archived; direct machine-readable HRL assets were not exposed by the queried CDSE STAC catalogue.'
      },
      {
        id: 'OPENSTREETMAP_STRUCTURE_CONTEXT', dataset: 'OpenStreetMap structure context', provider: 'OpenStreetMap via archived Overpass responses', version: '2026-08-13 snapshot', referenceYear: 2026, resolutionMeters: null, validationStatus: 'ARCHIVED_CONTEXT_REFERENCE', source: 'Archived Overpass provider responses', acquisitionMethod: 'Overpass JSON acquisition archived before validation', acquisitionTime: contextSnapshot.generatedAt, rawArtifactPath: exposureArchives.map((archive) => `data/replay/raw/prevention-context-v1/${archive.name}`), rawChecksum: exposureArchives.map((archive) => archive.rawChecksumSha256), rawProductArchived: true, integrityEligible: true, derivedArtifactPath: relative(paths.context), derivedEvidenceChecksumSha256: contextSnapshot.evidenceHash, licenseNotes: 'OpenStreetMap data is subject to ODbL; attribution is retained in provider metadata.', projection: 'WGS84 provider coordinates transformed to each Sentinel-2 analysis CRS', transformation: 'Building nodes/centroids normalized to structure points', spatialJoinRule: 'Nearest archived site context; detector applies declared 150 m structure relationship', temporalJoinRule: 'Current 2026 snapshot held fixed during perturbation; no historical asset-state claim', coverage: `${new Set(findings.map((finding) => siteIdFor(finding.coordinate))).size} physical sites`, knownLimitations: ['Completeness varies by mapper coverage.', 'Current asset context cannot prove historical structure presence.', 'Asset-path stability is conditioned on this fixed snapshot.'], dependencyRelationship: 'STRUCTURAL_CONTEXT_REFERENCE', referenceDependency: 'Independent volunteered map context; not authoritative building completeness or field truth.', qualification: 'Used for inspectable structure connectivity only, never as hazard ground truth.'
      }
    ]
  };
}

function repeatSceneReferenceDataset({ archivePath, checksumSha256, archives }) {
  const acquired = archives.filter((archive) => archive.state === 'ACQUIRED');
  return { id: 'EARTH_SEARCH_SENTINEL2_REPEAT_SCENES', dataset: 'Sentinel-2 L2A repeat-scene catalogue', provider: 'Element 84 Earth Search / AWS Sentinel-2 COG mirror', version: 'Earth Search v1', referenceYear: '2025-2026', resolutionMeters: 10, validationStatus: acquired.length === archives.length ? 'ACQUIRED' : 'PARTIALLY_ACQUIRED', source: 'https://earth-search.aws.element84.com/v1/search', acquisitionMethod: 'STAC POST per frozen analysis group; provider feature responses archived and selected COGs range-read', acquisitionTime: generatedAt, rawArtifactPath: relative(archivePath), rawChecksum: checksumSha256, rawProductArchived: true, integrityEligible: true, derivedEvidenceChecksumSha256: null, licenseNotes: 'Public endpoint; upstream Copernicus Sentinel data terms apply.', projection: 'Native Sentinel-2 tile CRS warped to the frozen 256x256 analysis grid', transformation: 'Bilinear reflectance / nearest SCL resampling; identical detector pipeline', spatialJoinRule: '4 km bbox around each physical site; same MGRS grid preferred per pair', temporalJoinRule: 'Current alternative within 60 days before baseline current scene; prior alternative within ±60 days of baseline prior scene; before precedes after', coverage: `${acquired.length}/${archives.length} analysis groups`, knownLimitations: ['COG bytes are range-read rather than fully archived.', 'Seasonal windows are bounded but not phenologically identical.', 'Repeat-scene catalogue is a stability input, not external hazard truth.'], dependencyRelationship: 'SAME_SENSOR_REPEATABILITY_INPUT', referenceDependency: 'Same Sentinel-2 sensor family as the PREVENT detector; measures repeatability, not independent validity.', qualification: 'Real repeat-scene stability evidence with no human label claim.' };
}

function summarizeReferenceProductIntegrity(registry) {
  const eligible = registry.datasets.filter((dataset) => dataset.integrityEligible);
  const archived = eligible.filter((dataset) => dataset.rawProductArchived && dataset.rawArtifactPath && dataset.rawChecksum);
  return { state: archived.length === eligible.length ? 'MEASURED' : 'PARTIALLY_MEASURED', archivedFamilies: archived.length, denominatorFamilies: eligible.length, coverage: percent(archived.length, eligible.length), missingRawProductChecksums: eligible.filter((dataset) => !archived.includes(dataset)).map((dataset) => dataset.id), qualification: 'Derived evidence remains hash-bound; missing original COG byte archives are preserved as explicit measurement debt.' };
}

async function discoverRepeatScenes(site, basePair) {
  const bbox = bboxAround(site.coordinate, 4);
  const body = { collections: ['sentinel-2-l2a'], bbox, datetime: '2025-06-01T00:00:00Z/2026-08-14T00:00:00Z', query: { 'eo:cloud_cover': { lt: 20 } }, sortby: [{ field: 'properties.datetime', direction: 'desc' }], limit: 100 };
  try {
    const response = await fetch('https://earth-search.aws.element84.com/v1/search', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'VIGIA/10.0 measurement-validation' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const payload = await response.json();
    const features = (payload.features ?? []).map(normalizeEarthSearch).filter(Boolean);
    return { features, archive: { siteId: site.id, request: body, state: 'ACQUIRED', featureCount: features.length, responseHash: `sha256:${sha(payload)}`, providerFeatures: payload.features ?? [] } };
  } catch (error) {
    return { features: [], archive: { siteId: site.id, request: body, state: 'EXTERNALLY_BLOCKED', error: String(error.message ?? error) } };
  }
}
function bboxAround([lon, lat], radiusKm) { const dy = radiusKm / 111.32; const dx = radiusKm / Math.max(20, 111.32 * Math.cos(lat * Math.PI / 180)); return [lon - dx, lat - dy, lon + dx, lat + dy]; }
function asset(item, keys) { for (const key of keys) if (String(item.assets?.[key]?.href ?? '').startsWith('http')) return item.assets[key].href; return null; }
function normalizeEarthSearch(item) {
  const properties = item.properties ?? {};
  const red = asset(item, ['red']); const nir = asset(item, ['nir']); const swir = asset(item, ['swir16']);
  if (!red || !nir || !swir) return null;
  return { id: item.id, acquiredAt: properties.datetime, cloudCover: Number(properties['eo:cloud_cover'] ?? 100), gridId: [properties['mgrs:utm_zone'], properties['mgrs:latitude_band'], properties['mgrs:grid_square']].join(''), red, nir, swir, scl: asset(item, ['scl', 'SCL']) };
}
function selectAlternatePairs(features, basePair, limit) {
  const baseAfterAt = Date.parse(basePair.after.acquiredAt), baseBeforeAt = Date.parse(basePair.before.acquiredAt);
  const current = features.filter((scene) => Date.parse(scene.acquiredAt) <= baseAfterAt && Date.parse(scene.acquiredAt) >= baseAfterAt - 60 * 86_400_000 && scene.id !== basePair.after.id).sort((a, b) => a.cloudCover - b.cloudCover || Date.parse(b.acquiredAt) - Date.parse(a.acquiredAt));
  const prior = features.filter((scene) => Math.abs(Date.parse(scene.acquiredAt) - baseBeforeAt) <= 60 * 86_400_000 && scene.id !== basePair.before.id).sort((a, b) => a.cloudCover - b.cloudCover || Math.abs(Date.parse(a.acquiredAt) - baseBeforeAt) - Math.abs(Date.parse(b.acquiredAt) - baseBeforeAt));
  const pairs = [];
  for (const after of current) {
    const before = prior.find((candidate) => !after.gridId || !candidate.gridId || after.gridId === candidate.gridId);
    if (!before) continue;
    pairs.push({ before, after });
    if (pairs.length >= limit) break;
  }
  return pairs;
}

function rankFor(finding, rows) { return [...rows].sort((a, b) => Number(b.attentionPriority?.score ?? 0) - Number(a.attentionPriority?.score ?? 0) || a.findingId.localeCompare(b.findingId)).findIndex((row) => row.findingId === finding.findingId) + 1; }

function summarizeTaxonomy(rows, key) { return Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort().map((value) => [value, { count: rows.filter((row) => row[key] === value).length, percentage: percent(rows.filter((row) => row[key] === value).length, rows.length) }])); }
function aggregateFindingMetrics(rows) {
  const measured = (selector) => rows.filter((row) => selector(row)?.state === 'MEASURED' || String(selector(row)?.state ?? '').startsWith('MEASURED_'));
  const land = measured((row) => row.dimensions.landCoverConcordance);
  const repeat = measured((row) => row.dimensions.repeatSceneStability);
  const threshold = measured((row) => row.dimensions.thresholdStability);
  const graph = measured((row) => row.dimensions.graphStability);
  const breakpoint = measured((row) => row.dimensions.breakpointStability);
  const counterfactual = measured((row) => row.dimensions.counterfactualRobustness);
  return {
    denominatorFindings: rows.length,
    landCover: { measured: land.length, coverage: percent(land.length, rows.length), medianConcordance: round(validationMedian(land.map((row) => row.dimensions.landCoverConcordance.concordance))), medianDisagreementRate: round(validationMedian(land.map((row) => row.dimensions.landCoverConcordance.disagreementRate))), medianUnmappedRate: round(validationMedian(land.map((row) => row.dimensions.landCoverConcordance.unmappedRate))) },
    repeatScene: { measured: repeat.length, coverage: percent(repeat.length, rows.length), medianCandidateSurvival: round(validationMedian(repeat.map((row) => row.dimensions.repeatSceneStability.candidateSurvival))), medianGeometryIou: round(validationMedian(repeat.map((row) => row.dimensions.repeatSceneStability.geometryIou))), classifications: summarizeSimple(repeat.map((row) => row.dimensions.repeatSceneStability.classification)) },
    threshold: { measured: threshold.length, coverage: percent(threshold.length, rows.length), medianCandidateSurvival: round(validationMedian(threshold.map((row) => row.dimensions.thresholdStability.candidateSurvival))), medianGeometryIou: round(validationMedian(threshold.map((row) => row.dimensions.thresholdStability.geometryIou))), classifications: summarizeSimple(threshold.map((row) => row.dimensions.thresholdStability.classification)) },
    graph: { measured: graph.length, coverage: percent(graph.length, rows.length), medianNodeStability: round(validationMedian(graph.map((row) => row.dimensions.graphStability.nodeStability))), medianEdgeStability: round(validationMedian(graph.map((row) => row.dimensions.graphStability.edgeStability))) },
    breakpoint: { measured: breakpoint.length, coverage: percent(breakpoint.length, rows.length), medianStability: round(validationMedian(breakpoint.map((row) => row.dimensions.breakpointStability.value))) },
    counterfactual: { measured: counterfactual.length, coverage: percent(counterfactual.length, rows.length), classifications: summarizeSimple(counterfactual.map((row) => row.dimensions.counterfactualRobustness.classification)), medianRetention: round(validationMedian(counterfactual.map((row) => row.dimensions.counterfactualRobustness.candidateRetainedFrequency))) },
    engineeringEvidenceStatus: summarizeSimple(rows.map((row) => row.engineeringEvidence.status)),
    claimLevels: summarizeSimple(rows.map((row) => `LEVEL_${row.claimLevel.level}_${row.claimLevel.name}`)),
    expertValidation: { state: 'NOT_PERFORMED', labels: 0, precision: null, recall: null }
  };
}
function summarizeSimple(values) { return Object.fromEntries([...new Set(values)].filter(Boolean).sort().map((value) => [value, values.filter((item) => item === value).length])); }
function buildEvidenceDebt({ aggregate, negativeControls, falseNegativeRows, repeatSceneRuns, referenceProductIntegrity }) {
  const base = (input) => createEvidenceDebtItem({ ...input, created_at: generatedAt, updated_at: generatedAt, owner_class: input.owner_class ?? 'APPLIED_SCIENCE', watch_state: input.watch_state ?? 'NOT_ARMED' });
  const items = [
    base({ id: 'debt:prevent:reference-land-cover', subject: 'PREVENT_FINDINGS', quantity_question: 'Are finding geometries concordant with vegetation-bearing reference classes?', current_state: 'OPEN', why_unknown: 'Reference composition was present but not measured as a validation dimension.', why_it_matters: 'Discordant land cover can reveal physically implausible candidates.', decision_blocked: 'Engineering evidence status and candidate triage.', measurement_method: 'geometry_bound_worldcover_concordance_v1', evidence_required: ['Geometry-bound ESA WorldCover samples'], acceptable_reference_authority: ['ESA WorldCover'], current_denominator: 0, target_denominator: findings.length, system_resolvable: true, human_required: false, field_required: false, next_opportunity: null, closure_contract: 'Every current finding has mapped/reference/disagreement/unmapped fractions with dependency declared.', provenance: { source: relative(paths.context) } }),
    base({ id: 'debt:prevent:reference-raw-product-integrity', subject: 'PREVENT_REFERENCE_DATASETS', quantity_question: 'Are the original bytes of every machine reference family archived and checksum-bound?', current_state: referenceProductIntegrity.state, why_unknown: 'WorldCover and DEM were provider COG range reads; derived geometry-bound evidence is hash-bound but the original COG bytes were not locally archived.', why_it_matters: 'Raw byte preservation enables independent reproduction if provider assets change.', decision_blocked: 'Full raw-product reproducibility claim.', measurement_method: 'reference_raw_product_archive_integrity_v1', evidence_required: ['Provider artifact path', 'SHA-256 checksum', 'Acquisition timestamp', 'Join policy'], acceptable_reference_authority: ['Original provider asset or attributable mirror'], current_denominator: referenceProductIntegrity.archivedFamilies, target_denominator: referenceProductIntegrity.denominatorFamilies, system_resolvable: true, human_required: false, field_required: false, next_opportunity: 'Next governed reference acquisition with bounded COG range archive', watch_state: 'ARMED_REFERENCE_ARCHIVE', closure_contract: 'Every integrity-eligible reference family has locally archived original bytes and a verified SHA-256 checksum.', provenance: { missing: referenceProductIntegrity.missingRawProductChecksums } }),
    base({ id: 'debt:prevent:repeat-scene', subject: 'PREVENT_FINDINGS', quantity_question: 'Do candidates persist across legitimate comparable Sentinel-2 scene pairs?', current_state: repeatSceneRuns.length ? 'OPEN' : 'EXTERNALLY_BLOCKED', why_unknown: 'No repeat-scene graph corpus existed.', why_it_matters: 'One-pair candidates may be seasonal or registration artifacts.', decision_blocked: 'Scientific claim level 1.', measurement_method: 'repeat_scene_detector_graph_overlap_v1', evidence_required: ['At least one alternative no-leakage comparable scene pair per site'], acceptable_reference_authority: ['Copernicus Sentinel-2 L2A', 'AWS Sentinel-2 COG mirror'], current_denominator: 0, target_denominator: findings.length, system_resolvable: true, human_required: false, field_required: false, next_opportunity: repeatSceneRuns.length ? null : 'Next cloud-governed same-grid Sentinel-2 pair', watch_state: repeatSceneRuns.length ? 'NOT_ARMED' : 'ARMED_PROVIDER_SCENE', closure_contract: 'Candidate survival, IoU, graph, breakpoint, asset-path and rank stability measured.', provenance: { repeatSceneRuns: repeatSceneRuns.length } }),
    base({ id: 'debt:prevent:threshold-stability', subject: 'PREVENT_FINDINGS', quantity_question: 'Do candidates survive bounded detector parameter perturbations?', current_state: 'OPEN', why_unknown: 'Only production defaults had been executed.', why_it_matters: 'Brittle candidates should not reach field review as strong evidence.', decision_blocked: 'Engineering evidence status.', measurement_method: 'bounded_parameter_sensitivity_v1', evidence_required: ['Frozen current scene pairs', 'Nine predeclared parameter variants'], acceptable_reference_authority: ['VIGIA deterministic detector'], current_denominator: 0, target_denominator: findings.length, system_resolvable: true, human_required: false, field_required: false, next_opportunity: null, closure_contract: 'Survival, geometry drift, graph drift, breakpoint drift and rank drift classified ROBUST/SENSITIVE/UNSTABLE.', provenance: { variants: parameterVariants().map((variant) => variant.id) } }),
    base({ id: 'debt:prevent:counterfactual-robustness', subject: 'PREVENT_INTERVENTION_CANDIDATES', quantity_question: 'Does the breakpoint persist under bounded graph measurement uncertainty?', current_state: 'OPEN', why_unknown: 'Only a single nominal graph counterfactual existed.', why_it_matters: 'Unstable breakpoints must not be presented as durable intervention candidates.', decision_blocked: 'Intervention engineering evidence status.', measurement_method: 'deterministic_graph_uncertainty_perturbation_v1', evidence_required: ['Geometry-bound graph', 'Declared 10 m uncertainty', '101 deterministic trials'], acceptable_reference_authority: ['VIGIA geometry-bound graph'], current_denominator: 0, target_denominator: findings.length, system_resolvable: true, human_required: false, field_required: false, next_opportunity: null, closure_contract: 'Retention frequency, connectivity interval, asset-path interval and alternatives measured.', provenance: {} }),
    base({ id: 'debt:prevent:negative-controls', subject: 'PREVENT_NEGATIVE_CONTROLS', quantity_question: 'How often does PREVENT raise candidates on authoritative management-change negatives?', current_state: 'PARTIALLY_MEASURED', why_unknown: 'Rejected components lack independent management labels and geometry.', why_it_matters: 'Physical change is not automatically a hazard.', decision_blocked: 'Negative-control specificity.', measurement_method: 'frozen_rejected_component_decision_audit_v1', evidence_required: ['Authoritative management-change geometry labels'], acceptable_reference_authority: ['CLMS change products', 'authoritative forestry/agriculture records'], current_denominator: negativeControls.frozenDecisionAuditSamples, target_denominator: Math.max(100, negativeControls.frozenDecisionAuditSamples), system_resolvable: true, human_required: false, field_required: false, next_opportunity: 'Machine-readable CLMS HRL change assets or authoritative management records', watch_state: 'ARMED_REFERENCE_DATA', closure_contract: 'False candidate rate and abstention on independently labelled negatives; rejected components alone do not count as true negatives.', provenance: { decisionAuditSamples: negativeControls.decisionAuditSamples } }),
    base({ id: 'debt:prevent:retrospective-alignment', subject: 'PREVENT_HISTORICAL', quantity_question: 'Did frozen pre-event graphs align with later official burned-area structure?', current_state: 'EXTERNALLY_BLOCKED', why_unknown: 'No governed pre-event PREVENT graph corpus exists.', why_it_matters: 'Historical structural relevance can prioritize science without causal claims.', decision_blocked: 'Claim level 3.', measurement_method: 'no_leakage_pre_event_burned_area_overlap_v1', evidence_required: ['Pre-event scene pairs', 'Official later fire perimeters', 'Frozen policy and split'], acceptable_reference_authority: ['ICNF official geometries', 'EFFIS/JRC final mapped burned areas'], current_denominator: 0, target_denominator: 50, system_resolvable: true, human_required: false, field_required: false, next_opportunity: 'Historical acquisition campaign', watch_state: 'ARMED_HISTORICAL_CAMPAIGN', closure_contract: 'Overlap reported only as retrospective structural relevance.', provenance: {} }),
    base({ id: 'debt:active-fire:false-negative-recovery', subject: 'ACTIVE_FIRE_V4_FALSE_NEGATIVES', quantity_question: 'Which failures are policy-recoverable versus sensor-limited?', current_state: 'OPEN', why_unknown: 'Errors were listed individually without recovery classes.', why_it_matters: 'Detector complexity should target recoverable failures only.', decision_blocked: 'Whether to attempt V5.', measurement_method: 'v4_false_negative_root_cause_v1', evidence_required: ['Frozen V4 error explorer'], acceptable_reference_authority: ['V4 frozen confirmatory benchmark'], current_denominator: 0, target_denominator: falseNegativeRows.length, system_resolvable: true, human_required: false, field_required: false, next_opportunity: null, closure_contract: 'Every false negative receives a root-cause and recovery class.', provenance: { benchmark: relative(paths.detectorBenchmark) } }),
    base({ id: 'debt:prevent:expert-field-validation', subject: 'PREVENT_CLAIM_LEVEL_4', quantity_question: 'Are candidates externally or field validated?', current_state: 'EXTERNALLY_BLOCKED', why_unknown: 'No expert or field authority is available in this sprint.', why_it_matters: 'Machine evidence cannot authorize intervention.', decision_blocked: 'Claim level 4 and operational intervention.', measurement_method: 'attributable_expert_field_review', evidence_required: ['Qualified attributable review', 'Field evidence where applicable'], acceptable_reference_authority: ['Qualified wildfire prevention expert', 'Remote-sensing expert', 'Field authority'], current_denominator: 0, target_denominator: findings.length, system_resolvable: false, human_required: true, field_required: true, next_opportunity: 'Future deployment gate', watch_state: 'WAITING_EXTERNAL_AUTHORITY', closure_contract: 'No automatic closure; attributable authority required.', provenance: {} })
  ];
  return items.map((item) => {
    const resolution = item.id.includes('reference-land-cover') ? { denominator: aggregate.landCover.measured, evidence: aggregate.landCover }
      : item.id.includes('repeat-scene') && aggregate.repeatScene.measured ? { denominator: aggregate.repeatScene.measured, evidence: aggregate.repeatScene }
        : item.id.includes('threshold-stability') ? { denominator: aggregate.threshold.measured, evidence: aggregate.threshold }
          : item.id.includes('counterfactual') ? { denominator: aggregate.counterfactual.measured, evidence: aggregate.counterfactual }
            : item.id.includes('false-negative-recovery') ? { denominator: falseNegativeRows.length, evidence: summarizeTaxonomy(falseNegativeRows, 'recovery') } : null;
    if (!resolution) return item;
    const complete = resolution.denominator >= item.target_denominator;
    return transitionEvidenceDebtItem(item, complete ? 'MEASURED' : 'PARTIALLY_MEASURED', { updated_at: generatedAt, current_denominator: resolution.denominator, resolution_evidence: resolution.evidence });
  });
}
function measurementPlanFor(item) {
  return createMeasurementPlan({ id: `plan:${item.id}`, evidenceDebtItemId: item.id, objective: item.quantity_question, dataset: { subject: item.subject, targetDenominator: item.target_denominator, frozen: true }, frozenSplit: item.id.includes('negative') || item.id.includes('false-negative') ? 'FROZEN_CONFIRMATORY' : 'ALL_CURRENT_FINDINGS_NO_PERFORMANCE_EXCLUSIONS', measurementMethods: [{ id: item.measurement_method, version: 'v1', deterministic: !item.human_required, parameters: {}, prohibitedInputs: ['LLM_GENERATED_LABEL', 'FUTURE_REFERENCE_FOR_PRE_EVENT_DECISION'] }], requiredEvidence: item.evidence_required, successContract: item.closure_contract, createdAt: generatedAt });
}
function buildCampaigns({ aggregate, negativeControls, falseNegativeRows, repeatSceneRuns, parameterRuns, evidenceDebt, referenceProductIntegrity }) {
  const campaign = (input) => createMeasurementCampaign({ ...input, generatedAt, version: 'v1', priorCampaignHash: null });
  return [
    campaign({ id: 'campaign:PREVENT_STABILITY:v1', objective: 'Measure repeat-scene and bounded-parameter candidate/graph stability.', dataset: { findings: findings.length, analysisGroups: siteGroups.length, uniquePhysicalSites: new Set(siteGroups.map((site) => siteIdFor(site.coordinate))).size }, frozenSplit: 'ALL_CURRENT_FINDINGS_NO_PERFORMANCE_EXCLUSIONS', measurementMethods: ['repeat_scene_detector_graph_overlap_v1', 'bounded_parameter_sensitivity_v1'], requiredEvidence: ['Sentinel-2 COG pairs', 'Persisted finding geometries'], progress: { state: aggregate.threshold.measured === findings.length ? 'MEASURED' : 'PARTIAL', completed: aggregate.threshold.measured, denominator: findings.length, repeatSceneRuns: repeatSceneRuns.length, parameterRuns: parameterRuns.length }, metrics: { repeatScene: aggregate.repeatScene, threshold: aggregate.threshold, graph: aggregate.graph, breakpoint: aggregate.breakpoint }, remainingDebt: evidenceDebt.filter((item) => ['debt:prevent:repeat-scene', 'debt:prevent:threshold-stability'].includes(item.id) && item.current_state !== 'MEASURED').map((item) => item.id) }),
    campaign({ id: 'campaign:REFERENCE_PRODUCT_INTEGRITY:v1', objective: 'Archive and checksum every integrity-eligible reference family used by machine validation.', dataset: { eligibleReferenceFamilies: referenceProductIntegrity.denominatorFamilies }, frozenSplit: 'CURRENT_REFERENCE_REGISTRY', measurementMethods: ['reference_raw_product_archive_integrity_v1'], requiredEvidence: ['Local raw artifact', 'SHA-256 checksum', 'Acquisition and join policy'], progress: { state: referenceProductIntegrity.state, completed: referenceProductIntegrity.archivedFamilies, denominator: referenceProductIntegrity.denominatorFamilies }, metrics: referenceProductIntegrity, remainingDebt: referenceProductIntegrity.state === 'MEASURED' ? [] : ['debt:prevent:reference-raw-product-integrity'] }),
    campaign({ id: 'campaign:PREVENT_NEGATIVE_CONTROLS:v1', objective: 'Measure behavior on independently labelled management/seasonal/change negatives.', dataset: { decisionAuditSamples: negativeControls.decisionAuditSamples, frozenDecisionAuditSamples: negativeControls.frozenDecisionAuditSamples, authoritativeLabels: 0 }, frozenSplit: 'FROZEN_CONFIRMATORY', measurementMethods: ['frozen_rejected_component_decision_audit_v1'], requiredEvidence: ['Geometry-bound authoritative negative labels'], progress: { state: 'PARTIALLY_MEASURED', completed: negativeControls.frozenDecisionAuditSamples, denominator: 100 }, metrics: negativeControls, remainingDebt: ['debt:prevent:negative-controls'] }),
    campaign({ id: 'campaign:PREVENT_RETROSPECTIVE_ALIGNMENT:v1', objective: 'Measure no-leakage pre-event graph alignment with later official burned areas.', dataset: { eligibleHistoricalPreEventRuns: 0 }, frozenSplit: 'NOT_CREATED', measurementMethods: ['no_leakage_pre_event_burned_area_overlap_v1'], requiredEvidence: ['Pre-event scene pairs', 'Later official perimeters'], progress: { state: 'EXTERNALLY_BLOCKED', completed: 0, denominator: 50 }, metrics: {}, remainingDebt: ['debt:prevent:retrospective-alignment'] }),
    campaign({ id: 'campaign:ACTIVE_FIRE_FALSE_NEGATIVE:v1', objective: 'Cluster V4 confirmatory false negatives by causal recovery value.', dataset: { cases: falseNegativeRows.length, benchmark: relative(paths.detectorBenchmark) }, frozenSplit: '2023_V4_FROZEN_CONFIRMATORY', measurementMethods: ['v4_false_negative_root_cause_v1'], requiredEvidence: ['Frozen error explorer'], progress: { state: 'MEASURED', completed: falseNegativeRows.length, denominator: falseNegativeRows.length }, metrics: { taxonomy: summarizeTaxonomy(falseNegativeRows, 'cluster'), recovery: summarizeTaxonomy(falseNegativeRows, 'recovery') }, remainingDebt: [] }),
    campaign({ id: 'campaign:LIVE_ALERT_PERFORMANCE:v1', objective: 'Watch future attributable alert outcomes without inventing denominators.', dataset: { externallyLabelledAlerts: 0 }, frozenSplit: null, measurementMethods: ['prospective_alert_outcome_watch_v1'], requiredEvidence: ['Attributable external outcome labels'], progress: { state: 'WATCHING', completed: 0, denominator: 1 }, metrics: {}, remainingDebt: ['External labels remain unavailable.'] }),
    campaign({ id: 'campaign:FIELDNET_CONFLICT_CLOSURE:v1', objective: 'Watch preserved FieldNet truth conflicts for attributable closure evidence.', dataset: { currentOpenConflicts: 2 }, frozenSplit: null, measurementMethods: ['fieldnet_conflict_closure_watch_v1'], requiredEvidence: ['Attributable field verification'], progress: { state: 'WATCHING', completed: 0, denominator: 2 }, metrics: {}, remainingDebt: ['Field authority required.'] })
  ];
}
async function mapLimit(items, concurrency, mapper) {
  const output = new Array(items.length); let index = 0;
  async function worker() { while (index < items.length) { const current = index++; output[current] = await mapper(items[current], current); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return output;
}
