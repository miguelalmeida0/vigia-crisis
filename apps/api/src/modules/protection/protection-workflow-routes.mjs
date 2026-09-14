import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';

export function registerProtectionWorkflowRoutes(router,services){
  const {protectionWorkflowService}=services;
  const base='/api/v10/incident-command/incidents/:incidentId/protection-workflows';
  // Canonical operator routes are registered after protection routes and attach
  // their projection service to the shared services object. Resolve it after
  // the mutation instead of capturing an undefined registration-time value.
  const mutate=async(operation)=>{const result=await operation();services.canonicalOperatorApiService?.invalidate?.();return result;};
  router.get(base,async({res,params,context})=>json(res,200,protectionWorkflowService.list(params.incidentId,context.actor)));
  router.post(base,async({req,res,params,context})=>{const input=await readJsonBody(req);return json(res,201,await mutate(()=>protectionWorkflowService.create(context.actor,params.incidentId,input)));});
  router.post(`${base}/:workflowId/transitions`,async({req,res,params,context})=>{const input=await readJsonBody(req);return json(res,200,await mutate(()=>protectionWorkflowService.transition(context.actor,params.incidentId,params.workflowId,input)));});
  router.post(`${base}/:workflowId/cap-draft`,async({req,res,params,context})=>json(res,200,protectionWorkflowService.capDraft(context.actor,params.incidentId,params.workflowId,await readJsonBody(req))));
  router.post(`${base}/:workflowId/cap-dispatch`,async({req,res,params,context})=>{const input=await readJsonBody(req);return json(res,200,await mutate(()=>protectionWorkflowService.dispatchCap(context.actor,params.incidentId,params.workflowId,input)));});
}
