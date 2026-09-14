import { json, noContent } from '../../http/responses.mjs';

function publicPayload(service){return{enabled:service.enabled,authenticated:false,actor:null,mode:service.enabled?'local_shadow':'public_read_only'};}
function directPayload(context,service){const actor=context?.actor,mode=actor?.authentication?.mode;if(actor?.authentication?.authenticated!==true)return null;if(mode==='operator_proxy_assertion'||(service.enabled!==true&&mode==='environment_bearer'))return{enabled:true,authenticated:true,sessionId:null,issuedAt:null,expiresAt:null,mode,actor};return null;}
export function registerSessionRoutes(router,{sessionService,controlService}){
  router.get('/api/v10/session',async({req,res,context})=>{const direct=directPayload(context,sessionService),session=sessionService.current(req,controlService);json(res,200,direct??(session?{enabled:true,authenticated:true,...session}:publicPayload(sessionService)));});
  router.post('/api/v10/session',async({req,res,context})=>{const direct=directPayload(context,sessionService);if(direct){json(res,200,direct);return;}sessionService.assertSameOrigin(req);sessionService.assertBootstrapCredential(req);const session=sessionService.ensure(req,res,controlService,{explicit:true});json(res,session?200:403,session?{enabled:true,authenticated:true,...session}:publicPayload(sessionService));});
  router.register('DELETE','/api/v10/session',async({req,res,context})=>{if(!directPayload(context,sessionService)){sessionService.assertSameOrigin(req);sessionService.signOut(req,res);}noContent(res);});
}
