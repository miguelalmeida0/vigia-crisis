import { json } from '../../http/responses.mjs';
import { publicDependencyProjection } from '../../shared/public-dependency-projection.mjs';

export function registerExposureRoutes(router, { exposureService }) {
  router.get('/api/v1/exposure', async ({ req,res, url }) => {
    const exposure = await exposureService.inspect({
      lon: url.searchParams.get('lon'),
      lat: url.searchParams.get('lat'),clientKey:req.socket?.remoteAddress
    });
    json(res, 200, publicDependencyProjection(exposure));
  });
}
