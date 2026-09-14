import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { projectOperationalTwin } from './project-operational-twin.mjs';

export function createOperationalTwinReplay({ events, sourceRegistry, asOf }) {
  const twin = projectOperationalTwin({ events, sourceRegistry, asOf });
  const manifest = {
    schemaVersion: 'vigia.operational-twin-replay.v1', asOf: twin.asOf, sourceRegistryFingerprint: sourceRegistry.fingerprint,
    inputEventIds: events.filter((event) => Date.parse(event.clocks.ingestedAt) <= Date.parse(twin.asOf)).map((event) => event.id).sort(),
    projectionHash: twin.projectionHash
  };
  return immutable({ ...manifest, replayHash: semanticHash('operational-twin-replay', manifest), twin });
}

export function verifyOperationalTwinReplay(replay, { events, sourceRegistry }) {
  const rebuilt = createOperationalTwinReplay({ events, sourceRegistry, asOf: replay.asOf });
  return immutable({
    valid: replay.replayHash === rebuilt.replayHash && replay.projectionHash === rebuilt.projectionHash,
    expectedReplayHash: replay.replayHash, actualReplayHash: rebuilt.replayHash,
    expectedProjectionHash: replay.projectionHash, actualProjectionHash: rebuilt.projectionHash
  });
}
