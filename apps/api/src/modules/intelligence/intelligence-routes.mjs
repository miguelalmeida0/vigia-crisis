import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';

export function registerIntelligenceRoutes(router,{intelligenceService}){
  router.get('/api/v10/intelligence/status',async({res})=>json(res,200,intelligenceService.status()));
  router.get('/api/v10/intelligence/inbox',async({res,context,url})=>json(res,200,await intelligenceService.inbox(context.actor,{limit:url.searchParams.get('limit')})));
  router.get('/api/v10/intelligence/incidents/:incidentId',async({res,context,params})=>json(res,200,await intelligenceService.incident(context.actor,params.incidentId)));
  router.get('/api/v10/intelligence/incidents/:incidentId/history',async({res,context,params,url})=>json(res,200,await intelligenceService.history(context.actor,params.incidentId,{cursor:url.searchParams.get('cursor'),limit:url.searchParams.get('limit')})));
  router.post('/api/v10/intelligence/incidents/:incidentId/decisions',async({req,res,context,params})=>json(res,201,await intelligenceService.decide(context.actor,params.incidentId,await readJsonBody(req))));
  router.get('/api/v10/intelligence/replay/:caseId',async({res,context,params,url})=>json(res,200,await intelligenceService.replay(context.actor,params.caseId,{asOf:url.searchParams.get('asOf')})));
  router.get('/api/v10/intelligence/prevent/:findingId',async({res,context,params})=>json(res,200,intelligenceService.prevent(context.actor,params.findingId)));
}
