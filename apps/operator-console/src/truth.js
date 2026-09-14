/**
 * The only boundary that may coerce backend or persisted values into numbers.
 * Absence is deliberately not JavaScript's numeric zero.
 */
export function finiteNumberOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatMeasuredNumber(value, { suffix = '', missing = 'Unmeasured', fractionDigits = 2 } = {}) {
  const number = finiteNumberOrNull(value);
  if (number === null) return missing;
  if (Object.is(number, -0) || number === 0) return `0${suffix}`;
  const rendered = Math.abs(number) < 10 ? number.toFixed(fractionDigits) : String(Math.round(number));
  return `${rendered}${suffix}`;
}

export function formatMeasuredPercent(value, { missing = 'Measurement required' } = {}) {
  const number = finiteNumberOrNull(value);
  return number === null ? missing : `${Math.round(number)}%`;
}
