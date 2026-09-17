export const DEMO_INCIDENT_ID = 'incident:demo:pedrogao-grande-portfolio-exercise';
export const REQUIRED_DEMO_IMPORT_RECORDS = 13;

export function validateDemoSeedComplete(event, { requireIdempotentReplay = false } = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('demo_seed_contract_missing');
  }
  if (event.step !== 'seed_complete') throw new Error('demo_seed_contract_wrong_event');
  if (event.incidentId !== DEMO_INCIDENT_ID) throw new Error('demo_seed_contract_wrong_incident');
  if (event.importStatus !== 'VALID') throw new Error('demo_seed_contract_import_not_valid');
  if (event.acceptedRecords !== REQUIRED_DEMO_IMPORT_RECORDS) throw new Error('demo_seed_contract_wrong_record_count');
  if (event.universe !== 'SHADOW') throw new Error('demo_seed_contract_wrong_universe');
  if (event.exercise !== true) throw new Error('demo_seed_contract_not_exercise');
  if (typeof event.canonicalEventId !== 'string' || event.canonicalEventId.trim().length < 8) {
    throw new Error('demo_seed_contract_missing_canonical_event');
  }
  if (typeof event.idempotentReplay !== 'boolean') throw new Error('demo_seed_contract_missing_replay_state');
  if (requireIdempotentReplay && event.idempotentReplay !== true) {
    throw new Error('demo_seed_contract_replay_not_idempotent');
  }
  return Object.freeze({
    incidentId: event.incidentId,
    canonicalEventId: event.canonicalEventId,
    importStatus: event.importStatus,
    acceptedRecords: event.acceptedRecords,
    universe: event.universe,
    exercise: event.exercise,
    idempotentReplay: event.idempotentReplay
  });
}

export function validateDemoReplayPair(first, second) {
  const initial = validateDemoSeedComplete(first);
  const replay = validateDemoSeedComplete(second, { requireIdempotentReplay: true });
  if (replay.canonicalEventId !== initial.canonicalEventId) {
    throw new Error('demo_seed_contract_canonical_event_changed_on_replay');
  }
  if (replay.incidentId !== initial.incidentId) {
    throw new Error('demo_seed_contract_incident_changed_on_replay');
  }
  return replay;
}
