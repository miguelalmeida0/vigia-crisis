export function localToIso(value) { const time = new Date(value).getTime(); return Number.isFinite(time) ? new Date(time).toISOString() : value; }
export function lines(value) { return String(value ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }
export function coordinateFor(item) { return Array.isArray(item?.coordinate) ? item.coordinate : null; }
export function selectedRequest(state, targetId) { return state.bootstrap?.operations?.evidenceRequests?.find((item) => item.targetId === targetId && item.state === 'accepted') ?? null; }
