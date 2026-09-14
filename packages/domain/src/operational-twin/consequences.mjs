import { semanticHash } from '../intelligence/shared.mjs';

const RULES = {
  source_failed: ['REVIEW','REVIEW_SOURCE_DEPENDENCIES','Source-dependent verification may be blocked.'],
  source_recovered: ['REVIEW','REEVALUATE_DEPENDENT_WORK','Recovery permits a new check; it does not satisfy the information requirement.'],
  corroboration_changed: ['REVIEW','REEVALUATE_INCIDENT','The independent evidence basis changed.'],
  official_confirmation_added: ['REVIEW','REVIEW_OFFICIAL_EVIDENCE','Official evidence may unlock verification review.'],
  official_confirmation_removed: ['HIGH','REQUEST_OFFICIAL_CONFIRMATION','The current official basis is no longer supported.'],
  evidence_became_stale: ['REVIEW','RECHECK_EVIDENCE','Stale evidence cannot sustain a current claim.'],
  conflict_detected: ['HIGH','RESOLVE_CONFLICT','Conflicting evidence requires human review.'],
  conflict_resolved: ['REVIEW','REEVALUATE_INCIDENT','The blocking disagreement changed.'],
  geometry_changed: ['REVIEW','REVIEW_GEOMETRY','Changed coordinates require spatial review, not an inferred exposure claim.'],
  task_blocked: ['REVIEW','REVIEW_BLOCKED_WORK','A persisted task reports a blocker.'],
  task_completed: ['REVIEW','VERIFY_POSTCONDITION','Work completion alone is not an observed outcome.'],
  decision_changed: ['REVIEW','REVIEW_WORK_OWNERSHIP','An operator changed the governed work lifecycle.'],
  priority_changed: ['REVIEW','REVIEW_OPERATIONAL_PRIORITY','Workload or evidence-conflict priority changed, not measured physical danger.'],
};

export function operationalConsequences(changes, blastRadius) {
  return changes.flatMap(change => {
    const rule = RULES[change.type];
    if (!rule) return [];
    const [severity,recommendedWorkflow,summary] = rule;
    const blast = blastRadius.find(item=>item.sourceId===change.entity);
    const core = { changeId:change.id,severity,recommendedWorkflow,summary,reason:change.whyItMatters,
      affectedEntityIds:blast?[...blast.incidentIds,...blast.taskIds,...blast.decisionIds]:[change.entity],evidenceIds:change.evidenceIds };
    return [{...core,id:semanticHash('operational-consequence',core)}];
  });
}
