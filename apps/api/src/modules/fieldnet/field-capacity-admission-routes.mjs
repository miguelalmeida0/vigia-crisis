import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';
import { assertCan, assertGlobalIncidentScope, assertIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';

export function registerFieldCapacityAdmissionRoutes(router,{fieldCapacityAdmissionService}){
  router.get('/api/v10/fieldnet/capacity-admissions/status',async({res,context})=>{
    assertCan(context.actor,'read:fieldnet');
    assertGlobalIncidentScope(context.actor);
    json(res,200,fieldCapacityAdmissionService.status());
  });
  router.get('/api/v10/fieldnet/capacity-admissions/:incidentId/:observationId',async({res,params,context})=>{
    assertCan(context.actor,'read:fieldnet');
    assertIncidentScope(context.actor,params.incidentId);
    const admission=fieldCapacityAdmissionService.admissionFor(params.incidentId,params.observationId);
    json(res,admission?200:404,admission??{error:'field_capacity_admission_not_found'});
  });
  router.post('/api/v10/fieldnet/capacity-admissions',async({req,res,context})=>{
    const input=await readJsonBody(req,{limitBytes:32_000,timeoutMs:5_000});
    const result=await fieldCapacityAdmissionService.admit(context.actor,input);
    json(res,result.duplicate?200:201,result);
  });
  router.post('/api/v10/fieldnet/capacity-admissions/revocations',async({req,res,context})=>{
    const input=await readJsonBody(req,{limitBytes:32_000,timeoutMs:5_000});
    const result=await fieldCapacityAdmissionService.revoke(context.actor,input);
    json(res,result.duplicate?200:201,result);
  });
}
