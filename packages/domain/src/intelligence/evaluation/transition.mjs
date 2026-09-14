import { immutable, uniqueSorted } from '../shared.mjs';

function ids(items = [], key) { return new Set(items.map((item) => item[key])); }
function difference(left, right) { return [...left].filter((item) => !right.has(item)).sort(); }

export function explainEvidenceTransition(previous, current) {
  if (!previous) return immutable({
    from: null, to: current.state, changed: true,
    addedQualifyingEvidence: current.qualifyingEvidence.map((item) => item.evidenceId).sort(),
    removedQualifyingEvidence: [], newlySatisfiedRequirements: current.satisfiedRequirements.map((item) => item.id).sort(),
    newlyUnmetRequirements: current.unmetRequirements.map((item) => item.id).sort(),
    addedContradictions: current.contradictions.map((item) => item.evidenceId).sort(), removedContradictions: [],
    reasons: ['Initial deterministic evaluation from the bound evidence graph and contract.']
  });
  const priorEvidence = ids(previous.qualifyingEvidence, 'evidenceId'), currentEvidence = ids(current.qualifyingEvidence, 'evidenceId');
  const priorSatisfied = ids(previous.satisfiedRequirements, 'id'), currentSatisfied = ids(current.satisfiedRequirements, 'id');
  const priorUnmet = ids(previous.unmetRequirements, 'id'), currentUnmet = ids(current.unmetRequirements, 'id');
  const priorContradictions = ids(previous.contradictions, 'evidenceId'), currentContradictions = ids(current.contradictions, 'evidenceId');
  const changes = {
    addedQualifyingEvidence: difference(currentEvidence, priorEvidence), removedQualifyingEvidence: difference(priorEvidence, currentEvidence),
    newlySatisfiedRequirements: difference(currentSatisfied, priorSatisfied), newlyUnmetRequirements: difference(currentUnmet, priorUnmet),
    addedContradictions: difference(currentContradictions, priorContradictions), removedContradictions: difference(priorContradictions, currentContradictions)
  };
  const reasons = [];
  if (previous.state !== current.state) reasons.push(`Evidence state changed from ${previous.state} to ${current.state}.`);
  if (changes.addedQualifyingEvidence.length) reasons.push('New contract-qualifying causal evidence became available.');
  if (changes.removedQualifyingEvidence.length) reasons.push('Previously qualifying evidence no longer qualifies under the bound time and contract.');
  if (changes.addedContradictions.length) reasons.push('A qualifying contradiction became visible.');
  if (changes.removedContradictions.length) reasons.push('A prior contradiction is no longer unresolved and qualifying.');
  if (!reasons.length) reasons.push('No semantic evidence-state change occurred.');
  return immutable({ from: previous.state, to: current.state, changed: previous.state !== current.state || Object.values(changes).some((items) => items.length), ...changes, reasons: uniqueSorted(reasons) });
}
