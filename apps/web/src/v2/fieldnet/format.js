import { escapeHtml } from '../utils/html.js';

export const html = (value) => escapeHtml(String(value ?? '—').replaceAll('Â·', '·'));
export const count = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—';
export const stamp = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '—';
};
export const dateStamp = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle:'medium', timeStyle:'short' }) : '—';
};
export const elapsed = (value, now = Date.now()) => {
  const then = Date.parse(value);
  if (!Number.isFinite(then)) return 'never';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
};
export const label = (value) => String(value ?? 'unknown').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
export const shortId = (value) => String(value ?? '—').split(':').at(-1).slice(0, 10);

export function observationTitle(item = {}) {
  const values = {
    VISUAL_SMOKE:'Smoke observation', VISUAL_FLAME:'Flame observation', THERMAL_READING:'Thermal reading',
    WEATHER:'Weather observation', ROAD_OBSTRUCTION:'Road obstruction', ACCESS_CONDITION:'Access condition', FIELD_NOTE:'Field note'
  };
  return values[item.observationType] ?? label(item.observationType);
}

export function truthState(model = {}) {
  const open = model.conflicts?.filter((item) => item.state === 'OPEN') ?? [];
  if (open.length) return 'CONFLICTED';
  if (!(model.observations?.length)) return 'UNRESOLVED';
  const latest = Math.max(...model.observations.map((item) => Date.parse(item.observedAt)).filter(Number.isFinite));
  return Number.isFinite(latest) && Date.now() - latest > 60 * 60_000 ? 'STALE' : 'SUPPORTED';
}
