import { problem } from '../../http/responses.mjs';
import { visualizationClientKey } from '../../http/route-security-policy.mjs';

export function registerBasemapRoutes(router, { basemapService }) {
  router.get('/api/v1/basemap/:kind/:z/:x/:y', async ({ req,res, params,context }) => {
    try {
      const tile = await basemapService.tile({...params,clientKey:visualizationClientKey(req,context)});
      res.writeHead(200, {
        'content-type': tile.contentType,
        'content-length': tile.buffer.length,
        'cache-control': tile.state === 'current' ? 'public, max-age=43200' : 'public, max-age=60',
        'x-vigia-source-state': tile.state,
        'x-vigia-provider':tile.provider,
        'x-vigia-acquired-at':tile.acquiredAt,
        'x-vigia-last-good-at':tile.lastGoodAt,
        'x-vigia-provenance':tile.provenance,
        'x-content-type-options': 'nosniff'
      });
      res.end(tile.buffer);
    } catch (error) {
      problem(res, Number(error.statusCode)||400, 'invalid_basemap_request', String(error.message ?? error));
    }
  });
}
