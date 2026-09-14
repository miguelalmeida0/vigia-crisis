import { assertIncidentScope, can } from '../../../../packages/domain/src/authorization.mjs';

const PUBLIC_EXACT = new Set([
  'GET /live', 'GET /ready', 'GET /api/v10/live', 'GET /api/v10/ready',
  'GET /api/v1/health', 'GET /api/v2/health', 'GET /api/v9/health', 'GET /api/v10/health',
  'GET /api/v10/release', 'GET /api/v10/session', 'POST /api/v10/session', 'DELETE /api/v10/session'
]);

const DEVICE_MUTATIONS = new Set([
  'POST /api/v8/sensors/observations', 'POST /api/v9/sensors/observations', 'POST /api/v10/sensors/observations'
]);

const NODE_MUTATIONS = new Set(['POST /api/v10/fieldnet/sync']);

const OPERATOR_READ_RULES = [
  [/^\/api\/v10\/operator(?:\/|$)/, 'read:incident_command'],
  [/^\/api\/v10\/workspaces\/command$/, 'read:command'],
  [/^\/api\/v10\/fieldnet(?:\/|$)/, 'read:fieldnet'],
  [/^\/api\/v10\/incident-command(?:\/|$)/, 'read:incident_command'],
  [/^\/api\/v(?:9|10)\/alerts(?:\/|$)/, 'read:alerts'],
  [/^\/api\/v10\/notifications(?:\/|$)/, 'read:alerts'],
  [/^\/api\/v10\/operations(?:\/|$)/, 'read:operations'],
  [/^\/api\/v10\/outcomes(?:\/|$)/, 'read:outcomes'],
  [/^\/api\/v2\/(?:audit|control|actors)(?:\/|$)/, 'read:audit'],
  [/^\/api\/v2\/field(?:\/|$)/, 'read:evidence'],
  [/^\/api\/v(?:2|10)\/evidence-(?:needs|requests)(?:\/|$)/, 'read:evidence'],
  [/^\/api\/v10\/events\/corrections(?:\/|$)/, 'read:evidence'],
  [/^\/api\/v(?:8|9|10)\/sensors\/(?:status|registry)(?:\/|$)/, 'read:fieldnet'],
  [/^\/api\/v10\/replay(?:\/|$)/, 'read:replay'],
  [/^\/api\/v10\/intelligence\/replay(?:\/|$)/, 'read:replay'],
  [/^\/api\/v10\/intelligence(?:\/|$)/, 'read:evidence'],
  [/^\/api\/v10\/prevention(?:\/|$)/, 'review:prevention']
];

