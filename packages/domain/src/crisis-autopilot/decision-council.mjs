import { COMMAND_STAFF_ROLES, validInstant } from './contracts.mjs';

const COUNCIL_REVIEWS = Object.freeze([
  ['counterargument', 'COUNTERARGUMENT'],
  ['evidence', 'EVIDENCE_REVIEW'],
  ['authority', 'AUTHORITY_REVIEW'],
  ['safety', 'SAFETY_REVIEW'],
  ['delay', 'CONSEQUENCE_OF_DELAY'],
  ['alternatives', 'ALTERNATIVES'],
]);

function councilReview(value, { asOf, multiple = false } = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const reviewerRole = String(input.reviewerRole ?? input.reviewer ?? '').toUpperCase();
  const reviewedAt = validInstant(input.reviewedAt);
  const raw = input.content ?? input.summary ?? input.value ?? (multiple ? input.items : null);
  const content = multiple
    ? [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))].slice(0, 8)
    : typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  const missing = [];
  if (input.state !== 'COMPLETE') missing.push('REVIEW_STATE_NOT_COMPLETE');
  if (!COMMAND_STAFF_ROLES.includes(reviewerRole)) missing.push('REVIEWER_ROLE_INVALID');
  if (!reviewedAt || Date.parse(reviewedAt) > Date.parse(asOf)) missing.push('REVIEW_TIME_INVALID_OR_FUTURE');
  if (multiple ? !content.length : !content) missing.push('CONTENT_MISSING');
  const rawReferences = input.basisReferences ?? input.evidenceReferences;
  return {
    state: missing.length ? 'MISSING_OR_INVALID' : 'COMPLETE',
    reviewerRole: reviewerRole || null,
    reviewedAt,
    content,
    basisReferences: [...new Set((Array.isArray(rawReferences) ? rawReferences : rawReferences ? [rawReferences] : []).map(String))].sort().slice(0, 12),
    missing,
  };
}

export function projectDecisionCouncil({ decisions, decisionCompression, decisionHalfLife, asOf }) {
  const context = new Map(decisions.map((item) => [item.decisionId, item]));
  const validity = new Map(decisionHalfLife.items.map((item) => [item.decisionId, item]));
  const items = decisionCompression.decisionsNow.map((item) => {
    const full = context.get(item.decisionId) ?? item;
    const halfLife = validity.get(item.decisionId) ?? null;
    const supplied = full.councilReviews ?? {};
    const reviews = Object.fromEntries(COUNCIL_REVIEWS.map(([key]) => [key, councilReview(supplied[key], { asOf, multiple: key === 'alternatives' })]));
    const missingReviews = COUNCIL_REVIEWS.filter(([key]) => reviews[key].state !== 'COMPLETE').map(([, label]) => label);
    const proposal = { state: full.recommendedAction ? 'PRESENT' : 'MISSING', content: full.recommendedAction ?? null };
    const validityReview = {
      state: halfLife?.state ?? 'MISSING',
      validUntil: halfLife?.validUntil ?? null,
      invalidatingCondition: halfLife?.nextInvalidatingCondition ?? null,
      content: halfLife ? `Valid until ${halfLife.validUntil ?? 'unknown'}; next invalidating condition: ${halfLife.nextInvalidatingCondition ?? 'unknown'}.` : null,
    };
    const admitted = Boolean(proposal.content && halfLife?.state === 'VALID' && missingReviews.length === 0);
    return {
      decisionId: item.decisionId,
      proposal,
      counterargument: reviews.counterargument,
      evidenceReview: reviews.evidence,
      authorityReview: reviews.authority,
      safetyReview: reviews.safety,
      consequenceOfDelay: reviews.delay,
      alternatives: reviews.alternatives,
      validityReview,
      missingReviews,
      finalRecommendation: admitted ? full.recommendedAction : null,
      finalRecommendationState: admitted
        ? 'ADVISORY_VALID_WITHIN_WINDOW'
        : !proposal.content
          ? 'WITHHELD_NO_PROPOSAL'
          : !halfLife
            ? 'WITHHELD_NO_VALIDITY_CONTRACT'
            : halfLife.state !== 'VALID'
              ? `WITHHELD_${halfLife.state}`
              : 'WITHHELD_INCOMPLETE_COUNCIL_TUPLE',
      humanDecisionRequired: full.humanDecisionRequired,
      advisoryOnly: true,
      canMutateCanonicalTruth: false,
      canApproveAuthority: false,
      canClaimExecution: false,
    };
  });
  return {
    schemaVersion: 'vigia.adversarial-decision-council.v2',
    requiredTuple: ['PROPOSAL', ...COUNCIL_REVIEWS.map(([, label]) => label), 'FINAL_RECOMMENDATION'],
    items,
    safetyBoundary: 'Council output is inspectable dissent and advisory synthesis only. A final recommendation is withheld until every explicit review is complete and its validity window remains current. Final authority and consequential mutation remain human/governed workflow responsibilities.',
  };
}
