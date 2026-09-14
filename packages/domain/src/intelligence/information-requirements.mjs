import {CATEGORY_LABEL, CRITICAL_CATEGORIES, DEPENDENT_OUTPUTS, LIFECYCLE_STATES, REQUIREMENT_CLASSES, knowledgeStateFromPicture, knowledgeStateFromSituation} from './knowledge-state.mjs';
import {capabilityRequirements, categoryCapabilityRequirements, identityAndContactRequirements} from './facility-requirements.mjs';
import {receptionRequirements, roadRequirements, routeRequirements, sourceRequirements} from './context-requirements.mjs';

// VIGIA already reasons about the operational world. This module makes it reason
// about the value of what it does NOT know: which missing or stale fact matters,
// which retained support relationships and communities depend on it, and which
// VIGIA outputs would have to be recomputed if it were resolved.
//
// Three rules hold throughout:
//   * A requirement never asserts the missing fact. "Unverified" is not "absent",
//     and "no ingested restriction" is not "open".
//   * Every class is bounded. There are no free-form requirement kinds.
//   * Every number is a count of retained objects, never an opinion score.

export {REQUIREMENT_CLASSES, LIFECYCLE_STATES, DEPENDENT_OUTPUTS, knowledgeStateFromSituation, knowledgeStateFromPicture};
export function criticalCategories() { return CRITICAL_CATEGORIES; }
export function categoryLabel(id) { return CATEGORY_LABEL[id] ?? String(id ?? '').replaceAll('_', ' '); }


export function informationRequirements(state, {limit = 60} = {}) {
  if (!state?.incident?.id) throw new Error('knowledge_state_required');
  const rows = [
    ...categoryCapabilityRequirements(state),
    ...capabilityRequirements(state),
    ...routeRequirements(state),
    ...receptionRequirements(state),
    ...roadRequirements(state),
    ...identityAndContactRequirements(state),
    ...sourceRequirements(state)
  ];
  // Equivalent requirements deduplicate by identity, never by similarity.
  const unique = new Map();
  for (const row of rows) if (!unique.has(row.id)) unique.set(row.id, row);
  const ordered = [...unique.values()].sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    schemaVersion: 'vigia.information-requirements.v1',
    incidentId: state.incident.id,
    snapshotId: state.snapshotId,
    origin: state.origin,
    knownAt: state.knownAt,
    evaluatedAt: state.evaluatedAt,
    universe: state.universe,
    requirementClasses: REQUIREMENT_CLASSES,
    total: ordered.length,
    returned: Math.min(ordered.length, limit),
    truncated: ordered.length > limit,
    requirements: ordered.slice(0, limit),
    limitation: 'Derived from the retained set only. A requirement that is not generated is not evidence that no gap exists; it means no retained object exposes one.'
  });
}
