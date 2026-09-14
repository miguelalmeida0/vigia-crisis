export class AlertTransport {
  constructor({ id = 'abstract-alert-transport', enabled = false } = {}) { this.id = id; this.enabled = enabled; }
  status() { return { transportId: this.id, state: this.enabled ? 'CONFIGURED' : 'DISPATCH_DISABLED' }; }
  async send() { throw Object.assign(new Error('alert_transport_unavailable'), { statusCode: 503 }); }
}

export class DisabledAlertTransport extends AlertTransport {
  constructor() { super({ id: 'disabled-alert-transport', enabled: false }); }
  async send() { throw Object.assign(new Error('external_public_alert_transport_disabled'), { statusCode: 503 }); }
}

export function validateCapDraft(cap, { now = new Date() } = {}) {
  const errors = [];
  const required = ['identifier', 'sender', 'sent', 'status', 'msgType', 'scope', 'category', 'event', 'urgency', 'severity', 'certainty', 'effective', 'expires', 'senderName', 'headline', 'description', 'instruction', 'area'];
  for (const key of required) if (cap?.[key] === null || cap?.[key] === undefined || cap?.[key] === '') errors.push(`${key}_required`);
  if (!['Actual', 'Exercise', 'Test', 'Draft'].includes(cap?.status)) errors.push('status_invalid');
  if (!['Alert', 'Update', 'Cancel'].includes(cap?.msgType)) errors.push('message_type_invalid');
  if (!['Immediate', 'Expected', 'Future', 'Past', 'Unknown'].includes(cap?.urgency)) errors.push('urgency_invalid');
  if (!['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'].includes(cap?.severity)) errors.push('severity_invalid');
  if (!['Observed', 'Likely', 'Possible', 'Unlikely', 'Unknown'].includes(cap?.certainty)) errors.push('certainty_invalid');
  if (!Number.isFinite(Date.parse(cap?.effective ?? ''))) errors.push('effective_invalid');
  if (!Number.isFinite(Date.parse(cap?.expires ?? '')) || Date.parse(cap?.expires) <= Date.parse(cap?.effective ?? now)) errors.push('expires_invalid');
  if (!cap?.area?.areaDesc || (!cap?.area?.polygon && !cap?.area?.circle && !cap?.area?.geocode)) errors.push('target_area_geometry_or_geocode_required');
  return { schemaVersion: 'vigia.cap-validation.v1', valid: errors.length === 0, errors };
}
