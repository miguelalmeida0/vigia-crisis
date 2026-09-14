import { json, problem } from '../../http/responses.mjs';
export function registerResponseRoutes(router, { responseService }) {
  router.get('/api/v1/response/:id', async ({ res, params, context }) => { const response = await responseService.build(context.actor, params.id); if (!response) return problem(res, 404, 'incident_not_found', 'Incident not found.'); json(res, 200, response); });
  router.get('/api/v2/consequence/:id', async ({ res, params, context }) => { const response = await responseService.build(context.actor, params.id); if (!response) return problem(res, 404, 'incident_not_found', 'Incident not found.'); json(res, 200, response); });
  router.get('/api/v2/consequence/:id/exposure', async ({ res, params, context }) => { const response = await responseService.exposure(context.actor, params.id); if (!response) return problem(res, 404, 'incident_not_found', 'Incident not found.'); json(res, 200, response); });
}
