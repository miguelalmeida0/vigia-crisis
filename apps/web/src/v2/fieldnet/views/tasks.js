import { dateStamp, html, label } from '../format.js';

const action = (task, name, state, primary = false) => `<button type="button" class="${primary ? 'is-primary' : ''}" data-fieldnet-task-action="${state}" data-task-id="${html(task.taskId)}">${name}</button>`;

export function tasksView(model) {
  const tasks = [...model.tasks].sort((a, b) => Number(['P0_LIFE_SAFETY','P1_COMMAND'].includes(b.priority)) - Number(['P0_LIFE_SAFETY','P1_COMMAND'].includes(a.priority)));
  return `<section class="fieldnet-task-workspace"><header><div><span>LOCAL TASKS</span><h2>My field work</h2></div><p>${tasks.filter((item) => !['COMPLETED','CANCELLED'].includes(item.state)).length} active · actions persist locally before central acknowledgement</p></header><div class="fieldnet-task-list">${tasks.length ? tasks.map(taskCard).join('') : '<p class="fieldnet-empty">No task is packaged for this incident.</p>'}</div></section>`;
}

function taskCard(task) {
  const active = !['COMPLETED','CANCELLED'].includes(task.state), evidence = (task.requiredEvidence ?? []).map(label).join(' + ') || 'Operator note';
  return `<article class="fieldnet-task-card ${active ? 'is-active' : ''}"><header><div><span>${html(label(task.priority))}</span><strong>${html(label(task.state))}</strong></div><small>${task.dueAt ? `Due ${html(dateStamp(task.dueAt))}` : 'No due time supplied'}</small></header><h3>${html(task.requiredAction)}</h3><p>${html(task.subject?.place ?? task.subject?.distanceLabel ?? 'Incident location')} · ${html(label(task.locationQualification ?? 'location carried with task'))}</p><dl><div><dt>Why</dt><dd>${html(task.subject?.reason ?? 'Incident command requires field evidence')}</dd></div><div><dt>Required evidence</dt><dd>${html(evidence)}</dd></div><div><dt>Owner</dt><dd>${html(task.owner?.displayName ?? task.owner ?? 'Unassigned')}</dd></div><div><dt>Offline / sync</dt><dd>${html(task.syncState ? label(task.syncState) : 'Local task durable · sync state in queue')}</dd></div></dl>${active ? `<footer><button type="button" data-map-frame-kind="TASK" data-map-frame-id="${html(task.taskId)}">Show on map</button>${['OPEN','ASSIGNED'].includes(task.state) ? action(task, 'Acknowledge', 'ACKNOWLEDGED', true) : ''}${task.state === 'ACKNOWLEDGED' ? action(task, 'Start', 'IN_PROGRESS', true) : ''}${['ACKNOWLEDGED','IN_PROGRESS'].includes(task.state) ? action(task, 'Blocked', 'BLOCKED') : ''}${['IN_PROGRESS','EVIDENCE_SUBMITTED'].includes(task.state) ? action(task, 'Complete', 'COMPLETED') : ''}</footer>` : ''}</article>`;
}
