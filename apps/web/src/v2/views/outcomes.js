import { escapeHtml } from '../utils/html.js';
import { compactDuration, dateTime, statusLabel } from '../utils/format.js';
export const outcomeFilters = [['all','All'],['complete','Closed loops']];
function actorName(state, id) { return state.bootstrap.control.actors.find((actor) => actor.id === id)?.name ?? id ?? 'Unknown'; }
function metricCards(outcomes) {
  const m = outcomes.metrics; const remediationLabel = m.remediationSampleSize < 3 ? 'Remediation duration' : 'Median remediation time';
  return `<div class="metric-cards"><article class="metric-card"><strong>${m.verifiedHazards}</strong><span>Verified hazards</span></article><article class="metric-card"><strong>${m.closedLoops}</strong><span>Closed local review loops</span></article><article class="metric-card"><strong>UNMEASURED</strong><span>Exposure change</span></article><article class="metric-card"><strong>${compactDuration(m.medianRemediationHours)}</strong><span>${remediationLabel}${m.remediationSampleSize ? ` · n=${m.remediationSampleSize}` : ''}</span></article></div>`;
}
function proofCard(label, image, title, body, meta) {
  return `<article class="proof-card"><div class="proof-image">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(label)} evidence">` : '<span>No image</span>'}</div><span>${escapeHtml(label)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p><small>${escapeHtml(meta)}</small></article>`;
}
function loop(state, value) {
  const before = value.beforeEvidence; const completion = value.completionEvidence; const after = value.reobservation; const method = value.methodology;
  return `<section class="outcome-proof"><header><div><span>CLOSED LOCAL REVIEW LOOP</span><h3>${escapeHtml(value.remediation.title)}</h3></div><strong>${escapeHtml(value.remediation.priority.toUpperCase())}</strong></header><div class="proof-flow">${proofCard('BEFORE',value.proof.beforeImage,value.hazard?.title ?? 'Verified hazard',value.hazard?.evidenceNote ?? 'Accepted evidence established the condition.',`${actorName(state,before?.observerId)} · ${dateTime(before?.capturedAt)}`)}<b>→</b>${proofCard('ACTION',value.proof.completionImage,value.remediation.title,completion?.note ?? value.remediation.recommendation,`${actorName(state,value.remediation.ownerId)} · ${dateTime(completion?.capturedAt)}`)}<b>→</b>${proofCard('REVIEW',value.proof.afterImage,statusLabel(after?.outcome ?? 'Re-observed'),after?.note ?? 'Supervisor-recorded re-observation retained.',`${actorName(state,value.proof.reviewerId)} · ${dateTime(after?.observedAt)}`)}</div><div class="outcome-method"><div><span>EXPOSURE CHANGE</span><strong>UNMEASURED</strong><p>${escapeHtml(method.limitation)}</p></div><div><span>REVIEW INDEPENDENCE</span><strong>NOT VALIDATED</strong><p>Supervisor-recorded re-observation; actor/source independence is not yet enforced.</p></div></div></section>`;
}
export function outcomesWorkbench(state) {
  const outcomes = state.bootstrap.outcomes; if (outcomes.restricted) return `<div class="observation-empty"><h3>Outcome access restricted.</h3><p>This role cannot view organization-level outcome evidence.</p></div>`;
  const loops = outcomes.loops.map((value) => loop(state,value)).join('');
  return `<div class="workbench-head"><div><span>OUTCOME REVIEW</span><h2>Review closed evidence loops.</h2></div><p>These records show evidence, action and supervisor-recorded re-observation. They do not prove causal safety improvement.</p></div>${metricCards(outcomes)}<div class="outcome-methodology"><strong>Measurement boundary</strong><p>${escapeHtml(outcomes.methodology.exposureChange)} ${escapeHtml(outcomes.methodology.remediationTime)}</p><button type="button" class="secondary-action" data-action="audit">Open local transition log</button></div>${loops || '<p class="queue-empty" style="max-width:1100px;margin:30px auto">No closed local review loops yet.</p>'}`;
}
