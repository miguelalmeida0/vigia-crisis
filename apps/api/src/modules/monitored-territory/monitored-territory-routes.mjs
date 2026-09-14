import { json } from '../../http/responses.mjs';
export function registerMonitoredTerritoryRoutes(router, { monitoredTerritoryService }) {
  router.get('/api/v10/operations/territories', async ({ res,context }) => json(res, 200, { territories: await monitoredTerritoryService.listTerritories(context.actor), registry: monitoredTerritoryService.snapshot() }));
  router.get('/api/v10/operations/assets', async ({ res, url,context }) => json(res, 200, { assets: await monitoredTerritoryService.listAssets({ territoryId: url.searchParams.get('territoryId'), limit: url.searchParams.get('limit') },context.actor) }));
}
