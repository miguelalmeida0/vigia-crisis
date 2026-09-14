import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';
export function registerEvidenceRequestRoutes(router, { evidenceRequestService, evidenceNeedService }) {
  router.get('/api/v2/evidence-needs', async ({ res, context }) => json(res, 200, { needs: evidenceNeedService.snapshot(context.actor) }));
  router.get('/api/v10/evidence-needs', async ({ res, context }) => json(res, 200, { needs: evidenceNeedService.snapshot(context.actor) }));
  router.get('/api/v2/evidence-requests', async ({ res, context }) => json(res, 200, evidenceRequestService.snapshot(context.actor)));
  router.post('/api/v2/evidence-requests', async ({ req, res, context }) => json(res, 201, await evidenceRequestService.create(context.actor, await readJsonBody(req))));
  router.patch('/api/v2/evidence-requests/:id', async ({ req, res, params, context }) => json(res, 200, await evidenceRequestService.transition(context.actor, params.id, await readJsonBody(req))));
  router.post('/api/v2/evidence-requests/:id/submit', async ({ req, res, params, context }) => json(res, 201, await evidenceRequestService.submit(context.actor, params.id, await readJsonBody(req, { limitBytes: 1_000_000 }))));
  router.post('/api/v2/field/sync', async ({ req, res, context }) => {
    const body = await readJsonBody(req, { limitBytes: 1_500_000 });
    const results = await evidenceRequestService.sync(context.actor, body.operations ?? []);
    json(res, 200, { syncedAt: new Date().toISOString(), results });
  });
  router.post('/api/v2/evidence-requests/:id/review', async ({ req, res, params, context }) => json(res, 200, await evidenceRequestService.review(context.actor, params.id, await readJsonBody(req))));
}
