import { escapeHtml } from '../utils/html.js';
import { dateTime, relativeTime, statusLabel } from '../utils/format.js';
import { summaryHero } from '../components/primitives.js';

function assigned(state) {
  const requests = state.bootstrap.operations.evidenceRequests.filter((item) => item.ownerId === state.actorId && !['accepted','cancelled'].includes(item.state));
  const remediations = state.bootstrap.operations.remediations.filter((item) => item.ownerId === state.actorId && !['closed','cancelled'].includes(item.state));
  return { requests, remediations };
}
export function fieldSummary(state) {
  const { requests, remediations } = assigned(state);
  return summaryHero(requests.length + remediations.length, 'assignments ready for field action', 'Each assignment carries required evidence, due time, ownership and an auditable completion state.', [
    { value: requests.length, label: 'evidence requests' }, { value: remediations.length, label: 'remediations' }, { value: navigator.onLine ? 'Online' : 'Offline', label: 'capture state' }
  ]);
}
export const fieldFilters = [['all','All'],['open','Open'],['urgent','Urgent'],['complete','Complete']];
function card(item, kind) {
  const requirements = kind === 'request' ? item.requirements ?? [] : ['Completion overview image','GPS position','Completion note'];
  return `<article class="field-assignment ${item.priority === 'urgent' ? 'is-urgent' : ''}"><header><div><span>${kind === 'request' ? 'EVIDENCE REQUEST' : 'REMEDIATION'}</span><h3>${escapeHtml(item.title)}</h3></div><strong>${escapeHtml(statusLabel(item.priority ?? 'normal'))}</strong></header><div class="field-assignment-meta"><span>${escapeHtml(statusLabel(item.state))}</span><span>Due ${escapeHtml(dateTime(item.dueAt))}</span><span>Updated ${escapeHtml(relativeTime(item.updatedAt ?? item.createdAt))}</span></div><ul>${requirements.slice(0,4).map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul><button type="button" class="primary-action" data-operation-kind="${kind}" data-operation-id="${escapeHtml(item.id)}">Open assignment</button></article>`;
}
export function fieldWorkbench(state) {
  const { requests, remediations } = assigned(state);
  const cards = [...requests.map((item) => card(item,'request')), ...remediations.map((item) => card(item,'action'))].join('');
  return `<div class="workbench-head field-head"><div><span>FIELD OPERATIONS</span><h2>Capture evidence for local review.</h2></div><p>Observer, time, location source, GPS accuracy, images and notes travel together. Offline operations queue in browser storage and sync idempotently; browser storage is not guaranteed durable.</p></div><div class="field-readiness"><span class="status-pill good"><i></i>${navigator.onLine ? 'Online' : 'Offline queue prototype'}</span><span>GPS requested during capture</span><span>Image attachment supported</span><span>Local content checksum recorded</span></div><div class="field-grid">${cards || '<div class="field-empty"><h3>No active assignments.</h3><p>This role has no work assigned right now. Command and supervisors can create an attributable field request.</p></div>'}</div><div class="field-launch"><a class="primary-action" href="/field/">Open field capture</a><span>Optimized for mobile capture; identity, storage and media provenance remain deployment gates.</span></div>`;
}
