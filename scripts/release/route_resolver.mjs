const ROUTE_PLACEHOLDER = /\{[A-Za-z][A-Za-z0-9]*\}/g;

function certificationError(code, details = {}) {
  const error = new Error(code);
  error.details = details;
  return error;
}

export function resolveRoutePath(routePath, { incidentId } = {}) {
  if (typeof routePath !== 'string' || !routePath.startsWith('/')) {
    throw certificationError('required_route_path_invalid', { routePath });
  }

  let resolvedPath = routePath;
  if (resolvedPath.includes('{incidentId}')) {
    const concreteIncidentId = typeof incidentId === 'string' ? incidentId.trim() : '';
    if (!concreteIncidentId) {
      throw certificationError('governed_certification_incident_unresolved', { routePath });
    }
    resolvedPath = resolvedPath.replaceAll('{incidentId}', encodeURIComponent(concreteIncidentId));
  }

  const unresolved = resolvedPath.match(ROUTE_PLACEHOLDER);
  if (unresolved) {
    throw certificationError('required_route_placeholder_unresolved', {
      routePath,
      placeholder: unresolved[0],
    });
  }
  return resolvedPath;
}

export function resolveCertificationIncidentId({ proof = null, fieldIncidents = null } = {}) {
  const proofIncidentId = typeof proof?.incidentId === 'string' ? proof.incidentId.trim() : '';
  if (proofIncidentId && proof?.verdict === 'PASS') {
    return { incidentId: proofIncidentId, source: 'controlled-exercise-proof' };
  }

  const fieldIncidentId = typeof fieldIncidents?.incidents?.[0]?.incidentId === 'string'
    ? fieldIncidents.incidents[0].incidentId.trim()
    : '';
  if (fieldIncidentId) {
    return { incidentId: fieldIncidentId, source: 'field-node-discovery' };
  }

  throw certificationError('governed_certification_incident_unresolved', {
    proofVerdict: proof?.verdict ?? null,
    fieldIncidentCount: Array.isArray(fieldIncidents?.incidents) ? fieldIncidents.incidents.length : 0,
  });
}

export async function certifyRequiredRoutes({
  routes,
  baseUrl,
  family,
  context,
  request,
  requestOptions = {},
}) {
  const evidence = [];
  for (const route of routes) {
    const routePath = resolveRoutePath(route.path, context);
    const result = await request(`${baseUrl}${routePath}`, requestOptions);
    evidence.push({
      ...route,
      family,
      path: routePath,
      status: result.status,
      durationMs: result.durationMs,
      schemaVersion: result.body?.schemaVersion ?? result.body?.meta?.schemaVersion ?? null,
    });
    if (!result.ok) throw certificationError(`required_route_failed:${route.id}`, result);
    if (!result.body || typeof result.body !== 'object') {
      throw certificationError(`required_route_schema_invalid:${route.id}`, result);
    }
  }
  return evidence;
}
