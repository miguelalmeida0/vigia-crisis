import { json } from '../../http/responses.mjs';

export function registerTerritoryCommandRoutes(router, { territoryCommandService }) {
  router.get('/api/v10/territory', async ({ res }) => json(res, 200, await territoryCommandService.snapshot()));
}
