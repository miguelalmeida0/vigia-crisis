import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';

export function registerHumanAttentionRoutes(router,{humanAttentionService,canonicalOperatorApiService}){
  router.get('/api/v10/operator/attention',async({res,context})=>json(res,200,await humanAttentionService.snapshot(context.actor)));
  router.post('/api/v10/operator/attention/:attentionId/acknowledge',async({req,res,params,context})=>{const result=await humanAttentionService.acknowledge(context.actor,params.attentionId,await readJsonBody(req));canonicalOperatorApiService?.invalidate?.();return json(res,200,result);});
  router.post('/api/v10/operator/attention/:attentionId/actions',async({req,res,params,context})=>{const result=await humanAttentionService.action(context.actor,params.attentionId,await readJsonBody(req));canonicalOperatorApiService?.invalidate?.();return json(res,200,result);});
}
