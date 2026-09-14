import { immutable, requiredText, semanticHash } from '../intelligence/shared.mjs';

export function materializationSignature(input = {}) {
  return semanticHash('materialization-signature', { inputs: [...new Set(input.inputFingerprints ?? [])].sort(), parserVersion: requiredText(input.parserVersion, 'materialization_parser_required'), contractVersion: requiredText(input.contractVersion, 'materialization_contract_required'), knowledgeTimePolicy: requiredText(input.knowledgeTimePolicy, 'materialization_knowledge_policy_required'), crosswalkVersion: requiredText(input.crosswalkVersion, 'materialization_crosswalk_required'), rightsPolicyVersion: requiredText(input.rightsPolicyVersion, 'materialization_rights_policy_required'), labelDoctrineVersion: requiredText(input.labelDoctrineVersion, 'materialization_label_doctrine_required'), qualityGateVersion: requiredText(input.qualityGateVersion, 'materialization_quality_gate_required') });
}

export function assessMaterialization(current, desired) {
  const desiredSignature = materializationSignature(desired), reasons = [];
  if (!current) reasons.push('MATERIALIZATION_MISSING');
  else {
    if (current.signature !== desiredSignature) reasons.push('DEPENDENCY_SIGNATURE_CHANGED');
    if (current.rightsState === 'BLOCKED') reasons.push('RIGHTS_POLICY_BLOCKED');
    if (current.lineageState === 'INVALID') reasons.push('LINEAGE_INVALID');
    if (current.qualityState === 'FAILED') reasons.push('QUALITY_GATE_REGRESSION');
  }
  const core = { desiredSignature, currentSignature: current?.signature ?? null, stale: reasons.length > 0, reasons };
  return immutable({ ...core, fingerprint: semanticHash('materialization-assessment', core) });
}

export function affectedMaterializations(changedNodeIds = [], edges = []) {
  const changed = new Set(changedNodeIds), affected = new Set(), queue = [...changed];
  while (queue.length) { const id = queue.shift(); for (const edge of edges.filter((item) => item.sourceId === id)) if (!changed.has(edge.targetId)) { changed.add(edge.targetId); affected.add(edge.targetId); queue.push(edge.targetId); } }
  return [...affected].sort();
}