const OPERATOR_MUTATION_RULES = [
  [/^\/api\/v10\/operator\/incidents\/:incidentId\/situation\/documents$/, 'submit:evidence'],
  [/^\/api\/v10\/operator\/incidents\/:incidentId\/situation\/documents\/:documentId\/review$/, 'review:incident'],
  [/^\/api\/v1\/world\/refresh$/, 'refresh:sources'],
  [/^\/api\/v10\/incident-command\/imports(?:\/validate)?$/, 'import:incident_command'],
  [/^\/api\/v10\/incident-command\/incidents\/:incidentId(?:\/|$)/, 'command:incident'],
  [/^\/api\/v(?:9|10)\/alerts\/:id\/acknowledge$/, 'alert:acknowledge'],
  [/^\/api\/v10\/alerts\/:id\/(?:assign|reassign)$/, 'alert:assign'],
  [/^\/api\/v10\/alerts\/:id\/resolve$/, 'alert:resolve'],
  [/^\/api\/v10\/alerts\/:id\/suppress$/, 'alert:suppress'],
  [/^\/api\/v10\/events\/:id\/ui-first-seen$/, 'record:ui_visibility'],
  [/^\/api\/v10\/events\/corrections\/(?:merge|split|reject)$/, 'correct:event_association'],
  [/^\/api\/v10\/sensors\/:id\/task$/, 'manage:sensors'],
  [/^\/api\/v9\/sensors\/:id\/task$/, 'manage:sensors'],
  [/^\/api\/v2\/evidence-requests(?:\/|$)/, 'request:evidence'],
  [/^\/api\/v2\/field\/sync$/, 'submit:evidence'],
  [/^\/api\/v2\/incidents\/:id\/review$/, 'review:incident'],
  [/^\/api\/v2\/hazards\/verify$/, 'verify:hazard'],
  [/^\/api\/v2\/remediations(?:\/|$)/, 'create:intervention'],
  [/^\/api\/v10\/prevention(?:\/|$)/, 'review:prevention'],
  [/^\/api\/v10\/observations\/change-screening$/, 'review:prevention'],
  [/^\/api\/v10\/operations\/evidence-closure\/:id\/review$/, 'review:prevention']
  ,[/^\/api\/v10\/outcomes\/production(?:\/|$)/, 'create:intervention']
  ,[/^\/api\/v10\/intelligence\/incidents\/:incidentId\/decisions$/, 'review:incident']
  ,[/^\/api\/v10\/operator\/handoffs(?:\/|$)/, 'command:incident']
  ,[/^\/api\/v10\/operator\/attention\/:attentionId\/acknowledge$/, 'command:incident']
  ,[/^\/api\/v10\/operator\/attention\/:attentionId\/actions$/, 'command:incident']
  ,[/^\/api\/v10\/operator\/operational-periods(?:\/|$)/, 'command:incident']
  ,[/^\/api\/v10\/operator\/incidents\/:incidentId\/response-capability\/recommendations\/:recommendationId\/reviews$/, 'command:incident']
  ,[/^\/api\/v10\/fieldnet\/capacity-admissions(?:\/revocations)?$/, 'fieldnet:capacity-admit']
];

const PUBLIC_READ_NAMESPACES = [
  /^\/api\/v(?:1|2|9|10)\/stream$/,
  /^\/api\/v10\/(?:capabilities|release\/routes|acquisition\/status|physical-sensing\/live|territory)(?:\/|$)/,
  /^\/api\/v10\/(?:validation|campaign|pilot|prevention|detection|observations)(?:\/|$)/,
  /^\/api\/v(?:5|6|7|8|9|10)\/events(?:\/|$)/,
  /^\/api\/v(?:1|2|4)\/(?:stream|world|thermal|imagery|observations|basemap|exposure|prevention|detection|response|consequence|remediations|mission|bootstrap|hazards|incidents|outcomes|live)(?:\/|$)/
];

const LOCAL_VISUALIZATION_ROUTES = [
  /^\/api\/v1\/basemap\//,
  /^\/api\/v1\/imagery\/(?:national|frame\/)/,
  /^\/api\/v1\/thermal(?:\/|$)/,
  /^\/api\/v2\/observations\/(?:frame\/|proxy$|resolve$)/,
  /^\/api\/v10\/detection\/benchmark$/,
  /^\/api\/v10\/pilot(?:\/|$)/,
  /^\/api\/v10\/observations\/change-screening$/,
  /^\/api\/v10\/validation(?:\/|$)/,
  /^\/api\/v(?:5|6|7|8|9|10)\/events\/thermal\/overlay$/
];

const operatorConsoleOrigin = () => process.env.VIGIA_OPERATOR_CONSOLE_ORIGIN || 'http://127.0.0.1:4190';

export function assertLocalVisualizationRequest(req) {
  const fetchSite=String(req?.headers?.['sec-fetch-site']??'').toLowerCase(),origin=String(req?.headers?.origin??'');
  if(fetchSite!=='same-origin')throw Object.assign(new Error('local_visualization_cross_site_rejected'),{statusCode:403});
  if(origin!==operatorConsoleOrigin())throw Object.assign(new Error('local_visualization_origin_rejected'),{statusCode:403});
  if(req?.headers?.['x-vigia-ui-proxy']!=='mission-dark-realdata-2.0')throw Object.assign(new Error('local_visualization_proxy_required'),{statusCode:403});
}

