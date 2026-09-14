import { json, problem } from '../../http/responses.mjs';

export function registerPreventionRoutes(router, { preventionService }) {
  router.get('/api/v1/prevention', async ({ res }) => json(res, 200, await preventionService.snapshot({publicProjection:true})));
  router.get('/api/v1/prevention/:id', async ({ res, params }) => {
    const item = await preventionService.find(params.id,{publicProjection:true});
    if (!item) return problem(res, 404, 'prevention_item_not_found', 'The requested prevention item is not in the current snapshot.');
    json(res, 200, item);
  });
}
