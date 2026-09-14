export function consequenceGate(incident, { externalProviderConfigured = false } = {}) {
  const stage = incident?.truthStage ?? incident?.truth?.stage ?? 'reported';
  const freshness = incident?.freshness?.state ?? 'unknown';
  if (['rejected', 'closed'].includes(stage)) return { allowed: false, level: 'locked', reason: 'Incident is rejected or closed.' };
  if (freshness === 'stale' && stage !== 'verified') return { allowed: false, level: 'locked', reason: 'Stale unsupported reports cannot drive consequence analysis.' };
  if (!['corroborated', 'verified'].includes(stage)) return { allowed: false, level: 'locked', reason: 'Independent evidence is required before consequence screening.' };
  if (stage === 'verified' && externalProviderConfigured) return { allowed: true, level: 'operational', reason: 'Verified incident with configured validated provider.' };
  return { allowed: true, level: 'provisional', reason: 'Hypothetical screening only; not a forecast or evacuation order.' };
}
