import { createHash } from 'node:crypto';
import path from 'node:path';

import { readJson } from '../../shared/json-file.mjs';

const rows = (value) => Array.isArray(value) ? value : [];
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const percentile = (values, quantile) => {
  const sorted = values.map(finite).filter((value) => value !== null).sort((left, right) => left - right);
  if (!sorted.length) return null;
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)].toFixed(3));
};
const canonicalId = (value) => String(value ?? '').replace(/^(?:event|incident):/u, '');
const hash = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const pointFeature = (item) => item?.coordinate?.length === 2 ? {
  id: item.id,
  label: item.label,
  kind: item.kind,
  coordinate: item.coordinate,
  distanceKm: item.distanceKm,
  source: item.source,
  retrievedAt: item.retrievedAt,
  preliminary: item.preliminary,
  method: item.method,
  limitation: item.limitation,
  geometry: { type: 'Feature', properties: { id: item.id, label: item.label, kind: item.kind, distanceKm: item.distanceKm, source: item.source, retrievedAt: item.retrievedAt, preliminary: item.preliminary, method: item.method, limitation: item.limitation }, geometry: { type: 'Point', coordinates: item.coordinate } },
} : null;

function collectionEffectiveness(ledger) {
  const requirements = rows(ledger?.requirements);
  const satisfied = requirements.filter((item) => item.state === 'SATISFIED');
  const unsatisfied = requirements.filter((item) => item.state !== 'SATISFIED');
  const stages = rows(ledger?.stageDurations).filter((item) => item.state === 'SATISFIED');
  const freshProvider = stages.filter((item) => item.qualification === 'FRESH_UPSTREAM_PROVIDER_REQUEST');
  const byClass = Object.fromEntries([...new Set(requirements.flatMap((item) => rows(item.requiredEvidenceClasses)))].map((key) => {
    const classRows = requirements.filter((item) => rows(item.requiredEvidenceClasses).includes(key));
    return [key, { selected: classRows.length, satisfied: classRows.filter((item) => item.state === 'SATISFIED').length, unsatisfied: classRows.filter((item) => item.state !== 'SATISFIED').length }];
  }));
  const latencyMetric = (key, sample = stages) => ({ p50Ms: percentile(sample.map((item) => item[key]), .5), p95Ms: percentile(sample.map((item) => item[key]), .95), maxMs: percentile(sample.map((item) => item[key]), 1), samples: sample.filter((item) => finite(item[key]) !== null).length });
  return {
    schemaVersion: 'vigia.collection-effectiveness.v1',
    generatedAt: ledger?.generatedAt ?? null,
    cohort: ledger?.cohort ?? null,
    summary: { selected: requirements.length, satisfied: satisfied.length, unsatisfied: unsatisfied.length, satisfiedIncidentCount: new Set(satisfied.map((item) => item.incidentId)).size, satisfiedEvidenceClassCount: new Set(satisfied.flatMap((item) => rows(item.requiredEvidenceClasses))).size, automaticSatisfactionPercent: requirements.length ? Number((satisfied.length / requirements.length * 100).toFixed(1)) : null },
    evidenceClasses: byClass,
    latency: {
      qualification: 'Every internal stage is measured; upstream provider response is reported only for the fresh EU-DEM request subset.',
      scheduling: latencyMetric('schedulingMs'),
      providerResponse: latencyMetric('providerResponseMs', freshProvider),
      normalization: latencyMetric('normalizationMs'),
      incidentIdentityMatch: latencyMetric('incidentIdentityMatchMs'),
      evidenceFamilyAssignment: latencyMetric('evidenceFamilyAssignmentMs'),
      qualityEvaluation: latencyMetric('qualityEvaluationMs'),
      admissionDecision: latencyMetric('admissionDecisionMs'),
      requirementSatisfaction: latencyMetric('requirementSatisfactionMs'),
      incidentRevision: latencyMetric('incidentRevisionMs'),
      operatorUpdate: latencyMetric('operatorUpdateMs'),
      thresholds: { schedulingP95Ms: 250, admissionDecisionP95Ms: 500, incidentRevisionP95Ms: 500, operatorUpdateP95Ms: 500 },
    },
    unsatisfiedReasons: Object.fromEntries([...new Set(unsatisfied.map((item) => item.collectionTasks?.[0]?.result ?? 'UNCLASSIFIED'))].map((reason) => [reason, unsatisfied.filter((item) => (item.collectionTasks?.[0]?.result ?? 'UNCLASSIFIED') === reason).length])),
    transitions: rows(ledger?.transitions),
    requirements,
    truthBoundary: ledger?.truthBoundary ?? null,
  };
}

