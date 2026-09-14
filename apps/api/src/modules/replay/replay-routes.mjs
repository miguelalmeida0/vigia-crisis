import { json } from '../../http/responses.mjs';

export function registerReplayRoutes(router, { replayService }) {
  router.get('/api/v10/replay', async ({ res }) => json(res, 200, replayService.overview()));
  router.get('/api/v10/replay/cases/:id', async ({ res, params }) => json(res, 200, await replayService.caseDetail(params.id)));
  router.get('/api/v10/replay/source-manifest', async ({ res }) => json(res, 200, replayService.sourceManifest));
}
