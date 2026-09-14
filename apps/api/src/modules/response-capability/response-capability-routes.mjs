import { readJsonBody } from '../../http/body.mjs';
import { json, problem } from '../../http/responses.mjs';

export function registerResponseCapabilityRoutes(router, { responseCapabilityService, canonicalOperatorApiService }) {
  router.get('/api/v10/operator/incidents/:incidentId/response-capability', async ({ res, params, context }) => {
    const projection = typeof canonicalOperatorApiService?.responseCapability === 'function'
      ? await canonicalOperatorApiService.responseCapability(params.incidentId, { actor: context.actor })
      : await responseCapabilityService.project(context.actor, params.incidentId);
    if (!projection) return problem(res, 404, 'incident_not_found', 'Incident not found.');
    json(res, 200, projection);
  });
  router.post('/api/v10/operator/incidents/:incidentId/response-capability/recommendations/:recommendationId/reviews', async ({ req, res, params, context }) => {
    const result = await responseCapabilityService.reviewRecommendation(
      context.actor, params.incidentId, params.recommendationId, await readJsonBody(req)
    );
    canonicalOperatorApiService?.invalidate?.();
    json(res, 201, result);
  });
}
