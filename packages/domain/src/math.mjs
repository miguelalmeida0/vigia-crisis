export function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

export function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

export function weightedMean(entries) {
  let weighted = 0;
  let totalWeight = 0;
  for (const entry of entries) {
    const value = Number(entry?.value);
    const weight = Number(entry?.weight);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    weighted += value * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weighted / totalWeight : 0;
}
