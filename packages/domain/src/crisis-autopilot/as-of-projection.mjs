const KNOWLEDGE_TIME_PATHS = Object.freeze([
  ['clocks', 'ingestedAt'],
  ['knowledgeTime'],
  ['ingestedAt'],
  ['receivedAt'],
  ['recordedAt'],
  ['createdAt'],
  ['retrievedAt'],
  ['lastCheckedAt'],
  ['lastAttempt'],
  ['updatedAt'],
]);

const OBSERVATION_TIME_PATHS = Object.freeze([
  ['clocks', 'observedAt'],
  ['observedAt'],
  ['measuredAt'],
]);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function pathValue(value, path) {
  return path.reduce((current, key) => object(current) ? current[key] : undefined, value);
}

function instant(value) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

export function canonicalKnowledgeTime(value) {
  if (!object(value)) return null;
  for (const path of KNOWLEDGE_TIME_PATHS) {
    const result = instant(pathValue(value, path));
    if (result) return result;
  }
  for (const path of OBSERVATION_TIME_PATHS) {
    const result = instant(pathValue(value, path));
    if (result) return result;
  }
  return null;
}

function versionCandidates(value) {
  if (!object(value)) return null;
  for (const key of ['asOfHistory', 'versions', 'revisions']) {
    if (Array.isArray(value[key])) return { key, values: value[key].filter(object) };
  }
  return null;
}

function selectVersion(value, asOfMs) {
  const candidates = versionCandidates(value);
  if (!candidates) return { value, historyEvaluated: false, excludedFutureCount: 0, selectedKnowledgeTime: canonicalKnowledgeTime(value) };
  const eligible = candidates.values
    .map((candidate, index) => ({ candidate, index, at: canonicalKnowledgeTime(candidate) }))
    .filter((entry) => entry.at && Date.parse(entry.at) <= asOfMs)
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at) || left.index - right.index);
  const selected = eligible.at(-1)?.candidate;
  return {
    value: selected,
    historyEvaluated: true,
    excludedFutureCount: candidates.values.length - eligible.length,
    selectedKnowledgeTime: selected ? canonicalKnowledgeTime(selected) : null,
  };
}

function project(value, asOfMs) {
  if (Array.isArray(value)) {
    const output = [];
    let excludedFutureCount = 0;
    let undatedCount = 0;
    for (const item of value) {
      const result = project(item, asOfMs);
      excludedFutureCount += result.excludedFutureCount;
      undatedCount += result.undatedCount;
      if (result.included) output.push(result.value);
    }
    return { included: true, value: output, excludedFutureCount, undatedCount, historyEvaluated: false, selectedKnowledgeTime: null };
  }
  if (!object(value)) return { included: true, value, excludedFutureCount: 0, undatedCount: 0, historyEvaluated: false, selectedKnowledgeTime: null };
  const selection = selectVersion(value, asOfMs);
  if (!selection.value) return { ...selection, included: false, value: undefined, excludedFutureCount: selection.excludedFutureCount, undatedCount: 0 };
  const knowledgeTime = selection.selectedKnowledgeTime ?? canonicalKnowledgeTime(selection.value);
  if (knowledgeTime && Date.parse(knowledgeTime) > asOfMs) return { ...selection, included: false, value: undefined, excludedFutureCount: selection.excludedFutureCount + 1, undatedCount: 0 };
  const output = {};
  let excludedFutureCount = selection.excludedFutureCount;
  let undatedCount = knowledgeTime ? 0 : 1;
  for (const [key, child] of Object.entries(selection.value)) {
    if (['asOfHistory', 'versions', 'revisions'].includes(key)) continue;
    const result = project(child, asOfMs);
    excludedFutureCount += result.excludedFutureCount;
    undatedCount += result.undatedCount;
    if (result.included) output[key] = result.value;
  }
  return { included: true, value: output, excludedFutureCount, undatedCount, historyEvaluated: selection.historyEvaluated, selectedKnowledgeTime: knowledgeTime };
}

export function projectCanonicalValueAsOf(value, asOf) {
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs)) throw new Error('canonical_as_of_projection_clock_required');
  const result = project(value, asOfMs);
  return {
    value: result.included ? result.value : undefined,
    state: !result.included ? 'NO_VALUE_AT_AS_OF' : result.excludedFutureCount ? 'FUTURE_VALUES_EXCLUDED' : result.historyEvaluated ? 'HISTORICAL_REVISION_SELECTED' : result.undatedCount ? 'UNDATED_CANONICAL_INPUT' : 'AS_OF_FILTERED',
    excludedFutureCount: result.excludedFutureCount,
    undatedValueCount: result.undatedCount,
    historyEvaluated: result.historyEvaluated,
    selectedKnowledgeTime: result.selectedKnowledgeTime,
  };
}

export function occursAfterAsOf(value, asOf) {
  const at = canonicalKnowledgeTime(value);
  return Boolean(at && Date.parse(at) > Date.parse(asOf));
}
