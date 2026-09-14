import { semanticHash } from '../intelligence/shared.mjs';
import {
  PROTECTION_LANGUAGES, PROTECTION_MESSAGE_FIELDS, PROTECTION_TIMELINE_WINDOWS_MINUTES,
  applyCapProtectionTransition, normalizedSource, optionalInstant, stablePlanningId,
} from './contracts.mjs';
import {
  admissionState, idOf, isCurrentPlanningContext, projectionEnvelope, rows, text, unique,
} from './projection-helpers.mjs';

export function projectProtectionTimeline(scenario, asOf) {
  const validUntil = optionalInstant(scenario?.validUntil);
  const source = normalizedSource(scenario ?? {});
  const admitted = scenario && admissionState(scenario) && text(scenario.admissionReference) && source.attributable && validUntil && Date.parse(validUntil) > Date.parse(asOf);
  const byMinute = new Map(rows(scenario?.windows).map((window) => [Number(window.minutes ?? window.minute), window]));
  const windows = PROTECTION_TIMELINE_WINDOWS_MINUTES.map((minutes) => {
    const input = byMinute.get(minutes);
    const exposure = input?.scenarioExposure ?? input?.exposure;
    const windowSource = normalizedSource(input ?? {}), effectiveSource = windowSource.attributable ? windowSource : source;
    const computedAt = optionalInstant(input?.computedAt ?? input?.updatedAt ?? input?.observedAt);
    const admissionReference = text(input?.admissionReference ?? scenario?.admissionReference);
    const evidenceReferences = unique(input?.evidenceReferences ?? []);
    const confidenceState = text(input?.confidence?.state ?? input?.confidence);
    const requiredPreparation = rows(input?.requiredPreparation).map((item) => typeof item === 'string' ? item : structuredClone(item));
    const decisionDeadline = optionalInstant(input?.decisionDeadline);
    const calculationMethod = text(input?.calculationMethod ?? input?.method);
    const invalidReasons = [
      !admitted ? 'NO_VALID_ADMITTED_SCENARIO' : null,
      exposure === undefined || exposure === null ? 'SCENARIO_WINDOW_NOT_SUPPLIED' : null,
      !effectiveSource.attributable ? 'ATTRIBUTABLE_WINDOW_SOURCE_REQUIRED' : null,
      !admissionReference ? 'WINDOW_ADMISSION_REFERENCE_REQUIRED' : null,
      !evidenceReferences.length ? 'WINDOW_EVIDENCE_REFERENCES_REQUIRED' : null,
      !computedAt ? 'WINDOW_COMPUTATION_TIME_REQUIRED' : null,
      computedAt && Date.parse(computedAt) > Date.parse(asOf) ? 'FUTURE_WINDOW_COMPUTATION_REJECTED' : null,
      computedAt && !isCurrentPlanningContext({ updatedAt: computedAt }, asOf) ? 'STALE_WINDOW_COMPUTATION_REJECTED' : null,
      !confidenceState ? 'WINDOW_CONFIDENCE_REQUIRED' : null,
      !requiredPreparation.length ? 'WINDOW_PREPARATION_REQUIRED' : null,
      !decisionDeadline || Date.parse(decisionDeadline) <= Date.parse(asOf) ? 'FUTURE_DECISION_DEADLINE_REQUIRED' : null,
      decisionDeadline && validUntil && Date.parse(decisionDeadline) > Date.parse(validUntil) ? 'DECISION_DEADLINE_EXCEEDS_SCENARIO_VALIDITY' : null,
      !calculationMethod ? 'WINDOW_CALCULATION_METHOD_REQUIRED' : null,
    ].filter(Boolean);
    if (invalidReasons.length) return {
      minutes,
      state: 'WITHHELD',
      scenarioExposure: null,
      confidence: { state: 'UNKNOWN', score: null },
      requiredPreparation: [],
      decisionDeadline: null,
      reason: invalidReasons[0],
      invalidReasons,
    };
    return {
      minutes,
      state: 'SCENARIO_AVAILABLE',
      scenarioExposure: structuredClone(exposure),
      confidence: typeof input.confidence === 'object' ? structuredClone(input.confidence) : { state: confidenceState, score: null },
      requiredPreparation,
      decisionDeadline,
      assumptions: unique(input.assumptions ?? []),
      evidenceReferences,
      admissionReference,
      source: effectiveSource,
      computedAt,
      calculationMethod,
      computationState: 'COMPUTED_FROM_ADMITTED_EVIDENCE',
      deterministicPrediction: false,
    };
  });
  const core = {
    schemaVersion: 'vigia.protection-bubble-timeline.v1',
    generatedAt: asOf,
    state: admitted ? (windows.some((window) => window.state === 'SCENARIO_AVAILABLE') ? 'ADMITTED_SCENARIO_WINDOWS_AVAILABLE' : 'ADMITTED_SCENARIO_WITHOUT_WINDOWS') : 'WITHHELD_NO_VALID_ADMITTED_SCENARIO',
    scenario: admitted ? { scenarioId: idOf(scenario), source, validUntil, admissionReference: text(scenario.admissionReference) } : null,
    windows,
    authorityState: 'PLANNING_ONLY',
    deterministic: false,
    execution: false,
    truthBoundary: 'A 15/30/60/120-minute window is exposed only with a valid admitted scenario, attributable evidence references, a non-future computation time, method, confidence, preparation, and future decision deadline. Missing or incomplete windows stay withheld; no interpolation or deterministic arrival prediction is created.',
  };
  return { ...core, projectionHash: semanticHash('protection-bubble-timeline', core) };
}

