import {operationalSourceFamilies} from '../mission/operational-source-families.mjs';
import {json} from '../../http/responses.mjs';
import {readJsonBody} from '../../http/body.mjs';
import {assertCan} from '../../../../../packages/domain/src/authorization.mjs';

export function registerSituationRoutes(router,{situationService:service,situationAsk:ask,situationDocuments:docs}){
  const base='/api/v10/operator/incidents/:incidentId/situation';
  router.get(base+'/picture',async({res,context,params,url})=>{
    ask.authorize(context.actor,params.incidentId,url.searchParams.get('at'));
    const options=Object.fromEntries(url.searchParams);
    if(Object.entries(options).some(([k,v])=>!['at','road','entityId','communityId','category','limited','filter','failures'].includes(k)||v.length>(k==='failures'?2400:180)))throw Object.assign(new Error('picture_selection_invalid'),{statusCode:400});
    if(options.category&&!['emergency_hospital','fire_response','designated_reception'].includes(options.category))throw Object.assign(new Error('coverage_category_invalid'),{statusCode:400});
    try{return json(res,200,await service.picture(params.incidentId,options));}catch(error){if(error instanceof SyntaxError||['scenario_assumption_invalid','road_not_in_retained_routes','scenario_facility_not_applicable'].includes(error.message))error.statusCode=400;throw error;}
  });
  router.get(base+'/stress',async({res,context,params,url})=>{ask.authorize(context.actor,params.incidentId,url.searchParams.get('at'));return json(res,200,await service.stress(params.incidentId,url.searchParams.get('at')));});
  router.get(base,async({res,context,params,url})=>{ask.authorize(context.actor,params.incidentId,url.searchParams.get('at'));return json(res,200,await service.snapshot(params.incidentId,url.searchParams.get('at')));});
  router.get(base+'/times',async({res,context,params})=>{const id=ask.authorize(context.actor,params.incidentId,'history');return json(res,200,{times:await service.store.times(id)});});
  router.get(base+'/compare',async({res,context,params,url})=>{const id=ask.authorize(context.actor,params.incidentId,'history');const from=url.searchParams.get('from'),to=url.searchParams.get('to');if(!from||!to||Date.parse(from)>Date.parse(to))throw Object.assign(new Error('ordered_comparison_times_required'),{statusCode:400});return json(res,200,await service.compare(id,from,to));});
  router.get(base+'/briefing',async({res,context,params,url})=>{ask.authorize(context.actor,params.incidentId,url.searchParams.get('at'));return json(res,200,await service.briefing(params.incidentId,url.searchParams.get('at')));});
  router.get(base+'/ask',async({res,context,params,url})=>json(res,200,await ask.answer(context.actor,{incidentId:params.incidentId,question:url.searchParams.get('question'),asOf:url.searchParams.get('at'),entityId:url.searchParams.get('entityId')})));
  router.get(base+'/tool/:name',async({res,context,params,url})=>json(res,200,await ask.tool(context.actor,params.name,{...Object.fromEntries(url.searchParams),incidentId:params.incidentId})));
  router.get(base+'/scenario',async({res,context,params,url})=>{ask.authorize(context.actor,params.incidentId,url.searchParams.get('at'));let assumptions={kind:url.searchParams.get('kind'),entityId:url.searchParams.get('entityId')};if(url.searchParams.has('failures')){const raw=url.searchParams.get('failures');if(raw.length>2400)throw Object.assign(new Error('scenario_assumption_invalid'),{statusCode:400});try{assumptions=JSON.parse(raw);}catch{throw Object.assign(new Error('scenario_assumption_invalid'),{statusCode:400});}}return json(res,200,await service.simulate(params.incidentId,assumptions,url.searchParams.get('at')));});
  router.get(base+'/support',async({res,context,params,url})=>{ask.authorize(context.actor,params.incidentId,url.searchParams.get('at'));return json(res,200,await service.support(params.incidentId,url.searchParams.get('at')));});
  router.get('/api/v10/operator/situation-document-sources',async({res,context})=>json(res,200,{sources:await docs.sources(context.actor)}));
  router.post(base+'/documents',async({req,res,context,params})=>json(res,201,await docs.upload(context.actor,{...await readJsonBody(req,{limitBytes:7100000}),incidentId:params.incidentId})));
  router.post(base+'/documents/:documentId/review',async({req,res,context,params})=>json(res,201,await docs.review(context.actor,{...await readJsonBody(req),...params})));
  router.get('/api/v10/operator/situation-quality',async({res,context})=>{assertCan(context.actor,'read:audit');return json(res,200,{storage:await service.store.metrics(),sourceFamilies:operationalSourceFamilies({knowledge:service.knowledge,roadState:service.roadStateService,at:service.clock().toISOString()}),history:{retentionDays:30,continuityIntervalMinutes:30,lastRetention:service.retention??null},roadSource:{status:service.roadStateService?.state.status??null,coverage:service.roadStateService?.context().roadCoverage??null,retainedObservations:service.roadStateService?.state.snapshots[0]?.observations.length??0},facilitySources:[...(service.knowledge?.sourceCache?.values()??[])].map(s=>({provider:s.provider,url:s.url,family:s.family??s.adapter,status:s.status,publishedAt:s.publishedAt??s.sourceUpdatedAt??null,lastFetch:s.lastFetch,nextFetch:s.nextFetch})),consequences:service.counters,ask:ask.metrics,model:await service.knowledge?.model.health()});});
}
