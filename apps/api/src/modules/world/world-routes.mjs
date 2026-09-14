import { json } from '../../http/responses.mjs';
import { assertCan } from '../../../../../packages/domain/src/authorization.mjs';
import { publicDependencyProjection } from '../../shared/public-dependency-projection.mjs';

function assertOperatorMutation(req,actor){
  assertCan(actor,'refresh:sources');
  if(['local_shadow_session','operator_proxy_assertion'].includes(actor?.authentication?.mode)&&req.headers['x-vigia-operator-intent']!=='operator-console')throw Object.assign(new Error('operator_intent_required'),{statusCode:403});
}

export function registerWorldRoutes(router, { worldService }) {
  router.get('/api/v1/world', async ({ res }) => json(res, 200, publicDependencyProjection(await worldService.snapshot())));
  router.post('/api/v1/world/refresh', async ({ req, res, context }) => {
    assertOperatorMutation(req,context.actor);
    const result = await worldService.refresh({ force: true });
    json(res, 200, { changed: result.changed, generatedAt: result.snapshot.meta.generatedAt });
  });
}
