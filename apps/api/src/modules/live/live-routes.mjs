import { json, problem } from '../../http/responses.mjs';
import { PORTUGAL_BBOX } from './live-thermal-adapter.mjs';
import { publicDependencyProjection } from '../../shared/public-dependency-projection.mjs';

function parseBbox(value) {
  if (!value) return PORTUGAL_BBOX;
  const parts = String(value).split(',').map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : PORTUGAL_BBOX;
}

export function registerLiveRoutes(router, { liveFireService, liveThermalAdapter }) {
  router.get('/api/v4/live', async ({ res }) => json(res, 200, publicDependencyProjection(await liveFireService.snapshot())));

  router.get('/api/v4/live/thermal/metadata', async ({ res }) => {
    try { json(res, 200, publicDependencyProjection(await liveThermalAdapter.metadata())); }
    catch { json(res, 200, { state: 'unavailable', providers: [], errorPresent: true }); }
  });

  router.get('/api/v4/live/thermal/overlay', async ({ req,res, url }) => {
    try {
      const image = await liveThermalAdapter.overlay({
        providerId: url.searchParams.get('provider') ?? 'auto',
        time: url.searchParams.get('time') ?? 'latest',
        bbox: parseBbox(url.searchParams.get('bbox')),
        width: Number(url.searchParams.get('width') ?? 980),
        height: Number(url.searchParams.get('height') ?? 1280),clientKey:req.socket?.remoteAddress
      });
      res.writeHead(200, {
        'content-type': image.contentType,
        'content-length': image.body.length,
        'cache-control': 'public, max-age=60',
        'x-vigia-provider': image.providerId,
        'x-vigia-acquired-at': image.acquiredAt ?? '',
        'x-content-type-options': 'nosniff'
      });
      res.end(image.body);
    } catch {
      problem(res, 503, 'live_thermal_unavailable', 'Thermal overlay is temporarily unavailable.');
    }
  });
}
