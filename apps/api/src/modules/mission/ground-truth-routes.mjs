import { json, problem } from '../../http/responses.mjs';
export function registerGroundTruthRoutes(router, { groundTruthService, preventionService, detectionService }) {
  router.get('/api/v2/bootstrap', async ({ res, context }) => json(res, 200, await groundTruthService.bootstrap(context.actor)));
  router.get('/api/v2/prevention/:id', async ({ res, params }) => { const item = await preventionService.find(params.id,{publicProjection:true}); if (!item) return problem(res, 404, 'inspection_not_found', 'Inspection priority not found.'); json(res, 200, item); });
  router.get('/api/v2/incidents/:id', async ({ res, params }) => { const item = await detectionService.find(params.id,{publicProjection:true}); if (!item) return problem(res, 404, 'incident_not_found', 'Incident not found.'); json(res, 200, item); });
  router.get('/api/v2/field', async ({ res, context }) => json(res, 200, await groundTruthService.field(context.actor)));
}
