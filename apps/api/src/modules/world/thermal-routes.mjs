import { json } from '../../http/responses.mjs';
import { visualizationClientKey } from '../../http/route-security-policy.mjs';

export function registerThermalRoutes(router, { thermalAdapter, worldService }) {
  router.get('/api/v1/thermal/metadata', async ({ req,res,context }) => {
    try {
      const metadata = await thermalAdapter.probe(visualizationClientKey(req,context));
      worldService.setSourceState('thermal', {
        state: 'current', fetchedAt: new Date().toISOString(), upstreamAt: metadata.upstreamAt, error: null
      });
      json(res, 200, {
        state: 'current', ...metadata,
        notice: 'Thermal pixels are independent context. A visible pixel does not by itself establish incident location or perimeter.'
      });
    } catch (error) {
      worldService.setSourceState('thermal', { state: 'unavailable', error: String(error.message ?? error) });
      json(res, 200, { state: 'unavailable', layers: [], error: String(error.message ?? error) });
    }
  });

  router.get('/api/v1/thermal/:z/:x/:y', async ({ req,res, params,context }) => {
    const tile = await thermalAdapter.tile(Number(params.z), Number(params.x), Number(params.y),visualizationClientKey(req,context));
    worldService.setSourceState('thermal', {
      state: tile.state, fetchedAt: tile.state === 'current' ? new Date().toISOString() : null, error: tile.error ?? null
    });
    res.writeHead(200, {
      'content-type': tile.contentType,
      'content-length': tile.body.length,
      'cache-control': tile.state === 'current' ? 'public, max-age=120' : 'no-store',
      'x-vigia-source-state': tile.state,
      'x-content-type-options': 'nosniff'
    });
    res.end(tile.body);
  });
}
