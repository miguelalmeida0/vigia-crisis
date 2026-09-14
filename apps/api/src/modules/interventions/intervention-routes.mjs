import { readJsonBody } from '../../http/body.mjs';
import { json, noContent } from '../../http/responses.mjs';

export function registerInterventionRoutes(router, { commandService }) {
  router.get('/api/v1/operator-state', async ({ res }) => json(res, 200, commandService.snapshot()));
  router.post('/api/v1/hazards/verify', async ({ req, res }) => json(res, 201, await commandService.confirmHazard(await readJsonBody(req))));
  router.post('/api/v1/incidents/:id/decision', async ({ req, res, params }) => json(res, 200, await commandService.decideIncident(params.id, await readJsonBody(req))));
  router.post('/api/v1/interventions', async ({ req, res }) => json(res, 201, await commandService.createIntervention(await readJsonBody(req))));
  router.patch('/api/v1/interventions/:id', async ({ req, res, params }) => json(res, 200, await commandService.transitionIntervention(params.id, await readJsonBody(req))));
  router.post('/api/v1/watch-places', async ({ req, res }) => json(res, 201, await commandService.addWatchPlace(await readJsonBody(req))));
  router.register('DELETE', '/api/v1/watch-places/:id', async ({ res, params }) => {
    await commandService.removeWatchPlace(params.id);
    noContent(res);
  });
}
