import { assertCan, assertIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';
import { json } from '../../http/responses.mjs';
import { queryDecisionObjectSet } from './query-service.mjs';

function authorize(context, incidentId = null) {
  if (context.actor?.authentication?.authenticated !== true) throw Object.assign(new Error('forbidden'), { statusCode: 403 });
  assertCan(context.actor, 'read:incident_command');
  if (incidentId) assertIncidentScope(context.actor, incidentId);
  else if (!context.actor.incidentScopes?.includes('*')) throw Object.assign(new Error('global_intelligence_scope_forbidden'), { statusCode: 403 });
}

export function registerDecisionFoundryRoutes(router, { operationalIntelligenceQueryService } = {}) {
  router.get('/api/v10/intelligence/object-sets/:name', async ({ res, params, url, context }) => {
    const incidentId = url.searchParams.get('incidentId'); authorize(context, incidentId);
    const scopes = context.actor.incidentScopes?.includes('*') ? null : { allowedIncidentIds: context.actor.incidentScopes };
    json(res, 200, await queryDecisionObjectSet({ name: params.name, incidentId, knowledgeTime: url.searchParams.get('knowledgeTime'), limit: Number(url.searchParams.get('limit') ?? 100), cursor: url.searchParams.get('cursor'), consistencyToken: url.searchParams.get('consistencyToken'), rights: scopes }));
  });
  router.get('/api/v10/intelligence/incidents/:incidentId/snapshot', async ({ res, params, url, context }) => {
    authorize(context, params.incidentId); if (!operationalIntelligenceQueryService) throw Object.assign(new Error('operational_intelligence_query_unavailable'), { statusCode: 503 });
    const projection = url.searchParams.get('projectionVersion'); json(res, 200, await operationalIntelligenceQueryService.incidentSnapshot(params.incidentId, { knowledgeTime: url.searchParams.get('knowledgeTime'), projectionVersion: projection === null ? null : Number(projection), authority: { capabilities: context.actor.capabilities ?? [] } }));
  });
}
