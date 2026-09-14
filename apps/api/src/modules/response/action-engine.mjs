export function recommendNextAction({ incident, exposure, spread }) {
  if (['reported', 'observed'].includes(incident.truthStage)) {
    return {
      kind: 'verification',
      title: 'Acquire independent confirmation',
      rationale: 'The incident is still based primarily on a public occurrence record.',
      steps: ['Correlate a thermal point or camera view', 'Attach a field observation', 'Keep public-source freshness visible'],
      authority: 'Human review required'
    };
  }
  if (incident.truthStage === 'rejected') {
    return {
      kind: 'monitor', title: 'Keep passive monitoring only',
      rationale: 'A local operator rejected the candidate and no stronger evidence currently overrides that review.',
      steps: ['Retain the audit trail', 'Re-open only on independent new evidence'], authority: 'Human review required'
    };
  }
  if (exposure?.state === 'unavailable') {
    return {
      kind: 'exposure-recovery', title: 'Restore exposure intelligence',
      rationale: 'The spread screen is available, but mapped buildings and critical assets could not be loaded.',
      steps: ['Retry mapped exposure sources', 'Request local asset layers', 'Do not invent missing counts'], authority: 'Planning support only'
    };
  }
  const assets = exposure?.assets?.length ?? 0;
  const buildings = exposure?.buildingCountWithin3Km;
  return {
    kind: assets > 0 ? 'protect-assets' : 'maintain-track',
    title: assets > 0 ? 'Validate the highest-consequence downwind assets' : 'Maintain the observation loop',
    rationale: assets > 0
      ? `${assets} mapped critical assets and ${buildings ?? 'an unknown number of'} buildings are available for consequence screening.`
      : 'No mapped critical assets were returned; the absence may reflect source completeness rather than true absence.',
    steps: ['Confirm the incident perimeter with authorized observations', 'Check the 15/30/60-minute screening envelopes', 'Escalate only through official operational command'],
    authority: 'Unvalidated planning support only',
    model: spread.model
  };
}
