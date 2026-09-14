import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';
export function registerIncidentReviewRoutes(router, { incidentReviewService }) {
  router.post('/api/v2/incidents/:id/review', async ({ req, res, params, context }) => json(res, 200, await incidentReviewService.review(context.actor, params.id, await readJsonBody(req))));
}
