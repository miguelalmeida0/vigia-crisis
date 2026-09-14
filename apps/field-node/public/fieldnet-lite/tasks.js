import {
  $, ACTION_STORE, META_STORE, api, escapeHtml, formatTime, get, getAll, put, state, toast, uid
} from './core.js';
import { completionEvidenceFor } from './task-evidence.js';

export async function queueAction(action) {
  await put(ACTION_STORE, { ...action, status: 'PENDING', attempts: 0, updatedAt: action.createdAt });
  await renderQueue();
  if (navigator.onLine) flushQueue().catch(() => undefined);
}

export async function refreshTasks() {
  if (!state.session) return;
  try {
    const response = await api(`/api/fieldnet/incidents/${encodeURIComponent(state.session.incidentId)}/tasks`);
    if (!response.ok) throw new Error(`tasks_http_${response.status}`);
    const payload = await response.json();
    state.tasks = payload.tasks ?? [];
    await put(META_STORE, { key: 'tasks', value: state.tasks });
  } catch {
    const cached = await get(META_STORE, 'tasks');
    state.tasks = cached?.value ?? state.tasks;
  }
  renderTasks();
  renderLinkedTasks();
}

function taskEligible(task) {
  return !task.targetObserverClasses?.length || task.targetObserverClasses.includes(state.session?.observerClass);
}

export async function acknowledgeTask(taskId, disposition, safetyState) {
  const task = state.tasks.find((item) => item.taskId === taskId);
  if (!task || !state.session) return;
  const action = {
    id: uid('queue'), type: 'TASK_ACKNOWLEDGEMENT', method: 'POST',
    path: `/api/fieldnet/tasks/${encodeURIComponent(taskId)}/verification-acknowledgements`,
    body: { taskVersion: task.version, deviceId: state.session.deviceId, sessionId: state.session.sessionId, disposition, safetyState },
    incidentId: state.session.incidentId, taskId, summary: `${disposition.replaceAll('_', ' ')} · ${task.objective ?? task.requiredAction}`,
    createdAt: new Date().toISOString()
  };
  task.state = disposition === 'ACCEPTED' ? 'ACKNOWLEDGED_LOCAL_PENDING_SYNC' : 'BLOCKED_LOCAL_PENDING_SYNC';
  task.version += 1;
  await put(META_STORE, { key: 'tasks', value: state.tasks });
  await queueAction(action);
  renderTasks();
  toast('Acknowledgement saved locally.');
}

export async function completeTask(taskId) {
  const task = state.tasks.find((item) => item.taskId === taskId);
  const actions = await getAll(ACTION_STORE);
  const evidence = completionEvidenceFor(task, actions, state.session?.incidentId);
  if (!task || !evidence) return void toast('Link a matching incident-scoped report type to this task before completion.');
  await queueAction({
    id: uid('queue'), type: 'TASK_COMPLETION', method: 'POST', path: `/api/fieldnet/tasks/${encodeURIComponent(taskId)}/completion`,
    body: { taskVersion: task.version, evidenceObservationIds: [evidence.reportId] }, incidentId: state.session.incidentId,
    taskId, summary: `Evidence submitted · ${task.objective ?? task.requiredAction}`, createdAt: new Date().toISOString()
  });
  task.state = 'EVIDENCE_SUBMITTED_LOCAL_PENDING_SYNC';
  task.version += 1;
  await put(META_STORE, { key: 'tasks', value: state.tasks });
  renderTasks();
}

export function renderTasks() {
  const tasks = state.tasks.filter((task) => task.taskType === 'FIELD_VERIFICATION' && !['COMPLETED', 'CANCELLED'].includes(task.state));
  $('#task-count').textContent = String(tasks.length);
  $('#task-list').innerHTML = tasks.length ? tasks.map((task) => {
    const safe = task.safeZoneConstraint ?? {};
    const accepted = String(task.state).startsWith('ACKNOWLEDGED');
    const canComplete = accepted || String(task.state).startsWith('EVIDENCE_SUBMITTED');
    return `<article class="task-card" data-task-id="${escapeHtml(task.taskId)}">
      <div class="task-card__meta"><span>${escapeHtml(task.priority)}</span><span>Due ${escapeHtml(formatTime(task.dueAt))}</span><span>${escapeHtml(task.state.replaceAll('_', ' '))}</span></div>
      <h3>${escapeHtml(task.objective ?? task.requiredAction)}</h3>
      <p class="constraint"><strong>Safe-zone:</strong> ${escapeHtml(safe.instruction ?? 'No safe-zone instruction supplied')} (${escapeHtml(safe.mode ?? 'UNKNOWN')})</p>
      <p class="label">Required evidence</p><p>${escapeHtml((task.requiredEvidence ?? []).join(' · ') || 'Not specified')}</p>
      <div class="task-card__actions">
        ${canComplete ? `<button class="button button--primary" data-task-action="complete">Complete with linked report</button>` : `
          <button class="button button--primary" data-task-action="accept" ${taskEligible(task) ? '' : 'disabled'}>Accept safely</button>
          <button class="button button--danger" data-task-action="unsafe" ${taskEligible(task) ? '' : 'disabled'}>Unsafe</button>
          <button class="button" data-task-action="unavailable" ${taskEligible(task) ? '' : 'disabled'}>Unavailable</button>`}
      </div>
    </article>`;
  }).join('') : '<p class="empty">No open field-verification tasks in the last-good local view.</p>';
}

