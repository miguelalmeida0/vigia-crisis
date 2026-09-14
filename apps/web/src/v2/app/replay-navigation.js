function stepForTimestamp(steps, timestamp) {
  const target = Date.parse(timestamp ?? '');
  if (!Number.isFinite(target)) return 0;
  const index = steps.findIndex((step) => Date.parse(step) >= target);
  return index < 0 ? Math.max(0, steps.length - 1) : index;
}

export function replayJumpIndex(state, target) {
  const detail = state.replayCase;
  const steps = detail?.controlledClock?.steps ?? [];
  if (!steps.length || target === 'start') return 0;
  if (target === 'physical') return stepForTimestamp(steps, detail.case?.firstThermalAt);
  if (target === 'report') return stepForTimestamp(steps, detail.case?.alertAt);
  return Math.max(0, state.replayTimeIndex ?? 0);
}

export function replayRefreshIndex(replayCase, currentIndex, resetClock = false) {
  if (resetClock) return 0;
  const last = Math.max(0, (replayCase?.controlledClock?.steps?.length ?? 1) - 1);
  return Math.min(last, Math.max(0, Number(currentIndex) || 0));
}

export function replayEntryIndex(replayCase, view, currentIndex, resetClock = true) {
  if (resetClock && view === 'incidents') return replayJumpIndex({ replayCase, replayTimeIndex:currentIndex }, 'physical');
  return replayRefreshIndex(replayCase, currentIndex, resetClock);
}
