// A stuck initialization that hangs forever is worse than one that fails
// fast: it produces no error, no log, and no signal for an operator or an
// orchestrator (Render's port scan, a restart policy) to act on. Wrap any
// promise-returning step that must not be allowed to hang indefinitely with
// this helper so a timeout becomes a clear, labelled, catchable error instead
// of silence.
export class InitializationTimeoutError extends Error {
  constructor(label, ms) {
    super(`initialization_timed_out: "${label}" did not settle within ${ms}ms`);
    this.name = 'InitializationTimeoutError';
    this.label = label;
    this.timeoutMs = ms;
  }
}

export async function withTimeout(factory, { ms, label }) {
  if (!Number.isFinite(ms) || ms <= 0) throw new Error('withTimeout_requires_positive_ms');
  if (!label) throw new Error('withTimeout_requires_label');
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new InitializationTimeoutError(label, ms)), ms); });
  try {
    return await Promise.race([Promise.resolve().then(factory), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