export function renderLinkedTasks() {
  const select = $('#linked-task');
  const selected = select.value;
  const tasks = state.tasks.filter((task) => task.taskType === 'FIELD_VERIFICATION' && !['COMPLETED', 'CANCELLED'].includes(task.state));
  select.innerHTML = '<option value="">No linked task</option>' + tasks.map((task) => `<option value="${escapeHtml(task.taskId)}">${escapeHtml(task.objective ?? task.requiredAction)}</option>`).join('');
  if (tasks.some((task) => task.taskId === selected)) select.value = selected;
}

export async function renderQueue() {
  const actions = (await getAll(ACTION_STORE)).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const actionable = actions.filter((item) => item.status !== 'NODE_ACKNOWLEDGED');
  $('#queue-count').textContent = String(actionable.length);
  $('#queue-list').innerHTML = actions.length ? actions.map((item) => `<article class="queue-card ${item.status === 'CONFLICT_REQUIRES_REVIEW' ? 'is-conflict' : item.status === 'NODE_ACKNOWLEDGED' ? 'is-sent' : ''}">
    <div class="queue-card__meta"><span>${escapeHtml(item.type.replaceAll('_', ' '))}</span><span>${escapeHtml(formatTime(item.createdAt))}</span></div>
    <h3>${escapeHtml(item.summary)}</h3>
    <p><strong>${escapeHtml(item.status.replaceAll('_', ' '))}</strong>${item.lastError ? ` · ${escapeHtml(item.lastError)}` : ''}</p>
    <p>Attempts: ${Number(item.attempts ?? 0)}</p>
  </article>`).join('') : '<p class="empty">Queue is empty.</p>';
}

export async function flushQueue() {
  if (state.flushing || !navigator.onLine || !state.session || !state.csrfToken) return;
  state.flushing = true;
  try {
    const actions = (await getAll(ACTION_STORE)).filter((item) => ['PENDING', 'SYNC_RETRY', 'SESSION_REQUIRED'].includes(item.status)).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    for (const action of actions) {
      try {
        const response = await api(action.path, { method: action.method, body: action.body });
        action.attempts = Number(action.attempts ?? 0) + 1;
        action.updatedAt = new Date().toISOString();
        if (response.ok) {
          const payload = await response.json();
          action.status = 'NODE_ACKNOWLEDGED';
          action.lastError = null;
          if (payload.task) {
            const index = state.tasks.findIndex((task) => task.taskId === payload.task.taskId);
            if (index >= 0) state.tasks[index] = payload.task;
            await put(META_STORE, { key: 'tasks', value: state.tasks });
          }
        } else {
          const payload = await response.json().catch(() => ({}));
          action.lastError = payload.error ?? `HTTP ${response.status}`;
          action.status = response.status === 409 ? 'CONFLICT_REQUIRES_REVIEW' : [401, 403].includes(response.status) ? 'SESSION_REQUIRED' : 'SYNC_RETRY';
          await put(ACTION_STORE, action);
          if (action.status === 'SESSION_REQUIRED') break;
          if (action.status === 'CONFLICT_REQUIRES_REVIEW') continue;
          break;
        }
        await put(ACTION_STORE, action);
      } catch (error) {
        action.attempts = Number(action.attempts ?? 0) + 1;
        action.status = 'SYNC_RETRY';
        action.lastError = error.message;
        action.updatedAt = new Date().toISOString();
        await put(ACTION_STORE, action);
        break;
      }
    }
    renderTasks();
    await renderQueue();
  } finally {
    state.flushing = false;
  }
}

export async function syncNow() {
  await flushQueue();
  if (!navigator.onLine || !state.session) return void toast('Still offline; browser actions remain queued.');
  try {
    const response = await api('/api/fieldnet/sync', { method: 'POST', body: {} });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `sync_http_${response.status}`);
    toast(payload.pending === 0 ? 'FieldNet node and central queue are synchronized.' : `${payload.pending} node item(s) remain pending.`);
    await refreshTasks();
  } catch (error) {
    toast(`Central sync not completed: ${error.message}`);
  }
}
