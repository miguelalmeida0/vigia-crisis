import { readJsonBody } from '../../http/body.mjs';
import { json, problem } from '../../http/responses.mjs';
import { preventionConsensusFor } from '../validation/measurement-debt-routes.mjs';

export function registerPreventionFindingRoutes(router,{preventionFindingService}){
  router.get('/api/v10/prevention/findings',async({res,context})=>json(res,200,preventionFindingService.snapshot(context.actor)));
  router.get('/api/v10/prevention/reviews/export',async({res,context})=>json(res,200,preventionFindingService.exportExpertReviewPack(context.actor),{'content-disposition':'attachment; filename="vigia-prevent-expert-review-pack.json"'}));
  router.post('/api/v10/prevention/reviews/import',async({req,res,context})=>json(res,201,await preventionFindingService.importExpertReviews(context.actor,await readJsonBody(req))));
  router.get('/api/v10/prevention/findings/:id',async({res,params,context})=>{const item=preventionFindingService.find(params.id,context.actor);if(!item)return problem(res,404,'prevention_finding_not_found','Prevention finding not found.');json(res,200,{...item,consensusTopology:await preventionConsensusFor(params.id)});});
  router.post('/api/v10/prevention/findings/:id/reviews',async({req,res,params,context})=>json(res,201,await preventionFindingService.review(context.actor,params.id,await readJsonBody(req))));
  router.post('/api/v10/prevention/missions/:id/transitions',async({req,res,params,context})=>json(res,200,await preventionFindingService.transitionMission(context.actor,params.id,await readJsonBody(req))));
  router.post('/api/v10/prevention/fuel-continuity/run',async({req,res,context})=>json(res,201,await preventionFindingService.runFuelContinuity(context.actor,await readJsonBody(req))));
}
