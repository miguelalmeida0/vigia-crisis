export function relativeTime(value, now = new Date()) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms <= 0) return 'Time unavailable';
  const seconds = Math.max(0, Math.round((now.getTime() - ms) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 172800) return 'Yesterday';
  if (seconds < 604800) return `${Math.round(seconds / 86400)} days ago`;
  return dateTime(value);
}
export function dateTime(value) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms <= 0) return 'Unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(ms));
}
export function evidenceDateTime(value) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms <= 0) return 'Unavailable';
  return new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short' }).format(new Date(ms));
}
export function isNumberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}
export function number(value, fallback = '—') { return isNumberValue(value) ? new Intl.NumberFormat('en-GB').format(Number(value)) : fallback; }
export function hours(value) { return isNumberValue(value) ? `${Number(value).toFixed(Number(value) < 10 ? 1 : 0)} h` : '—'; }
export function place(item) { return item?.municipality || item?.place || item?.name || item?.title || 'Location unavailable'; }
export function statusLabel(value = '') { return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
export function coordinateLabel(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return 'Coordinate unavailable';
  const [lon, lat] = coordinate.map(Number); if (![lon, lat].every(Number.isFinite)) return 'Coordinate unavailable';
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
}
export function compactDuration(hoursValue) {
  if (!isNumberValue(hoursValue)) return '—';
  const value = Number(hoursValue);
  if (value < 24) return `${Math.round(value)} h`;
  return `${(value / 24).toFixed(value < 72 ? 1 : 0)} d`;
}
