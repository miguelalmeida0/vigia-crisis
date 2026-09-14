import { json } from '../../http/responses.mjs';
import { boundedDecisionResponse } from './decision-intelligence-projection.mjs';

export function registerDecisionIntelligenceRoutes(router,services){
  router.get('/api/v10/operator/intelligence-query',async({res,context,url})=>{
    const query=url.searchParams;
    return json(res,200,boundedDecisionResponse(await services.canonicalOperatorApiService.decisionQuery(context.actor,{question:query.get('question'),incidentId:query.get('incidentId'),asOf:query.get('asOf'),history:query.get('mode')==='history'})));
  });
  router.get('/api/v10/operator/intelligence-counterfactual',async({res,context,url})=>{
    const query=url.searchParams;
    return json(res,200,boundedDecisionResponse(await services.canonicalOperatorApiService.decisionQuery(context.actor,{incidentId:query.get('incidentId'),assumption:{kind:query.get('kind'),entityId:query.get('entityId'),minutes:Number(query.get('minutes'))}})));
  });
}
