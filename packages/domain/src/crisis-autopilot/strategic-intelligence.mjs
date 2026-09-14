import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { instant, object, text } from './strategic-helpers.mjs';
import { projectCrisisMemory, projectNearMisses, projectShadowMode } from './strategic-learning.mjs';
import { projectPolicyToCode, projectSemanticTranslator } from './strategic-policy.mjs';
import { projectPrevention } from './strategic-prevention.mjs';
import { projectPublicSafetyMesh } from './public-safety-mesh.mjs';

export function projectStrategicCrisisIntelligence(input = {}) {
  const asOf = instant(input.asOf);
  if (!asOf) throw new Error('strategic_crisis_intelligence_as_of_required');
  const incident = object(input.incident), prevention = projectPrevention(input.regionalRiskContext, asOf);
  const result = {
    schemaVersion: 'vigia.strategic-crisis-intelligence.v1',
    generatedAt: asOf,
    incidentId: text(incident.id ?? incident.incidentId),
    crisisShadowMode: projectShadowMode(input.shadowStrategies, input.actualOutcome, asOf),
    globalCrisisMemory: projectCrisisMemory(incident, input.historicalIncidents, asOf),
    nearMissIntelligence: projectNearMisses(input.nearMisses, asOf),
    ...prevention,
    policyToCode: projectPolicyToCode(input.policies, asOf),
    interagencySemanticTranslator: projectSemanticTranslator(input.terminologyMappings, asOf),
    publicSafetyMesh: projectPublicSafetyMesh(input.publicReports, asOf),
    safetyBoundary: 'All strategic systems are projections. They cannot mutate canonical truth, activate policy, grant authority, dispatch resources, publish warnings, or claim outcomes.',
  };
  return immutable({ ...result, projectionHash: semanticHash('strategic-crisis-intelligence', result) });
}
