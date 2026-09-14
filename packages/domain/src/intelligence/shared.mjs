import { createHash } from 'node:crypto';

export function requiredText(value, code) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(code);
  return text;
}

export function isoTime(value, code = 'valid_time_required') {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(code);
  return date.toISOString();
}

export function finiteNonNegative(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(code);
  return number;
}

export function uniqueSorted(values = []) {
  return [...new Set(values.map(String))].sort((left, right) => left.localeCompare(right));
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function semanticHash(prefix, value) {
  return `${prefix}:sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function immutable(value) {
  return deepFreeze(structuredClone(value));
}

export function compareIds(left, right) {
  return String(left.id).localeCompare(String(right.id));
}