export function projectCapProtection(input, canonicalMessage, asOf) {
  if (!input) return projectionEnvelope('vigia.cap-protection-lifecycle.v1', 'NO_LIFECYCLE_RECORD', null, 'No CAP protection lifecycle record was supplied.');
  let state = 'DRAFT';
  const transitions = [];
  const rejectedTransitions = [];
  let lastTransitionAt = null;
  for (const event of rows(input.events)) {
    try {
      const requestedAt = optionalInstant(event.at ?? event.occurredAt);
      if (requestedAt && Date.parse(requestedAt) > Date.parse(asOf)) throw new Error('cap_protection_future_transition_rejected');
      if (requestedAt && lastTransitionAt && Date.parse(requestedAt) < Date.parse(lastTransitionAt)) throw new Error('cap_protection_transition_chronology_invalid');
      if (String(event.action ?? event.type ?? '').toUpperCase().replaceAll(' ', '_') === 'EXERCISE_SEND' && String(input.mode ?? '').toUpperCase() !== 'EXERCISE') throw new Error('cap_protection_exercise_send_requires_exercise_lifecycle');
      const transition = applyCapProtectionTransition(state, event);
      transitions.push({ ...transition, eventId: idOf(event, stablePlanningId('cap-protection-event', event)) });
      state = transition.nextState;
      lastTransitionAt = transition.at;
    } catch (error) {
      rejectedTransitions.push({ eventId: idOf(event), previousState: state, requestedAction: text(event.action ?? event.type), reason: error.message });
    }
  }
  const core = {
    schemaVersion: 'vigia.cap-protection-lifecycle.v1',
    protectionId: idOf(input, stablePlanningId('cap-protection', input)),
    generatedAt: asOf,
    mode: text(input.mode)?.toUpperCase() ?? 'LIVE',
    currentState: state,
    canonicalMessageId: canonicalMessage?.messageId ?? canonicalMessage?.value?.messageId ?? null,
    transitions,
    lifecycle: { currentState: state, history: transitions },
    history: transitions,
    rejectedTransitions,
    authority: input.authority ? structuredClone(input.authority) : null,
    liveSendEnabled: false,
    exerciseSendRecorded: transitions.some((transition) => transition.action === 'EXERCISE_SEND'),
    liveSendRecorded: false,
    executionClaimed: false,
    truthBoundary: 'This guard validates a persisted lifecycle projection. It cannot send a live warning. Approval requires attributable authority evidence; receipt is distinct from send and requires its own reference.',
  };
  return { ...core, state: rejectedTransitions.length ? 'INVALID_TRANSITIONS_PRESENT' : 'LIFECYCLE_VALID', projectionHash: semanticHash('cap-protection-lifecycle', core) };
}

