import { renderCommandOverview } from './commandOverview.js?v=3.0.0';
import { renderIncidents } from './incidents.js?v=3.0.0';
import { renderIncidentDetail } from './incidentDetail.js?v=3.1.0';
import { renderIntelligenceEvidence } from './intelligenceEvidence.js?v=3.1.0';
import { renderOperations } from './operations.js?v=3.1.0';
import { renderReportsAnalytics } from './reportsAnalytics.js?v=3.1.0';
import { renderGlobalAwareness } from './globalAwareness.js?v=3.0.0';
import { renderBootRoute } from '../bootSkeleton.js?v=3.2.0';
import { integratedRoutes, renderApprovedRoute } from '../approved/index.js';

const renderers = {
  'command-overview':renderCommandOverview,
  incidents:renderIncidents,
  'incident-detail':renderIncidentDetail,
  intelligence:renderIntelligenceEvidence,
  operations:renderOperations,
  'reports-analytics':renderReportsAnalytics,
  'global-awareness':renderGlobalAwareness
};
const globalProjection={"command-overview":'commandOverview',incidents:'incidents','reports-analytics':'reports','global-awareness':'globalAwareness'};

export function renderRoute(route, state) {
  if(integratedRoutes.has(route))return renderApprovedRoute(route,state);
  const key=globalProjection[route],incident=state?.selectedIncidentId,incidentKey=route==='incident-detail'?'detail':route;
  const available=key?state?.runtime?.canonical?.globals?.[key]?.value:incident&&state?.runtime?.canonical?.incidents?.[incident]?.[incidentKey]?.value;
  if(['UNINITIALIZED','BOOTSTRAPPING'].includes(state?.runtime?.resourceState)&&!available)return renderBootRoute(route,state);
  return (renderers[route] || renderers['command-overview'])(state);
}
