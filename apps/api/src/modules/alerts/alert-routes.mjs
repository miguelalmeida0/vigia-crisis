import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';
import { assertGlobalIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';

export function registerAlertRoutes(router, { alertService, incidentOperationsService }) {
  router.get('/api/v9/alerts', async ({ res,context }) => json(res, 200, await alertService.list({},context.actor)));
  router.get('/api/v10/alerts', async ({ res, url,context }) => json(res, 200, await alertService.list({ eventId: url.searchParams.get('eventId'), states: url.searchParams.getAll('state'), limit: url.searchParams.get('limit') },context.actor)));
  router.get('/api/v10/alerts/:id', async ({ res, params,context }) => json(res, 200, await alertService.get(params.id,context.actor)));
  router.get('/api/v10/alerts/:id/audit', async ({ res, params,context }) => json(res, 200, await alertService.audit(params.id,context.actor)));
  router.get('/api/v10/alerts/:id/timeline', async ({ res, params,context }) => {const alert=await alertService.get(params.id,context.actor);json(res, 200, await incidentOperationsService.alertTimeline(params.id,context.actor,alert.eventId));});
  router.get('/api/v10/notifications/in-app',async({res,url,context})=>json(res,200,await alertService.notificationFeed('IN_APP',context.actor,{since:url.searchParams.get('since'),limit:url.searchParams.get('limit')})));
  router.get('/api/v10/notifications/browser',async({res,url,context})=>json(res,200,await alertService.notificationFeed('BROWSER_NOTIFICATION',context.actor,{since:url.searchParams.get('since'),limit:url.searchParams.get('limit')})));
  router.post('/api/v9/alerts/:id/acknowledge', async ({ res, params, context }) => json(res, 200, await alertService.acknowledge(params.id, context.actor)));
  router.post('/api/v10/alerts/:id/acknowledge', async ({ req, res, params, context }) => { const body = await readJsonBody(req); json(res, 200, await alertService.acknowledge(params.id, context.actor, body.note)); });
  router.post('/api/v10/alerts/:id/assign', async ({ req, res, params, context }) => { const body = await readJsonBody(req); json(res, 200, await alertService.assign(params.id, context.actor, body.ownerActorId, body.note)); });
  router.post('/api/v10/alerts/:id/reassign', async ({ req, res, params, context }) => { const body = await readJsonBody(req); json(res, 200, await alertService.reassign(params.id, context.actor, body.ownerActorId, body.note)); });
  router.post('/api/v10/alerts/:id/resolve', async ({ req, res, params, context }) => { const body = await readJsonBody(req); json(res, 200, await alertService.resolve(params.id, context.actor, body.resolutionCode, body.note)); });
  router.post('/api/v10/alerts/:id/suppress', async ({ req, res, params, context }) => { const body = await readJsonBody(req); json(res, 200, await alertService.suppress(params.id, context.actor, body.suppressUntil, body.note)); });
  router.get('/api/v10/operations/status', async ({ res,context }) => {assertGlobalIncidentScope(context.actor);const status=await incidentOperationsService.status();json(res,status.overallStatus==='READY'?200:503,status);});
  router.get('/api/v10/operations/metrics', async ({ res,context }) => {assertGlobalIncidentScope(context.actor);json(res, 200, await alertService.metrics());});
  router.get('/api/v10/operations/incidents/:id', async ({ res, params, context }) => json(res, 200, await incidentOperationsService.incident(params.id, context.actor)));
  router.get('/api/v10/operations/opportunities',async({res,url,context})=>json(res,200,await incidentOperationsService.opportunities({eventId:url.searchParams.get('eventId'),limit:url.searchParams.get('limit')},context.actor)));
  router.get('/api/v10/operations/opportunity-results',async({res,url,context})=>json(res,200,await incidentOperationsService.opportunityResults({eventId:url.searchParams.get('eventId'),limit:url.searchParams.get('limit')},context.actor)));
  router.get('/api/v10/operations/roster',async({res,url,context})=>json(res,200,await incidentOperationsService.roster({territoryId:url.searchParams.get('territoryId')},context.actor)));
  router.get('/api/v10/operations/alert-status',async({res,url,context})=>json(res,200,await incidentOperationsService.statusProjection({eventId:url.searchParams.get('eventId'),limit:url.searchParams.get('limit')},context.actor)));
  router.get('/api/v10/operations/evidence-closure-plans',async({res,url,context})=>json(res,200,await incidentOperationsService.closurePlans({subjectType:url.searchParams.get('subjectType'),subjectId:url.searchParams.get('subjectId'),resolutionState:url.searchParams.get('resolutionState'),limit:url.searchParams.get('limit')},context.actor)));
  router.get('/api/v10/operations/coverage/:subjectId',async({res,params,context})=>json(res,200,await incidentOperationsService.coverage(params.subjectId,context.actor)));
  router.get('/api/v10/operations/decision-ledger',async({res,url,context})=>json(res,200,await incidentOperationsService.decisionLedger({subjectId:url.searchParams.get('subjectId'),limit:url.searchParams.get('limit')},context.actor)));
  router.get('/api/v10/operations/fire-truth-states',async({res,url,context})=>json(res,200,await incidentOperationsService.truthStates({eventId:url.searchParams.get('eventId'),limit:url.searchParams.get('limit')},context.actor)));
  router.get('/api/v10/operations/evidence-races',async({res,url,context})=>json(res,200,await incidentOperationsService.evidenceRaces({eventId:url.searchParams.get('eventId'),state:url.searchParams.get('state'),limit:url.searchParams.get('limit')},context.actor)));
  router.get('/api/v10/operations/latency',async({res,url,context})=>json(res,200,await incidentOperationsService.operationalLatency({eventId:url.searchParams.get('eventId')},context.actor)));
  router.post('/api/v10/operations/evidence-closure/:id/review',async({req,res,params,context})=>{const body=await readJsonBody(req);json(res,200,await incidentOperationsService.applyPreventionReview(params.id,body,context.actor));});
}
