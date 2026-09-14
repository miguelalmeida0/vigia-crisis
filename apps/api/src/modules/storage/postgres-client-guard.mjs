const clients = new WeakMap();
const pools = new WeakMap();

export const isUnusablePostgresClientError = (error) => {
  const code = String(error?.code ?? '').toUpperCase();
  const message = String(error?.message ?? error ?? '').toLowerCase();
  return code === '25P03' || code.startsWith('08') || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', '57P01', '57P02', '57P03'].includes(code) || message.includes('connection terminated') || message.includes('client was closed') || message.includes('client has already been released');
};

export function guardPostgresClient(client, onError = null) {
  if (!client) return null;
  let state = clients.get(client);
  if (!state) {
    state = { failure: null, observers: new Set() };
    clients.set(client, state);
    client.on?.('error', (error) => {
      if (isUnusablePostgresClientError(error)) state.failure ??= error;
      for (const observer of state.observers) observer(error);
    });
  }
  if (onError) state.observers.add(onError);
  return state;
}

export function guardPostgresPool(pool, onError = null) {
  if (!pool?.on) return pool;
  let state = pools.get(pool);
  if (!state) {
    state = { observers: new Set(), forward: null };
    pools.set(pool, state);
    state.forward = (error) => {
      for (const observer of state.observers) observer(error);
    };
    const attach = (client) => guardPostgresClient(client, state.forward);
    pool.on('connect', attach);
    pool.on('acquire', attach);
  }
  if (onError) state.observers.add(onError);
  return pool;
}

export function postgresClientFailure(client, error = null) {
  const state = guardPostgresClient(client);
  if (state && error && isUnusablePostgresClientError(error)) state.failure ??= error;
  return state?.failure ?? error;
}

export function releasePostgresClient(client) {
  if (!client) return;
  const failure = clients.get(client)?.failure ?? null;
  client.release(failure || undefined);
}
