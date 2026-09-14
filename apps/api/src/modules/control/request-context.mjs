import { timingSafeEqual } from 'node:crypto';
import { capabilitiesFor } from '../../../../../packages/domain/src/authorization.mjs';

function publicActor() { return { id:'public-readonly',name:'Public read-only',title:'Unauthenticated territory view',role:'public_viewer',capabilities:['read:territory'],authentication: { authenticated: false, mode: 'public_read_only' } }; }
function bearer(req) { const value=String(req?.headers?.authorization??'');return value.startsWith('Bearer ')?value.slice(7):''; }
function equalSecret(left,right){const a=Buffer.from(String(left??'')),b=Buffer.from(String(right??''));return a.length>0&&a.length===b.length&&timingSafeEqual(a,b);}
function loopback(req){const address=String(req?.socket?.remoteAddress??'').replace(/^::ffff:/,''),host=String(req?.headers?.host??'');return(address==='127.0.0.1'||address==='::1')&&/^(?:(?:127\.0\.0\.1|localhost)(?::\d+)?|\[::1\](?::\d+)?)$/.test(host);}
function configuredActor(controlService,config,authentication){
  const actorId=String(config.operatorActorId??'vigia-operator'),stored=controlService?.actor?.(actorId),role=stored?.role??String(config.operatorActorRole??'supervisor');
  return{...(stored??{}),id:actorId,name:stored?.name??String(config.operatorActorName??'VIGIA operator'),title:stored?.title??String(config.operatorActorTitle??'Authenticated command operator'),role,qualifications:stored?.qualifications??config.operatorActorQualifications??[],capabilities:capabilitiesFor(role),incidentScopes:stored?.incidentScopes??config.operatorIncidentScopes??[],authentication};
}

export function resolveRequestActor(req, controlService, config = {}, sessionService = null) {
  const sessionActor=sessionService?.current?.(req,controlService)?.actor;
  if(sessionActor)return sessionActor;
  if(req?.vigiaOperatorProxyAssertion)return configuredActor(controlService,config,{authenticated:true,mode:'operator_proxy_assertion',credentialSource:'method_path_body_hmac',keyId:req.vigiaOperatorProxyAssertion.keyId,issuedAt:req.vigiaOperatorProxyAssertion.issuedAt});
  const configured=String(config.operatorBearerToken??'');const presented=bearer(req);
  if(config.runtimeProfile!=='local_shadow'||!loopback(req)||!configured||!equalSecret(presented,configured))return publicActor();
  return configuredActor(controlService,config,{authenticated:true,mode:'environment_bearer',credentialSource:'loopback_authorization_header'});
}

export function mutationAllowed(req, actor) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(String(req.method).toUpperCase())) return true;
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/v10/session') return true;
  if (/\/api\/v(?:8|9|10)\/sensors\/observations$/.test(pathname)) return true;
  if (/\/api\/v10\/events\/[^/]+\/ui-first-seen$/.test(pathname)) return true;
  return actor?.authentication?.authenticated === true;
}
