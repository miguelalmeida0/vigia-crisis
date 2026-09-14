import { json } from '../../http/responses.mjs';
import { assertGlobalIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';

export function registerAuditRoutes(router, { auditService }) {
  router.get('/api/v2/audit', async ({ res, url, context }) => {assertGlobalIncidentScope(context.actor);json(res, 200, { events: auditService.list(context.actor, { limit: url.searchParams.get('limit') }), chain: auditService.verifyChain() });});
}
