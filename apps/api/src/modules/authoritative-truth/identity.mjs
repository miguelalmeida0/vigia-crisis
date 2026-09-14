export function canonicalProviderIncidentId(providerId, value) {
  const token = String(value ?? '').trim().toUpperCase().replace(/^(?:CA-(?:AB|BC)|US-WEST)[:-]/, '').replace(/[^A-Z0-9-]/g, '');
  return providerId === 'alberta-wildfire' ? token.replaceAll('-', '') : token;
}

export function canonicalIncidentId(providerId, region, incidentId, providerIncidentId = null) {
  const raw = providerIncidentId ?? String(incidentId ?? '').split(':').at(-1);
  return `${region}:${canonicalProviderIncidentId(providerId, raw)}`;
}

export const sequenceKey = (providerId, incidentId) => `${providerId}|${incidentId}`;

export function sequenceFor(state, providerId, incidentId) {
  return state.sequences?.[sequenceKey(providerId, incidentId)]
    ?? Object.values(state.sequences ?? {}).find((item) => item.providerId === providerId && item.incidentId === incidentId)
    ?? null;
}
