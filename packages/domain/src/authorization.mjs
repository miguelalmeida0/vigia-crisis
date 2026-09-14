const ADMINISTRATOR_CAPABILITIES = Object.freeze([
  'read:territory','read:evidence','read:outcomes','read:command','read:incident_command','read:alerts','read:operations','read:audit','read:fieldnet','read:replay',
  'request:evidence','ack:evidence_request','submit:evidence','create:intervention','review:incident','review:prevention','verify:hazard','approve:closure','run:consequence','correct:event_association',
  'import:incident_command','command:incident','refresh:sources','alert:acknowledge','alert:assign','alert:resolve','alert:suppress','manage:sensors','record:ui_visibility','publish:source','fieldnet:sync','fieldnet:capacity-admit'
]);

export const ROLE_CAPABILITIES = Object.freeze({
  public_viewer: ['read:territory'],
  viewer: ['read:territory', 'read:evidence', 'read:outcomes'],
  analyst: ['read:territory', 'read:evidence', 'read:outcomes', 'request:evidence', 'create:intervention', 'review:incident', 'review:prevention', 'correct:event_association'],
  field_inspector: ['read:territory', 'read:evidence', 'ack:evidence_request', 'submit:evidence'],
  supervisor: ['read:territory', 'read:evidence', 'read:outcomes', 'read:command', 'read:incident_command', 'read:alerts', 'read:operations', 'read:audit', 'read:fieldnet', 'read:replay', 'request:evidence', 'create:intervention', 'review:incident', 'review:prevention', 'verify:hazard', 'approve:closure', 'run:consequence', 'correct:event_association', 'import:incident_command', 'command:incident', 'refresh:sources', 'alert:acknowledge', 'alert:assign', 'alert:resolve', 'alert:suppress', 'manage:sensors', 'record:ui_visibility', 'fieldnet:capacity-admit'],
  administrator: ADMINISTRATOR_CAPABILITIES,
  integration_service: ['read:territory', 'read:evidence', 'submit:evidence', 'publish:source']
});

export function capabilitiesFor(role) {
  return [...(ROLE_CAPABILITIES[role] ?? [])];
}

export function can(actor, capability) {
  const roleCapabilities = ROLE_CAPABILITIES[actor?.role] ?? [];
  const granted = Array.isArray(actor?.capabilities) ? actor.capabilities : roleCapabilities;
  return granted.includes(capability) && roleCapabilities.includes(capability);
}

export function assertCan(actor, capability) {
  if (!can(actor, capability)) {
    const error = new Error('forbidden');
    error.statusCode = 403;
    error.details = { capability, role: actor?.role ?? 'anonymous' };
    throw error;
  }
}

export function canonicalIncidentId(value) {
  const text = String(value ?? '').trim();
  return text.replace(/^(?:incident|event):/, '');
}

export function incidentInScope(actor, incidentId) {
  const requested = canonicalIncidentId(incidentId);
  const scopes = Array.isArray(actor?.incidentScopes) ? actor.incidentScopes : [];
  return Boolean(requested) && scopes.some((scope) => scope === '*' || canonicalIncidentId(scope) === requested);
}

export function assertIncidentScope(actor, incidentId) {
  if (!incidentInScope(actor, incidentId)) {
    const error = new Error('incident_scope_forbidden');
    error.statusCode = 403;
    error.details = { incidentId: String(incidentId ?? ''), actorId: actor?.id ?? null };
    throw error;
  }
  return canonicalIncidentId(incidentId);
}

export function hasGlobalIncidentScope(actor) {
  return Array.isArray(actor?.incidentScopes) && actor.incidentScopes.includes('*');
}

export function assertGlobalIncidentScope(actor) {
  if (!hasGlobalIncidentScope(actor)) {
    const error = new Error('incident_scope_forbidden');
    error.statusCode = 403;
    error.details = { incidentId: '*', actorId: actor?.id ?? null };
    throw error;
  }
}

export function incidentIdForResource(type, id) {
  const resourceType = String(type ?? '').toLowerCase();
  const value = String(id ?? '').trim();
  if (!value) return null;
  if (['fire_event', 'event', 'incident'].includes(resourceType) || /^(?:event|incident):/.test(value)) return canonicalIncidentId(value);
  return null;
}
