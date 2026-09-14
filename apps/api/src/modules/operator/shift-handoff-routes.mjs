import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';

export function registerShiftHandoffRoutes(router,{shiftHandoffService}){
  router.get('/api/v10/operator/handoffs',async({res,context})=>json(res,200,shiftHandoffService.list(context.actor)));
  router.post('/api/v10/operator/handoffs',async({req,res,context})=>json(res,201,await shiftHandoffService.create(context.actor,await readJsonBody(req))));
  router.post('/api/v10/operator/handoffs/:handoffId/acknowledge',async({req,res,params,context})=>json(res,200,await shiftHandoffService.acknowledge(context.actor,params.handoffId,await readJsonBody(req))));
}
