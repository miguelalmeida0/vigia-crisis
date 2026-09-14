import { semanticHash } from '../intelligence/shared.mjs';
import { normalizedSource, optionalInstant, stablePlanningId } from './contracts.mjs';
import { isFuture, rows, text, unique } from './projection-helpers.mjs';

const DEPENDENCY_TEMPLATES = Object.freeze([
  { from: 'SUBSTATION', to: 'TELECOM', effect: 'POWER_LOSS_MAY_DEGRADE_TELECOM', activationCondition: 'SOURCE_SUBSTATION_POWER_LOSS' },
  { from: 'ROAD', to: 'COMMUNITY', effect: 'ROAD_CLOSURE_MAY_DELAY_COMMUNITY_EVACUATION', activationCondition: 'SOURCE_ROAD_CLOSED' },
  { from: 'ROAD', to: 'SHELTER', effect: 'ROAD_CLOSURE_MAY_DELAY_SHELTER_ACCESS', activationCondition: 'SOURCE_ROAD_CLOSED' },
  { from: 'ROAD', to: 'HOSPITAL', effect: 'ROAD_CLOSURE_MAY_DEGRADE_MEDICAL_ACCESS', activationCondition: 'SOURCE_ROAD_CLOSED' },
  { from: 'WATER', to: 'FIRE_STATION', effect: 'WATER_LOSS_MAY_LIMIT_FIREFIGHTING', activationCondition: 'SOURCE_WATER_UNAVAILABLE' },
]);

function dependencyEdge(input, nodeById, asOf) {
  const from = text(input.from ?? input.sourceNodeId);
  const to = text(input.to ?? input.targetNodeId);
  if (!from || !to || !nodeById.has(from) || !nodeById.has(to)) return { excluded: true, from, to, reason: 'DEPENDENCY_ENDPOINT_NOT_IN_EXPOSURE_GRAPH' };
  const source = normalizedSource(input);
  const evidenceReferences = unique(input.evidenceReferences ?? [source.reference]);
  const observedAt = optionalInstant(input.observedAt);
  const futureObservation = Boolean(observedAt && isFuture(observedAt, asOf));
  const observed = input.observed === true
    && source.attributable
    && evidenceReferences.length > 0
    && Boolean(observedAt)
    && !futureObservation;
  const core = {
    from,
    to,
    effect: text(input.effect ?? input.dependency) ?? 'UNSPECIFIED_DEPENDENCY_EFFECT',
    state: observed ? 'OBSERVED' : 'SCENARIO',
    observed: Boolean(observed),
    basis: observed ? 'OBSERVED' : 'SCENARIO',
    activationCondition: text(input.activationCondition) ?? 'CONDITION_NOT_RECORDED',
    probability: null,
    confidence: futureObservation
      ? { state: 'NOT_PROBABILISTICALLY_SCORED', score: null }
      : input.confidence ?? { state: observed ? 'ATTRIBUTABLE_OBSERVATION' : 'NOT_PROBABILISTICALLY_SCORED', score: null },
    evidenceReferences: observed ? evidenceReferences : [],
    source: observed ? source : { sourceId: source.sourceId ?? 'VIGIA_DEPENDENCY_SCENARIO', reference: source.reference, attributable: source.attributable },
    observedAt: observed ? observedAt : null,
    updatedAt: observed ? observedAt : asOf,
    generatedAt: asOf,
    downgradeReason: input.observed === true && !observed
      ? futureObservation
        ? 'FUTURE_OBSERVATION_TIME_REJECTED'
        : 'OBSERVED_LABEL_WITHHELD_WITHOUT_ATTRIBUTABLE_EVIDENCE_AND_TIME'
      : null,
  };
  return { excluded: false, edge: { dependencyId: stablePlanningId('crisis-dependency', core), ...core } };
}

export function projectCrisisDependencyGraph(exposureGraph, contexts, asOf) {
  const nodes = exposureGraph.nodes;
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  const edges = [];
  const excluded = [];
  for (const input of rows(contexts.dependencies ?? contexts.dependencyEdges)) {
    const projected = dependencyEdge(input, nodeById, asOf);
    if (projected.excluded) excluded.push(projected);
    else edges.push(projected.edge);
  }
  for (const template of DEPENDENCY_TEMPLATES) {
    const sources = nodes.filter((node) => node.kind === template.from);
    const targets = nodes.filter((node) => node.kind === template.to);
    for (const source of sources) for (const target of targets) {
      const core = {
        from: source.nodeId,
        to: target.nodeId,
        effect: template.effect,
        state: 'SCENARIO',
        observed: false,
        basis: 'SCENARIO',
        activationCondition: template.activationCondition,
        probability: null,
        confidence: { state: 'DOCTRINAL_SCENARIO_NOT_SCORED', score: null },
        evidenceReferences: [],
        source: { sourceId: 'VIGIA_DEPENDENCY_SCENARIO', reference: 'crisis-planning:dependency-doctrine:v1', attributable: true },
        observedAt: null,
        updatedAt: asOf,
        generatedAt: asOf,
        downgradeReason: null,
      };
      edges.push({ dependencyId: stablePlanningId('crisis-dependency', core), ...core });
    }
  }
  const edgeBySemanticKey = new Map();
  for (const edge of edges) {
    const key = `${edge.from}:${edge.to}:${edge.effect}:${edge.state}`;
    const prior = edgeBySemanticKey.get(key);
    if (!prior || (!prior.observed && edge.observed) || (prior.source?.sourceId === 'VIGIA_DEPENDENCY_SCENARIO' && edge.source?.sourceId !== 'VIGIA_DEPENDENCY_SCENARIO')) edgeBySemanticKey.set(key, edge);
  }
  const deduped = [...edgeBySemanticKey.values()]
    .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || left.effect.localeCompare(right.effect));
  const core = {
    schemaVersion: 'vigia.crisis-dependency-graph.v1',
    generatedAt: asOf,
    state: deduped.length ? 'AVAILABLE' : 'NO_GOVERNED_DEPENDENCIES',
    nodes,
    edges: deduped,
    excluded,
    counts: { observed: deduped.filter((edge) => edge.observed).length, scenario: deduped.filter((edge) => !edge.observed).length },
    truthBoundary: 'Dependency cascades are scenarios unless an attributable, time-bound observation is attached. Scenario edges carry no inferred probability and never mutate incident truth.',
  };
  return { ...core, projectionHash: semanticHash('crisis-dependency-graph', core) };
}

