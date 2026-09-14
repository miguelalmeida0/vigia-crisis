/** Retain the actual input node across route rendering, including its native editing state. */
export function restoreStableSearchInput(root, stable, selector, value) {
  if (!stable) return false;
  const fresh = root.querySelector(selector);
  if (!fresh) return false;
  const nextValue = String(value ?? '');
  if (stable.value !== nextValue) stable.value = nextValue;
  fresh.replaceWith(stable);
  return true;
}