function normalizedProtectionMessage(message) {
  return Object.fromEntries(PROTECTION_MESSAGE_FIELDS.map((field) => [field, text(message?.[field])]));
}

function protectionMessageStructure(message) {
  return {
    WHAT_HAPPENED: message.whatHappened,
    WHERE: message.where,
    WHO_IS_AFFECTED: message.whoIsAffected,
    WHAT_TO_DO: message.whatToDo,
    WHAT_NOT_TO_DO: message.whatNotToDo,
    WHEN: message.when,
    AUTHORITY: message.authority,
    NEXT_UPDATE: message.nextUpdate,
  };
}

export function projectMultilingualComposer(input, asOf) {
  if (!input) return projectionEnvelope('vigia.multilingual-protection-composer.v1', 'NO_CANONICAL_MESSAGE', null, 'No canonical protection message was supplied.');
  const canonicalLanguage = text(input.canonicalLanguage)?.toLowerCase();
  const canonical = normalizedProtectionMessage(input.canonicalMessage ?? input.message);
  const canonicalComplete = PROTECTION_MESSAGE_FIELDS.every((field) => canonical[field]);
  const canonicalSourceReference = text(input.sourceReference);
  if (!PROTECTION_LANGUAGES.includes(canonicalLanguage) || !canonicalComplete || !canonicalSourceReference) return projectionEnvelope('vigia.multilingual-protection-composer.v1', 'CANONICAL_MESSAGE_INCOMPLETE', {
    canonicalLanguage,
    canonical,
    missingFields: [...PROTECTION_MESSAGE_FIELDS.filter((field) => !canonical[field]), ...(!canonicalSourceReference ? ['sourceReference'] : [])],
    translationsGenerated: false,
    execution: false,
  }, 'A supported canonical language, source reference, and all canonical warning fields are required.');
  const variants = Object.fromEntries(PROTECTION_LANGUAGES.map((language) => {
    if (language === canonicalLanguage) return [language, { state: 'CANONICAL_READY', language, message: canonical, structure: protectionMessageStructure(canonical), translator: null, sourceReference: canonicalSourceReference, generated: false }];
    const supplied = input.translations?.[language];
    const translated = normalizedProtectionMessage(supplied?.message ?? supplied);
    const missingFields = PROTECTION_MESSAGE_FIELDS.filter((field) => !translated[field]);
    const translator = text(supplied?.translator ?? supplied?.source?.name ?? supplied?.sourceId);
    const sourceReference = text(supplied?.reference ?? supplied?.source?.reference);
    const ready = supplied && !missingFields.length && translator && sourceReference;
    return [language, {
      state: ready ? 'PROVIDED_TRANSLATION_READY' : supplied ? 'PROVIDED_TRANSLATION_INCOMPLETE_OR_UNATTRIBUTED' : 'TRANSLATION_REQUIRED',
      language,
      message: ready ? translated : null,
      structure: ready ? protectionMessageStructure(translated) : null,
      translator: ready ? translator : null,
      sourceReference: ready ? sourceReference : null,
      missingFields,
      generated: false,
    }];
  }));
  const core = {
    schemaVersion: 'vigia.multilingual-protection-composer.v1',
    messageId: idOf(input, stablePlanningId('protection-message', { canonicalLanguage, canonical })),
    generatedAt: asOf,
    canonicalLanguage,
    canonicalMessage: canonical,
    canonicalStructure: protectionMessageStructure(canonical),
    variants,
    translations: variants,
    readyLanguages: PROTECTION_LANGUAGES.filter((language) => ['CANONICAL_READY', 'PROVIDED_TRANSLATION_READY'].includes(variants[language].state)),
    translationsGenerated: false,
    authorityState: 'NOT_INFERRED',
    sendState: 'NOT_SENT',
    execution: false,
    truthBoundary: 'Only operator-supplied canonical text and attributable supplied translations are projected. VIGIA does not invent or silently machine-translate protection language in this contract.',
  };
  return { ...core, state: core.readyLanguages.length === PROTECTION_LANGUAGES.length ? 'ALL_LANGUAGES_READY' : 'TRANSLATIONS_REQUIRED', projectionHash: semanticHash('multilingual-protection-composer', core) };
}

