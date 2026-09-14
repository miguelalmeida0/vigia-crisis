import { semanticHash, stableStringify } from '../intelligence/shared.mjs';
import { normalizedSource, optionalInstant, stablePlanningId } from './contracts.mjs';
import { finite, idOf, isFuture, rows, text, truthUnknown, unique } from './projection-helpers.mjs';

function claimValue(value) {
  if (value === undefined) return null;
  return stableStringify(value);
}

export function projectModelDisagreement(claimInputs, asOf) {
  const admitted = [];
  const excluded = [];
  for (const claim of rows(claimInputs)) {
    const topic = text(claim.topic ?? claim.quantity ?? claim.subject);
    const subjectId = text(claim.subjectId ?? claim.targetId);
    const source = normalizedSource(claim);
    const observedAt = optionalInstant(claim.observedAt ?? claim.generatedAt);
    const normalizedValue = claimValue(claim.value ?? claim.state ?? claim.claim);
    if (!topic || !subjectId || !source.attributable || !observedAt || normalizedValue === null) {
      excluded.push({ claimId: idOf(claim), reason: 'CLAIM_REQUIRES_TOPIC_SUBJECT_VALUE_ATTRIBUTABLE_SOURCE_AND_TIME' });
      continue;
    }
    if (isFuture(observedAt, asOf)) {
      excluded.push({ claimId: idOf(claim), reason: 'FUTURE_CLAIM_TIME_REJECTED', observedAt });
      continue;
    }
    admitted.push({
      claimId: idOf(claim) ?? stablePlanningId('model-claim', { topic, subjectId, source, observedAt, normalizedValue }),
      topic,
      subjectId,
      value: structuredClone(claim.value ?? claim.state ?? claim.claim),
      normalizedValue,
      source,
      observedAt,
      validUntil: optionalInstant(claim.validUntil),
      evidenceReferences: unique(claim.evidenceReferences ?? [source.reference]),
      sourceClass: text(claim.sourceClass) ?? 'UNSPECIFIED',
      decisionConsequence: text(claim.decisionConsequence),
      nextStep: text(claim.nextStep),
    });
  }
  const groups = new Map();
  for (const claim of admitted) {
    const key = `${claim.topic}:${claim.subjectId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(claim);
  }
  const disagreements = [];
  for (const [key, claims] of groups) {
    const distinctValues = unique(claims.map((claim) => claim.normalizedValue));
    const distinctSources = unique(claims.map((claim) => claim.source.sourceId));
    if (claims.length < 2 || distinctValues.length < 2 || distinctSources.length < 2) continue;
    const [topic, ...subjectParts] = key.split(':');
    const core = {
      topic,
      subjectId: subjectParts.join(':'),
      state: 'OPEN_DISAGREEMENT',
      claims: claims.sort((left, right) => left.source.sourceId.localeCompare(right.source.sourceId) || left.claimId.localeCompare(right.claimId)),
      claimA: claims[0],
      claimB: claims[1],
      sources: distinctSources,
      valuesAveraged: false,
      resolutionState: 'EVIDENCE_REQUIRED',
      decisionConsequence: text(claims.find((claim) => claim.decisionConsequence)?.decisionConsequence),
      nextStep: text(claims.find((claim) => claim.nextStep)?.nextStep) ?? 'Collect or admit an independent, decision-relevant observation; do not average the conflict away.',
      resolutionPlan: {
        state: 'EVIDENCE_REQUIRED',
        action: 'Collect or admit an independent, decision-relevant observation; do not average the conflict away.',
        execution: false,
      },
      detectedAt: asOf,
    };
    disagreements.push({ disagreementId: stablePlanningId('model-disagreement', core), ...core });
  }
  const core = {
    schemaVersion: 'vigia.model-disagreement-projection.v1',
    generatedAt: asOf,
    state: disagreements.length ? 'DISAGREEMENTS_PRESENT' : 'NO_ATTRIBUTABLE_DISAGREEMENT_DETECTED',
    disagreements,
    excludedClaims: excluded,
    truthBoundary: 'A disagreement is evidence about conflicting claims, not a resolution. Values are never averaged into a synthetic truth.',
  };
  return { ...core, projectionHash: semanticHash('model-disagreement-projection', core) };
}

export function projectRealityReconciliation(inputs, asOf) {
  const items = [];
  for (const input of rows(inputs)) {
    const estimateId = idOf(input, stablePlanningId('estimate', input));
    const modelId = text(input.modelId ?? input.expected?.modelId);
    const expected = input.expected?.value ?? input.expectedValue;
    const observed = input.observed?.value ?? input.observedValue;
    const expectedAt = optionalInstant(input.expected?.generatedAt ?? input.generatedAt);
    const observedAt = optionalInstant(input.observed?.observedAt ?? input.observedAt);
    const observedSource = normalizedSource(input.observed ?? input);
    const futureExpected = Boolean(expectedAt && isFuture(expectedAt, asOf));
    const futureObservation = Boolean(observedAt && isFuture(observedAt, asOf));
    const expectedPresent = expected !== undefined
      && expected !== null
      && Boolean(modelId && expectedAt)
      && !futureExpected;
    const observedPresent = observed !== undefined
      && observed !== null
      && Boolean(observedAt && observedSource.attributable)
      && !futureObservation;
    const expectedNumber = finite(expected);
    const observedNumber = finite(observed);
    const compatibleNumbers = expectedNumber !== null && observedNumber !== null;
    const delta = expectedPresent && observedPresent
      ? compatibleNumbers
        ? { state: 'CALCULATED', value: observedNumber - expectedNumber, unit: text(input.unit), direction: observedNumber === expectedNumber ? 'MATCHED' : observedNumber > expectedNumber ? 'ABOVE_EXPECTED' : 'BELOW_EXPECTED' }
        : { state: claimValue(expected) === claimValue(observed) ? 'MATCHED' : 'DIFFERENT', value: null, unit: null, direction: claimValue(expected) === claimValue(observed) ? 'MATCHED' : 'CATEGORICAL_DIFFERENCE' }
      : { state: 'UNKNOWN', value: null, unit: text(input.unit), direction: null };
    items.push({
      reconciliationId: stablePlanningId('reality-reconciliation', { estimateId, modelId, expectedAt, observedAt }),
      estimateId,
      modelId,
      state: !expectedPresent ? 'EXPECTED_VALUE_INCOMPLETE' : !observedPresent ? 'AWAITING_ATTRIBUTABLE_OBSERVATION' : 'RECONCILED',
      expected: expectedPresent
        ? { value: structuredClone(expected), generatedAt: expectedAt, validFor: optionalInstant(input.expected?.validFor ?? input.validFor), basis: text(input.expected?.basis ?? input.expectedBasis) }
        : futureExpected
          ? truthUnknown('The expected value was generated after the projection asOf and cannot participate in reconciliation.', { generatedAt: expectedAt, rejectionReason: 'FUTURE_EXPECTED_TIME_REJECTED' })
          : truthUnknown('A model identifier, value, and generation time are required.'),
      observed: observedPresent
        ? { value: structuredClone(observed), observedAt, source: observedSource, evidenceReferences: unique(input.observed?.evidenceReferences ?? input.evidenceReferences ?? [observedSource.reference]) }
        : futureObservation
          ? truthUnknown('The observation time is after the projection asOf and cannot be classified as observed or reconciled.', { observedAt, rejectionReason: 'FUTURE_OBSERVATION_TIME_REJECTED' })
          : truthUnknown('An attributable observed value and observation time are required.'),
      delta,
      why: text(input.why),
      decisionConsequence: text(input.decisionConsequence),
    });
  }
  const byModel = new Map();
  for (const item of items.filter((row) => row.modelId)) {
    if (!byModel.has(item.modelId)) byModel.set(item.modelId, []);
    byModel.get(item.modelId).push(item);
  }
  const modelPerformance = [...byModel.entries()].map(([modelId, modelItems]) => {
    const reconciled = modelItems.filter((item) => item.state === 'RECONCILED');
    const different = reconciled.filter((item) => item.delta.direction !== 'MATCHED');
    return {
      modelId,
      reconciledCount: reconciled.length,
      disagreementCount: different.length,
      repeatedErrorAssessment: reconciled.length < 2 ? 'INSUFFICIENT_REPEATED_OBSERVATIONS' : different.length >= 2 ? 'REPEATED_DIFFERENCE_OBSERVED' : 'NO_REPEATED_DIFFERENCE_OBSERVED',
      causalJudgement: 'NOT_INFERRED',
    };
  }).sort((left, right) => left.modelId.localeCompare(right.modelId));
  const core = {
    schemaVersion: 'vigia.reality-reconciliation.v1',
    generatedAt: asOf,
    state: items.length ? 'AVAILABLE' : 'NO_ESTIMATE_OBSERVATION_PAIRS',
    items,
    records: items,
    modelPerformance,
    truthBoundary: 'A delta is calculated only between explicit expected and attributable observed values. Repeated difference is descriptive performance evidence, not a causal explanation.',
  };
  return { ...core, projectionHash: semanticHash('reality-reconciliation', core) };
}

