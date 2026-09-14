import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';
export function registerRemediationRoutes(router, { remediationService }) {
  router.get('/api/v2/remediations', async ({ res, context }) => json(res, 200, { remediations: remediationService.list(context.actor) }));
  router.post('/api/v2/remediations', async ({ req, res, context }) => json(res, 201, await remediationService.create(context.actor, await readJsonBody(req))));
  router.patch('/api/v2/remediations/:id', async ({ req, res, params, context }) => json(res, 200, await remediationService.transition(context.actor, params.id, await readJsonBody(req))));
  router.post('/api/v2/remediations/:id/completion', async ({ req, res, params, context }) => json(res, 201, await remediationService.submitCompletion(context.actor, params.id, await readJsonBody(req, { limitBytes: 1_000_000 }))));
  router.post('/api/v2/remediations/:id/reobserve', async ({ req, res, params, context }) => json(res, 200, await remediationService.reobserve(context.actor, params.id, await readJsonBody(req))));
}
