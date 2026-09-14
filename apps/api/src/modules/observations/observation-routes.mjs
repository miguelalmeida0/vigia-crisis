import { readJsonBody } from '../../http/body.mjs';
import { json, problem } from '../../http/responses.mjs';
import { RequestGate, SingleFlight } from '../../shared/request-gate.mjs';
import { hasGlobalIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';
import { visualizationClientKey } from '../../http/route-security-policy.mjs';

const observationGate=new RequestGate({maxConcurrent:4,maxConcurrentPerClient:2,maxRequestsPerWindow:60});
const observationSingleFlight=new SingleFlight({maxKeys:160});
const workKey=(kind,input)=>`${kind}:${JSON.stringify(input)}`;
const runObservationWork=(req,context,kind,input,work)=>observationGate.run(visualizationClientKey(req,context),()=>observationSingleFlight.run(workKey(kind,input),work));
const PRIVATE_SCENE_FIELDS=new Set(['previewUrl','visualCogUrl','redCogUrl','nirCogUrl','swir16CogUrl','swir22CogUrl','sclCogUrl','rasterAssetHosts']);
function publicScene(scene){if(!scene||typeof scene!=='object')return scene;const output=Object.fromEntries(Object.entries(scene).filter(([key])=>!PRIVATE_SCENE_FIELDS.has(key)));if(output.imageUrl&&!/^\/api\/v2\/observations\/(?:proxy\?handle=[A-Za-z0-9_-]{32}|frame\/\d{4}-\d{2}-\d{2}\?)/.test(output.imageUrl))delete output.imageUrl;return output;}
export function publicObservationProjection(value){if(!value||typeof value!=='object')return value;const output={...value};for(const key of ['primary','comparable'])output[key]=publicScene(output[key]);if(Array.isArray(output.timeline))output.timeline=output.timeline.map(publicScene);if(output.observations){output.observations={current:publicScene(output.observations.current),comparison:publicScene(output.observations.comparison)};}return output;}

function send(res, frame) {
  res.writeHead(200, { 'content-type': frame.contentType, 'content-length': frame.buffer.length, 'cache-control': 'public, max-age=21600', 'x-vigia-source-state': frame.sourceState, 'x-content-type-options': 'nosniff' }); res.end(frame.buffer);
}
function coordinateFrom(value) {
  const coordinate = Array.isArray(value) ? value.map(Number) : [Number(value?.lon), Number(value?.lat)];
  if (coordinate.length !== 2 || !coordinate.every(Number.isFinite) || Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90) throw new Error('invalid_coordinate');
  return coordinate;
}
function clientAbort(req,res){const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort(new Error('client_disconnected'));};req.once?.('aborted',abort);res.once?.('close',abort);return controller.signal;}
export function registerObservationRoutes(router, { observationFabricService, currentImageryService, geospatialAnalysisService, preventionFindingService }) {
  router.get('/api/v2/observations/resolve', async ({ req,res, url,context }) => {
    const coordinate = coordinateFrom({ lon: url.searchParams.get('lon'), lat: url.searchParams.get('lat') });
    const request={
      coordinate,
      radiusKm: Number(url.searchParams.get('radiusKm') ?? 9),
      primaryId:url.searchParams.get('primaryId') || null,
      comparableId:url.searchParams.get('comparableId') || null
    };
    const retained=hasGlobalIncidentScope(context.actor)?preventionFindingService?.observationSnapshot(request,context.actor):null;json(res,200,publicObservationProjection(retained??await runObservationWork(req,context,'resolve',request,()=>observationFabricService.resolve(request))));
  });
  router.post('/api/v10/observations/change-screening', async ({ req, res,context }) => {
    const body = await readJsonBody(req); const coordinate = coordinateFrom(body.coordinate);
    const request={ coordinate, radiusKm: Number(body.radiusKm ?? 9), primaryId: body.primaryId ?? null, comparableId: body.comparableId ?? null };json(res, 200, publicObservationProjection(await runObservationWork(req,context,'screen',request,()=>geospatialAnalysisService.screenChange(request))));
  });
  router.get('/api/v10/observations/change-screening', async ({ req,res, url,context }) => {
    const coordinate = coordinateFrom({ lon:url.searchParams.get('lon'), lat:url.searchParams.get('lat') });
    const request={
      coordinate,
      radiusKm:Number(url.searchParams.get('radiusKm') ?? 9),
      primaryId:url.searchParams.get('primaryId') || null,
      comparableId:url.searchParams.get('comparableId') || null
    };
    const retained=hasGlobalIncidentScope(context.actor)?preventionFindingService?.screeningSnapshot(request,context.actor):null;json(res,200,publicObservationProjection(retained??await runObservationWork(req,context,'screen',request,()=>geospatialAnalysisService.screenChange(request))));
  });
  router.get('/api/v2/observations/frame/:date', async ({ req,res, url, params,context }) => { try { send(res, await currentImageryService.frame({ date: params.date, bbox: url.searchParams.get('bbox'),clientKey:visualizationClientKey(req,context),signal:clientAbort(req,res) })); } catch (error) { if(!res.writableEnded)problem(res, Number(error.statusCode)||503, 'observation_frame_unavailable', String(error.message ?? error)); } });
  router.get('/api/v2/observations/proxy', async ({ req,res, url,context }) => { try { send(res, await currentImageryService.proxy(url.searchParams.get('handle') ?? '',{clientKey:visualizationClientKey(req,context),signal:clientAbort(req,res)})); } catch (error) { if(!res.writableEnded)problem(res, Number(error.statusCode)||503, 'observation_proxy_unavailable', String(error.message ?? error)); } });
}