export function visualizationClientKey(req,context={}) {
  assertLocalVisualizationRequest(req);
  const authentication=context?.actor?.authentication,mode=authentication?.mode;
  if(authentication?.authenticated!==true||!['local_shadow_session','environment_bearer','operator_proxy_assertion'].includes(mode))throw Object.assign(new Error('local_visualization_session_required'),{statusCode:401});
  return`operator-console:${String(context.actor.id??'authenticated').slice(0,120)}`;
}

function operatorPolicy(capability, path, method) {
  const incidentParam = path.includes(':incidentId') ? 'incidentId'
    : path === '/api/v2/incidents/:id/review' || path === '/api/v10/events/:id/ui-first-seen' || path === '/api/v10/operations/incidents/:id' ? 'id' : null;
  return Object.freeze({
    boundary: 'operator', authentication: 'required', capability,
    incidentScoped: Boolean(incidentParam), incidentParam,
    mutationIntent: method !== 'GET' && method !== 'HEAD' ? 'operator-console' : null,
    redaction: 'authenticated_projection', audit: method === 'GET' ? 'read' : 'mutation'
  });
}

export function policyForRoute(method, path) {
  const normalizedMethod = String(method).toUpperCase();
  const key = `${normalizedMethod} ${path}`;
  if (PUBLIC_EXACT.has(key)) return Object.freeze({ boundary:'public', authentication:'none', capability:null, incidentScoped:false, mutationIntent:null, redaction:'public_projection', audit:'boundary' });
  if (DEVICE_MUTATIONS.has(key)) return Object.freeze({ boundary:'signed-device', authentication:'route-cryptographic', capability:'submit:evidence', incidentScoped:false, mutationIntent:null, redaction:'receipt_only', audit:'mutation' });
  if (NODE_MUTATIONS.has(key)) return Object.freeze({ boundary:'signed-field-node', authentication:'route-cryptographic', capability:'fieldnet:sync', incidentScoped:false, mutationIntent:null, redaction:'receipt_only', audit:'mutation' });
  if (normalizedMethod === 'GET') {
    for (const [pattern, capability] of OPERATOR_READ_RULES) if (pattern.test(path)) return operatorPolicy(capability, path, normalizedMethod);
    if (PUBLIC_READ_NAMESPACES.some((pattern) => pattern.test(path))) return Object.freeze({ boundary:'public-read', authentication:'none', capability:'read:territory', incidentScoped:false, mutationIntent:null, redaction:'public_projection', audit:'read', localVisualization:LOCAL_VISUALIZATION_ROUTES.some((pattern)=>pattern.test(path)) });
  } else {
    for (const [pattern, capability] of OPERATOR_MUTATION_RULES) if (pattern.test(path)) return operatorPolicy(capability, path, normalizedMethod);
  }
  throw Object.assign(new Error('route_security_policy_missing'), { statusCode:500, details:{ method:normalizedMethod, path } });
}

export function authorizeRoute({ policy, req, context, params }) {
  if(policy.localVisualization)visualizationClientKey(req,context);
  if (policy.authentication === 'none' || policy.authentication === 'route-cryptographic') return;
  const actor = context?.actor;
  if (actor?.authentication?.authenticated !== true) throw Object.assign(new Error('authentication_required'), { statusCode:401, details:{ boundary:policy.boundary } });
  if (!can(actor, policy.capability)) throw Object.assign(new Error('forbidden'), { statusCode:403, details:{ capability:policy.capability, role:actor?.role ?? 'anonymous' } });
  if (policy.incidentScoped) assertIncidentScope(actor, params?.[policy.incidentParam]);
  if (policy.mutationIntent && ['local_shadow_session','operator_proxy_assertion'].includes(actor?.authentication?.mode) && req.headers?.['x-vigia-operator-intent'] !== policy.mutationIntent) {
    throw Object.assign(new Error('operator_intent_required'), { statusCode:403, details:{ expected:policy.mutationIntent } });
  }
}
