import { json, problem } from '../../http/responses.mjs';
import { visualizationClientKey } from '../../http/route-security-policy.mjs';

function sendFrame(res, frame, cacheControl = 'public, max-age=21600') {
  res.writeHead(200, {
    'content-type': frame.contentType,
    'content-length': frame.buffer.length,
    'cache-control': cacheControl,
    'x-vigia-source-state': frame.sourceState,
    'x-content-type-options': 'nosniff'
  });
  res.end(frame.buffer);
}

export function registerImageryRoutes(router, { imageryService }) {
  router.get('/api/v1/imagery/pair', async ({ res, url }) => {
    const pair = imageryService.observationPair({
      lon: url.searchParams.get('lon'),
      lat: url.searchParams.get('lat'),
      radiusKm: url.searchParams.get('radiusKm')
    });
    json(res, 200, pair);
  });

  router.get('/api/v1/imagery/national', async ({ req,res, url,context }) => {
    const frame = await imageryService.nationalFrame({ year: url.searchParams.get('year') ?? '2025',clientKey:visualizationClientKey(req,context) });
    sendFrame(res, frame, 'public, max-age=86400');
  });

  router.get('/api/v1/imagery/frame/:date', async ({ req,res, url, params,context }) => {
    try {
      const frame = await imageryService.frame({ date: params.date, bbox: url.searchParams.get('bbox'),clientKey:visualizationClientKey(req,context) });
      sendFrame(res, frame);
    } catch (error) {
      problem(res, 503, 'imagery_unavailable', String(error.message ?? error));
    }
  });
}
