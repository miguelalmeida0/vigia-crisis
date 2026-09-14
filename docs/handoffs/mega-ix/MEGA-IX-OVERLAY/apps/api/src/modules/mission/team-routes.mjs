import {json} from '../../http/responses.mjs';
import {readJsonBody} from '../../http/body.mjs';
import {teamSynchronizer} from './team-central-link.mjs';
export function registerTeamRoutes(router,{teamService:service}) {
  const base='/api/v10/team';
  router.get(base+'/incidents/:incidentId/groups',async({res,context,params})=>json(res,200,service.groups(context.actor,params.incidentId)));
  router.post(base+'/devices',async({req,res,context})=>json(res,201,await service.enroll(context.actor,await readJsonBody(req))));
  router.post(base+'/groups',async({req,res,context})=>json(res,201,await service.createGroup(context.actor,await readJsonBody(req))));
  router.get(base+'/groups/:groupId',async({res,context,params})=>json(res,200,await service.snapshot(context.actor,params.groupId)));
  router.post(base+'/groups/:groupId/revoke',async({req,res,context,params})=>json(res,200,await service.revoke(context.actor,params.groupId,await readJsonBody(req))));
  router.post(base+'/envelopes',async({req,res,context})=>{const body=await readJsonBody(req,{limitBytes:1550000});return json(res,200,await service.accept(context.actor,body.envelope,body.via??[]));});
  router.get(base+'/groups/:groupId/sync',async({req,res,context,params})=>{const g=service.group(context.actor,params.groupId);service.authorize(context.actor,g.incidentId,{write:true});const after=Number(new URL(req.url,'http://local').searchParams.get('after')??0);if(!Number.isSafeInteger(after)||after<0)return json(res,400,{error:'Invalid sync cursor.'});const page=service.store.page('envelope',g.id,after);return json(res,200,{nextCursor:page.nextCursor,hasMore:page.hasMore,envelopes:page.records.map(r=>({envelope:r.envelope,via:r.relayedBy??[]}))});});
  router.post(base+'/groups/:groupId/sync',async({res,context,params})=>{const g=service.group(context.actor,params.groupId);service.authorize(context.actor,g.incidentId,{write:true});return json(res,200,await teamSynchronizer(service,context.actor,g.id).sync());});
}
