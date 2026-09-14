import { immutable, requiredText, semanticHash } from '../intelligence/shared.mjs';

export function createLineageNode(input = {}) {
  const core = { id: requiredText(input.id, 'lineage_node_id_required'), kind: requiredText(input.kind, 'lineage_node_kind_required'), contentHash: requiredText(input.contentHash, 'lineage_node_hash_required'), exists: input.exists !== false, rights: structuredClone(input.rights ?? {}), createdAt: new Date(input.createdAt ?? Date.now()).toISOString() };
  return immutable(core);
}

export function createLineageEdge(input = {}) {
  const core = { id: requiredText(input.id, 'lineage_edge_id_required'), sourceId: requiredText(input.sourceId, 'lineage_edge_source_required'), targetId: requiredText(input.targetId, 'lineage_edge_target_required'), transformation: requiredText(input.transformation, 'lineage_edge_transformation_required'), codeVersion: requiredText(input.codeVersion, 'lineage_edge_code_version_required'), inputHash: requiredText(input.inputHash, 'lineage_edge_input_hash_required'), outputHash: requiredText(input.outputHash, 'lineage_edge_output_hash_required'), knowledgeTimePolicy: requiredText(input.knowledgeTimePolicy ?? 'availableToVigiaAt<=cutoff', 'lineage_edge_knowledge_policy_required'), rightsPropagation: structuredClone(input.rightsPropagation ?? {}), qualityResult: structuredClone(input.qualityResult ?? {}), createdAt: new Date(input.createdAt ?? Date.now()).toISOString() };
  return immutable(core);
}

export function verifyLineageGraph({ nodes = [], edges = [], expectedHashes = {} } = {}) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node])), adjacency = new Map(), failures = [];
  if (nodeMap.size !== nodes.length) failures.push({ code: 'DUPLICATE_NODE_ID' });
  for (const edge of edges) {
    const source = nodeMap.get(edge.sourceId), target = nodeMap.get(edge.targetId);
    if (!source || !target) failures.push({ code: 'MISSING_UPSTREAM_OBJECT', edgeId: edge.id });
    if (source && source.contentHash !== edge.inputHash) failures.push({ code: 'INPUT_HASH_SUBSTITUTION', edgeId: edge.id });
    if (target && target.contentHash !== edge.outputHash) failures.push({ code: 'OUTPUT_HASH_SUBSTITUTION', edgeId: edge.id });
    if (source && !source.exists) failures.push({ code: 'DELETED_DEPENDENCY', nodeId: source.id });
    if (source?.rights?.derivedRedistribution === false && edge.rightsPropagation?.derivedRedistribution === true) failures.push({ code: 'RIGHTS_LOSS', edgeId: edge.id });
    const next = adjacency.get(edge.sourceId) ?? []; next.push(edge.targetId); adjacency.set(edge.sourceId, next);
  }
  for (const node of nodes) if (expectedHashes[node.id] && expectedHashes[node.id] !== node.contentHash) failures.push({ code: 'REPLAY_MISMATCH', nodeId: node.id });
  const visiting = new Set(), visited = new Set();
  const visit = (id) => { if (visiting.has(id)) { failures.push({ code: 'LINEAGE_CYCLE', nodeId: id }); return; } if (visited.has(id)) return; visiting.add(id); for (const next of adjacency.get(id) ?? []) visit(next); visiting.delete(id); visited.add(id); };
  for (const id of nodeMap.keys()) visit(id);
  const core = { schemaVersion: 'vigia.lineage-verification.v1', nodeCount: nodes.length, edgeCount: edges.length, failures: failures.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
  return immutable({ ...core, passed: failures.length === 0, fingerprint: semanticHash('lineage-verification', core) });
}

export function traverseLineage(graph, startId, direction = 'UPSTREAM') {
  const edgeMap = new Map();
  for (const edge of graph.edges ?? []) { const key = direction === 'UPSTREAM' ? edge.targetId : edge.sourceId, value = direction === 'UPSTREAM' ? edge.sourceId : edge.targetId; const rows = edgeMap.get(key) ?? []; rows.push({ edge, value }); edgeMap.set(key, rows); }
  const seen = new Set(), queue = [startId], edges = [];
  while (queue.length) { const id = queue.shift(); if (seen.has(id)) continue; seen.add(id); for (const item of edgeMap.get(id) ?? []) { edges.push(item.edge); queue.push(item.value); } }
  return immutable({ nodes: [...seen].map((id) => graph.nodes.find((node) => node.id === id)).filter(Boolean), edges: [...new Map(edges.map((edge) => [edge.id, edge])).values()] });
}
