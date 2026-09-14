import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';
export function registerHazardRoutes(router, { hazardService }) {
  router.get('/api/v2/hazards', async ({ res, context }) => json(res, 200, { hazards: hazardService.list(context.actor) }));
  router.post('/api/v2/hazards/verify', async ({ req, res, context }) => json(res, 201, await hazardService.verify(context.actor, await readJsonBody(req))));
}
