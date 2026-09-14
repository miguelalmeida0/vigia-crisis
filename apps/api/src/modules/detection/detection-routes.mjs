import { json, problem } from '../../http/responses.mjs';
import { RequestGate } from '../../shared/request-gate.mjs';
import { visualizationClientKey } from '../../http/route-security-policy.mjs';

const benchmarkGate=new RequestGate({maxConcurrent:4,maxConcurrentPerClient:2,maxRequestsPerWindow:60});

export function registerDetectionRoutes(router, { detectionService }) {
  router.get('/api/v1/detection', async ({ res }) => {
    json(res, 200, await detectionService.snapshot({publicProjection:true}));
  });

  router.get('/api/v1/detection/:id', async ({ res, params }) => {
    const incident = await detectionService.find(params.id,{publicProjection:true});
    if (!incident) return problem(res, 404, 'incident_not_found', 'The requested public occurrence is not in the current snapshot.');
    json(res, 200, incident);
  });
  router.get('/api/v10/detection/benchmark',async({req,res,context})=>json(res,200,await benchmarkGate.run(visualizationClientKey(req,context),()=>detectionService.benchmark())));
}
