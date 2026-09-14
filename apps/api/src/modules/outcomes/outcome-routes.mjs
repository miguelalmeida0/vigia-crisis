import { json } from '../../http/responses.mjs';
import { readJsonBody } from '../../http/body.mjs';
export function registerOutcomeRoutes(router, { outcomeService }) {
  router.get('/api/v2/outcomes', async ({ res, context }) => json(res, 200, outcomeService.snapshot(context.actor)));
  router.get('/api/v10/outcomes/production',async({res,context})=>json(res,200,outcomeService.snapshot(context.actor).production));
  router.post('/api/v10/outcomes/production/actions',async({req,res,context})=>json(res,201,await outcomeService.createProductionAction(context.actor,await readJsonBody(req))));
  router.post('/api/v10/outcomes/production/actions/:actionId/acknowledgements',async({req,res,params,context})=>json(res,201,await outcomeService.acknowledgeProductionAction(context.actor,params.actionId,await readJsonBody(req))));
  router.post('/api/v10/outcomes/production/actions/:actionId/expected-postcondition',async({req,res,params,context})=>json(res,201,await outcomeService.defineExpectedPostcondition(context.actor,params.actionId,await readJsonBody(req))));
  router.post('/api/v10/outcomes/production/actions/:actionId/observed-postconditions',async({req,res,params,context})=>json(res,201,await outcomeService.observePostcondition(context.actor,params.actionId,await readJsonBody(req))));
  router.post('/api/v10/outcomes/production/actions/:actionId/classification',async({req,res,params,context})=>json(res,201,await outcomeService.classifyProductionOutcome(context.actor,params.actionId,await readJsonBody(req))));
}
