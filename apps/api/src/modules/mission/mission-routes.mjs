import { json } from '../../http/responses.mjs';

export function registerMissionRoutes(router, { missionService }) {
  router.get('/api/v1/mission', async ({ res }) => json(res, 200, await missionService.snapshot()));
}
