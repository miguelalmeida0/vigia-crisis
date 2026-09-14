import { json } from '../../http/responses.mjs';
import { assertGlobalIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';

export function registerControlRoutes(router, { controlService }) {
  router.get('/api/v2/control', async ({ res,context }) => {assertGlobalIncidentScope(context.actor);json(res, 200, controlService.snapshot());});
  router.get('/api/v2/actors/:id', async ({ res, params,context }) => {assertGlobalIncidentScope(context.actor);json(res, 200, controlService.actor(params.id));});
}
