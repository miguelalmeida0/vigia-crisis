import { clamp } from './math.mjs';

export function inferResourceBand({ operatives = 0, ground = 0, aerial = 0, important = false } = {}) {
  const score = (important ? 24 : 0)
    + clamp(Number(operatives) * 0.34, 0, 58)
    + clamp(Number(ground) * 1.05, 0, 18)
    + clamp(Number(aerial) * 8, 0, 24);
  return score >= 76 ? 'very_high'
    : score >= 47 ? 'high'
      : score >= 21 ? 'moderate'
        : 'reported';
}
