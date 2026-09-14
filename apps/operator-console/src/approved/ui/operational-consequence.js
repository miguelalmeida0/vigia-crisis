import {e} from './html.js';

// Layer 7: OPERATOR PROJECTION.
//
// This module renders a consequence. It does not derive one. Every sentence and
// every ordering decision shown here was produced by the domain engine, so the
// operator surface and the engine cannot drift apart or disagree.
//
// The vocabulary rule for this surface: plain operational language only. No
// "dependency graph", "epistemic", "inference", "knowledge node", "confidence".

const ACTION_LABELS = Object.freeze({mission: 'Open affected mission', report: 'View field report', routes: 'Compare routes'});

/**
 * The actions this consequence supports, derived from what it actually points
 * at. An action is only offered when the record it opens exists.
 */
export function consequenceActions(consequence) {
  const first = consequence.serviceImpacts?.[0] ?? null;
  const mission = first?.missionImpacts?.[0] ?? null;
  const actions = [];
  if (mission) actions.push({cmd: 'mission', id: mission.missionId, label: ACTION_LABELS.mission, primary: true});
  if (consequence.trigger?.reportId) actions.push({cmd: 'report', id: consequence.trigger.reportId, label: ACTION_LABELS.report});
  // Comparing routes only makes sense where another stored route exists.
  const comparable = consequence.serviceImpacts?.find((row) => row.remainingOption)?.missionImpacts?.[0] ?? null;
  if (comparable) actions.push({cmd: 'routes', id: comparable.missionId, label: ACTION_LABELS.routes});
  return actions;
}

/**
 * Renders one consequence card for Important Now.
 * `btn` is the surrounding surface's button helper, so the card inherits the
 * product's existing command wiring rather than inventing its own.
 */
export function consequenceCard(consequence, {btn}) {
  const explanation = consequence.explanation ?? {};
  const lines = [explanation.whatChanged, explanation.whatElseIsAffected,
    ...(consequence.serviceImpacts ?? []).map((service) => (explanation.facts ?? [])
      .find((fact) => fact.key === 'SERVICE_OPTION' && fact.serviceId === service.serviceId)?.text),
    ...(explanation.whatNeedsAttention ?? []).slice(0, 1)].filter(Boolean);

  const checks = (explanation.whatNeedsChecking ?? []).slice(0, 3);
  const actions = consequenceActions(consequence).map((action) => btn(action.label, action.cmd, action.id, action.primary)).join('');

  return `<article class="mc-consequence"${consequence.expired ? ' data-expired="true"' : ''}>`
    + `<h3>${e(explanation.headline ?? 'Access needs attention')}</h3>`
    + lines.map((line) => `<p>${e(line)}</p>`).join('')
    + (explanation.whyItMatters ? `<details class="mc-why"><summary>Why this order?</summary><p>${e(explanation.whyItMatters)}</p></details>` : '')
    + (checks.length ? `<ul class="mc-checks">${checks.map((row) => `<li>${e(row)}</li>`).join('')}</ul>` : '')
    + `<p class="mc-meta">${e(consequence.trigger?.reporterName ? consequence.trigger.reporterName + ' · ' : '')}observed ${e(consequence.observedAt ?? '')} · received ${e(consequence.receivedAt ?? 'not recorded')}</p>`
    + `<p class="mc-meta">${e(explanation.truthBoundary ?? '')}</p>`
    + (actions ? `<div class="mc-actions">${actions}</div>` : '')
    + '</article>';
}

/** Important Now's consequence block. Returns '' when there is nothing derived. */
export function consequenceSection(result, {btn, limit = 2}) {
  const rows = (result?.consequences ?? []).slice(0, limit);
  if (!rows.length) return '';
  return rows.map((consequence) => consequenceCard(consequence, {btn})).join('');
}
