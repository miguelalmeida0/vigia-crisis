import { parentPort, workerData } from 'node:worker_threads';
import { trackFireEvents } from '../../../../../packages/domain/src/fire-event-tracker.mjs';

try {
  const events = trackFireEvents(workerData.observations, { now: new Date(workerData.now) });
  parentPort.postMessage({ ok: true, events });
} catch (error) {
  parentPort.postMessage({ ok: false, error: String(error?.stack ?? error?.message ?? error) });
}
