import { json } from '../../http/responses.mjs';
import { CANONICAL_OPERATOR_SCREENS,CanonicalOperatorApiService } from './canonical-operator-api-service.mjs';

export function registerCanonicalOperatorRoutes(router,services){
  const api=services.canonicalOperatorApiService??new CanonicalOperatorApiService({services,projectRoot:services.projectRoot??process.cwd()});
  services.canonicalOperatorApiService=api;
  services.crisisAutopilotCoordinator?.setProjectionRefresher?.(()=>api.reprojectAfterAutopilotMutation());
  services.crisisAutopilotCoordinator?.setProjectionInvalidator?.(()=>api.invalidate());
  services.incidentCommandService?.setPlanningProjectionResolver?.((incidentId,options)=>api.resolvePlanningProjection(incidentId,options));
  services.incidentCommandService?.setProjectionInvalidator?.(()=>api.invalidate());
  services.operationalIntelligenceService?.setAcceptedEventHandler?.((event)=>api.consumeOperationalEvent(event));
  const route=(path,screen,incident=false)=>router.get(path,async({res,params,context})=>json(res,200,await api.project(screen,{incidentId:incident?params.incidentId:null,actor:context.actor})));
  route('/api/v10/operator/command-overview',CANONICAL_OPERATOR_SCREENS.COMMAND_OVERVIEW);
  router.get('/api/v10/operator/map-context/:scope',async({res,params,context})=>json(res,200,await api.portfolioLocation(params.scope,{actor:context.actor})));
  route('/api/v10/operator/incidents',CANONICAL_OPERATOR_SCREENS.INCIDENTS);
  route('/api/v10/operator/incidents/:incidentId',CANONICAL_OPERATOR_SCREENS.INCIDENT_DETAIL,true);
  router.get('/api/v10/operator/incidents/:incidentId/location',async({res,params,context})=>json(res,200,await api.incidentLocation(params.incidentId,{actor:context.actor})));
  route('/api/v10/operator/incidents/:incidentId/intelligence',CANONICAL_OPERATOR_SCREENS.INTELLIGENCE_EVIDENCE,true);
  route('/api/v10/operator/incidents/:incidentId/evidence-debt',CANONICAL_OPERATOR_SCREENS.EVIDENCE_DEBT,true);
  route('/api/v10/operator/incidents/:incidentId/operations',CANONICAL_OPERATOR_SCREENS.OPERATIONS,true);
  route('/api/v10/operator/authority',CANONICAL_OPERATOR_SCREENS.AUTHORITY_TRUST);
  route('/api/v10/operator/control-plane',CANONICAL_OPERATOR_SCREENS.CONTROL_PLANE);
  route('/api/v10/operator/reports',CANONICAL_OPERATOR_SCREENS.REPORTS_ANALYTICS);
  route('/api/v10/operator/global-situational-awareness',CANONICAL_OPERATOR_SCREENS.GLOBAL_SITUATIONAL_AWARENESS);
}
