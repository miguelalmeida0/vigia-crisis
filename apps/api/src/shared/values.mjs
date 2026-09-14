export const asArray = (value) => Array.isArray(value) ? value : [];

export function numberOrNull(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) && number !== -99 ? number : null;
}

export function textOr(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function isoOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function unwrap(payload, key) {
  if (!payload || typeof payload !== 'object') return [];
  return asArray(payload?.data?.[key] ?? payload?.[key] ?? payload?.data ?? []);
}

export function clone(value) {
  return structuredClone(value);
}
