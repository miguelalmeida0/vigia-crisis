import {verification} from '../fieldnet/mission-command.mjs';

// EVIDENCE STRENGTH.
//
// One responder saying a road is blocked, two independent responders saying it,
// and a published restriction saying it are three different operational facts.
// Treating them as one loses the distinction an incident commander needs most.
//
// The rule that must never bend: corroboration raises how far an observation can
// be relied on. It does NOT convert an observation into an official closure.
// Only an admitted authoritative restriction does that, and no amount of field
// agreement substitutes for one.

export const EVIDENCE_STATES = Object.freeze([
  'AUTHORITATIVE_RESTRICTION',
  'MULTI_RESPONDER_CONFIRMED',
  'SINGLE_FIELD_OBSERVATION',
  'CONFLICTING_FIELD_REPORTS'
]);

const RELIANCE = Object.freeze({
  AUTHORITATIVE_RESTRICTION: 'OFFICIAL_RECORD',
  MULTI_RESPONDER_CONFIRMED: 'CORROBORATED_OBSERVATION',
  SINGLE_FIELD_OBSERVATION: 'UNCORROBORATED_OBSERVATION',
  CONFLICTING_FIELD_REPORTS: 'DISPUTED_OBSERVATION'
});

const TEXT = Object.freeze({
  AUTHORITATIVE_RESTRICTION: 'A published restriction records this.',
  MULTI_RESPONDER_CONFIRMED: 'A second responder independently confirmed this observation.',
  SINGLE_FIELD_OBSERVATION: 'One responder reported this. It has not been confirmed by anyone else.',
  CONFLICTING_FIELD_REPORTS: 'Responders disagree about this location.'
});

/** Rank for ordering only — never rendered, never combined into a score. */
export const evidenceRank = (state) => EVIDENCE_STATES.indexOf(state);

/**
 * Classifies the evidence behind one trigger.
 *
 * `establishesOfficialClosure` stays false for every field-sourced state, no
 * matter how many responders agree. That is the whole point of this module.
 */
export function evidenceStrength(trigger) {
  if (trigger?.kind === 'OFFICIAL_RESTRICTION') {
    return {
      state: 'AUTHORITATIVE_RESTRICTION',
      reliance: RELIANCE.AUTHORITATIVE_RESTRICTION,
      text: TEXT.AUTHORITATIVE_RESTRICTION,
      establishesOfficialClosure: trigger.establishesOfficialClosure === true,
      confirmingResponderCount: 0,
      confirmationIds: []
    };
  }

  const confirmations = trigger?.confirmations ?? [];
  // Reuse the product's own confirmation rules rather than recounting rows:
  // it already handles one-response-per-responder and self-confirmation.
  const result = verification({id: trigger?.reportId, senderId: trigger?.reporterId ?? null}, confirmations);
  const agreeing = result.responses.filter((row) => row.answer === 'CONFIRM');
  const state = result.state === 'CONFLICTING_REPORTS'
    ? 'CONFLICTING_FIELD_REPORTS'
    : result.state === 'FIELD_CONFIRMED' ? 'MULTI_RESPONDER_CONFIRMED' : 'SINGLE_FIELD_OBSERVATION';

  return {
    state,
    reliance: RELIANCE[state],
    text: TEXT[state],
    // A field observation never establishes an official closure. Ever.
    establishesOfficialClosure: false,
    confirmingResponderCount: state === 'MULTI_RESPONDER_CONFIRMED' ? agreeing.length : 0,
    confirmationIds: agreeing.map((row) => row.id).filter(Boolean).sort(),
    disputed: state === 'CONFLICTING_FIELD_REPORTS'
  };
}

/**
 * What the operator may act on, given the evidence. Deliberately not a
 * recommendation: it states what the record supports, and the decision stays
 * with the human.
 */
export function relianceGuidance(strength, {hasAlternative}) {
  if (strength.state === 'CONFLICTING_FIELD_REPORTS') return 'Responders disagree. Confirm before relying on either account.';
  if (strength.state === 'AUTHORITATIVE_RESTRICTION') return 'This is an official record and does not need field confirmation.';
  if (strength.state === 'MULTI_RESPONDER_CONFIRMED') {
    return hasAlternative
      ? 'Two responders agree. Another stored route remains, condition unconfirmed.'
      : 'Two responders agree, and no other current route is stored.';
  }
  return hasAlternative
    ? 'One unconfirmed report. Another stored route remains, condition unconfirmed.'
    : 'One unconfirmed report, and no other current route is stored. Confirm before relying on this.';
}