export class OperationalProofService {
  #referenceDataPromise = null;
  constructor({ projectRoot = process.cwd() } = {}) {
    this.contextFile = path.join(projectRoot, 'data/reference/operational-proof/governed-incident-context.json');
    this.ledgerFile = path.join(projectRoot, 'data/reference/operational-proof/information-requirement-ledger.json');
  }

  // Both files are static governed reference data (the ledger alone is
  // ~14.6MB on disk) that never changes at runtime, but project() re-read and
  // re-parsed them on every call with no caching at all — and project() runs
  // on every governed-twin rebuild (every canonical-operator screen request,
  // rate-limited only by CanonicalOperatorApiService's ~60s governedTwinTtlMs).
  // Under sustained traffic that is a multi-ten-MB allocate/parse/discard
  // cycle roughly every minute, which is exactly the kind of repeated churn
  // that plausibly explains a process that runs fine for several minutes and
  // then OOMs rather than crashing immediately. Loaded once per process
  // lifetime instead; the derived per-call projections below (which do
  // legitimately depend on the caller's `recovery` argument) are unaffected.
  #referenceData() {
    if (!this.#referenceDataPromise) this.#referenceDataPromise = Promise.all([
      readJson(this.contextFile, null),
      readJson(this.ledgerFile, null)
    ]).then(([contextPack, ledger]) => ({ contextPack, ledger })).catch((error) => { this.#referenceDataPromise = null; throw error; });
    return this.#referenceDataPromise;
  }

  async project(recovery) {
    const { contextPack, ledger } = await this.#referenceData();
    if (!contextPack || !ledger) return { recovery, incidentContextById: new Map(), collectionEffectiveness: null, geometryAudit: null };
    const legacyRequirements = rows(recovery?.informationCollection?.requirements);
    const proofRequirements = rows(ledger.requirements);
    const requirements = [...legacyRequirements, ...proofRequirements];
    const legacyTasks = legacyRequirements.flatMap((item) => rows(item.collectionTasks));
    const tasks = [...legacyTasks, ...rows(ledger.tasks)];
    const counts = Object.fromEntries([...new Set(requirements.map((item) => item.state))].map((state) => [state, requirements.filter((item) => item.state === state).length]));
    const durations = proofRequirements.filter((item) => item.state === 'SATISFIED').map((item) => Math.max(0, Date.parse(item.currentAssessment?.checkedAt ?? '') - Date.parse(item.createdAt ?? ''))).filter(Number.isFinite).sort((left, right) => left - right);
    const proofPortfolio = {
      ...recovery.informationCollection,
      schemaVersion: 'vigia.information-collection-portfolio.v2',
      generatedAt: ledger.generatedAt,
      summary: {
        ...recovery.informationCollection?.summary,
        informationRequirements: requirements.length,
        collectionTasks: tasks.length,
        satisfiedRequirements: counts.SATISFIED ?? 0,
        unsatisfiedRequirements: requirements.length - (counts.SATISFIED ?? 0),
        selectedProofRequirements: proofRequirements.length,
        selectedProofIncidents: ledger.cohort?.selectedIncidentCount ?? 0,
        satisfiedEvidenceClasses: ledger.summary?.satisfiedEvidenceClasses?.length ?? 0,
        automatedRequirements: requirements.filter((item) => item.ownerPolicy?.owner !== 'Duty intelligence lead').length,
        automaticResolutionPercent: requirements.length ? Number(((counts.SATISFIED ?? 0) / requirements.length * 100).toFixed(1)) : null,
        medianSatisfactionMinutes: durations.length ? Number((durations[Math.floor(durations.length / 2)] / 60_000).toFixed(3)) : null,
        measurementState: durations.length ? 'MEASURED_FROM_DURABLE_TRANSITIONS' : 'NO_COMPLETED_DURATION_SAMPLE',
      },
      counts,
      requirements,
      tasks,
      transitionLedger: rows(ledger.transitions),
      truthBoundary: ledger.truthBoundary,
    };
    const contexts = rows(contextPack.incidents);
    const incidentContextById = new Map(contexts.map((context) => {
      const terrain = context.terrain?.state === 'AVAILABLE' ? {
        ...context.terrain,
        elevationRange: `${context.terrain.elevationRangeM?.[0]}–${context.terrain.elevationRangeM?.[1]} m`,
        slope: `${context.terrain.slopeDeg}°`,
        geometry: { ...context.terrain.geometry, properties: { ...context.terrain.geometry?.properties, elevationM: context.terrain.elevationM, elevationRange: `${context.terrain.elevationRangeM?.[0]}–${context.terrain.elevationRangeM?.[1]} m`, slope: `${context.terrain.slopeDeg}°`, aspectDeg: context.terrain.aspectDeg, localReliefM: context.terrain.localReliefM, source: context.terrain.sourceOwner, retrievedAt: context.terrain.retrievedAt, limitation: context.terrain.decisionBoundary } },
      } : context.terrain;
      const majorRoad = pointFeature(context.pointContext?.majorRoad);
      const assets = ['community', 'medicalAccess', 'fireStation', 'protectedArea', 'wildfireRelevantAsset'].map((key) => pointFeature(context.pointContext?.[key])).filter(Boolean);
      return [canonicalId(context.incidentId), { ...context, terrain, terrainGeometry: terrain?.geometry ?? null, roads: majorRoad ? [majorRoad] : [], assets, pointContext: { ...context.pointContext, majorRoad: majorRoad ?? context.pointContext?.majorRoad }, requirements: proofRequirements.filter((item) => canonicalId(item.incidentId) === canonicalId(context.incidentId)) }];
    }));
    const geometryAudit = {
      schemaVersion: 'vigia.geometry-metric-audit.v1',
      generatedAt: ledger.generatedAt,
      governedIncidentCount: contexts.length,
      terrainCoverageCount: contexts.filter((item) => item.terrain?.state === 'AVAILABLE').length,
      metricDefinitions: {
        elevationM: 'EU-DEM v1.1 bilinear center-point elevation, rounded to whole metres.',
        slopeDeg: 'Horn 3×3 finite-difference slope from 25 m-spaced EU-DEM samples, rounded to 0.1 degree.',
        areaHa: 'Only an admitted official Polygon or MultiPolygon may produce incident area. Thermal support envelopes and observation footprints are never perimeter or burned-area metrics.',
        distanceKm: 'Great-circle distance from incident coordinate to an OSM point or feature center, rounded to 0.01 km; not road or travel distance.',
      },
      officialPerimeterAreaClaims: 0,
      recomputedWithProductionLibrary: 0,
      exactEqualityFailures: 0,
      thermalGeometryExcludedFromPerimeterMetrics: true,
      truthBoundary: 'No admitted official perimeter is present in this operational subset, so incident area remains unavailable. Terrain and point proximity are contextual decision support only.',
    };
    const truth={...recovery.truth,incidents:rows(recovery.truth?.incidents).map(item=>{const context=incidentContextById.get(canonicalId(item.incidentId)),factors=rows(item.priority?.factors).map(factor=>factor.code==='POINT_CONTEXT'?{...factor,value:context?'AVAILABLE':'NOT_AVAILABLE',weight:context?2:0,basis:context?'Governed point-based context is attached for this incident coordinate.':'No governed point-based context is attached.'}:factor),terrainFactor={code:'TERRAIN_CONTEXT',value:context?.terrain?.state??'NOT_AVAILABLE',weight:context?.terrain?.state==='AVAILABLE'?1:0,basis:context?.terrain?.state==='AVAILABLE'?'Governed static terrain context is available.':'Terrain context is not available.'},score=Math.min(100,Number(item.priority?.score??0)+Number(factors.find(factor=>factor.code==='POINT_CONTEXT')?.weight??0)+terrainFactor.weight),missingFactors=[...new Set([...rows(item.priority?.missingFactors).filter(code=>code!=='POINT_CONTEXT'),...(terrainFactor.value==='NOT_AVAILABLE'?['TERRAIN_CONTEXT']:[])])],priority={...item.priority,score,factors:[...factors,terrainFactor],missingFactors,dataCompleteness:{availableDimensions:Number(item.priority?.dataCompleteness?.availableDimensions??0)+(context?1:0)+(terrainFactor.value==='AVAILABLE'?1:0),totalDimensions:15,percent:Number(((Number(item.priority?.dataCompleteness?.availableDimensions??0)+(context?1:0)+(terrainFactor.value==='AVAILABLE'?1:0))/15*100).toFixed(1))}};priority.revision=hash({incidentId:item.incidentId,score:priority.score,factors:priority.factors,evaluatedAt:priority.evaluatedAt});return{...item,priority};})};
    return { recovery: { ...recovery, truth, informationCollection: proofPortfolio }, incidentContextById, collectionEffectiveness: collectionEffectiveness(ledger), geometryAudit, contextPack };
  }
}
