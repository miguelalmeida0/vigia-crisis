export function createStore(initial) {
  let state = structuredClone(initial); const listeners = new Set();
  return {
    get: () => state,
    set(updater) { state = typeof updater === 'function' ? updater(state) : updater; for (const listener of listeners) listener(state); },
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); }
  };
}
