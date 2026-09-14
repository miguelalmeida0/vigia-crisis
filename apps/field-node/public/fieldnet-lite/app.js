import {
  $, $$, META_STORE, digest, formatTime, get, openDatabase, put, state, toast, uid
} from './core.js';
import { containsPii, mediaReference, renderReportFields, structuredAnswers } from './report.js';
import {
  acknowledgeTask, completeTask, flushQueue, queueAction, refreshTasks,
  renderLinkedTasks, renderQueue, renderTasks, syncNow
} from './tasks.js';

function updateConnectivity() {
  const element = $('#connectivity');
  const online = navigator.onLine;
  element.classList.toggle('is-online', online);
  element.classList.toggle('is-offline', !online);
  $('#connectivity-label').textContent = online ? 'Network available' : 'Offline — queueing locally';
}

function setSession(session, csrfToken = state.csrfToken) {
  state.session = session;
  state.csrfToken = csrfToken;
  const ready = Boolean(session);
  $('#session-status').textContent = ready ? 'Protected' : 'Not connected';
  $('#session-status').className = `status-chip ${ready ? 'status-chip--good' : 'status-chip--neutral'}`;
  $('#session-summary').textContent = ready
    ? `${session.observerClass.replaceAll('_', ' ')} · ${session.incidentId} · expires ${formatTime(session.expiresAt)}`
    : 'Waiting for an authorized launcher. The control key is never entered or stored in this browser.';
  $('#submit-report').disabled = !ready;
}

async function restoreSession() {
  const cached = await get(META_STORE, 'session');
  const cachedCurrent = cached?.value?.session && Date.parse(cached.value.session.expiresAt) > Date.now();
  if (cachedCurrent) setSession(cached.value.session, cached.value.csrfToken);
  try {
    const response = await fetch('/api/fieldnet/ui-session', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`session_http_${response.status}`);
    const payload = await response.json();
    setSession(payload.session, payload.csrfToken);
    await put(META_STORE, { key: 'session', value: { session: payload.session, csrfToken: payload.csrfToken } });
  } catch {
    if (!cachedCurrent) setSession(null);
    if (navigator.onLine && !cachedCurrent) toast('Open FieldNet Lite through the authorized field launcher.');
  }
}

function activateView(name) {
  $$('.tab').forEach((tab) => {
    const active = tab.dataset.view === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $$('[data-view-panel]').forEach((panel) => {
    const active = panel.dataset.viewPanel === name;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
}

function captureLocation() {
  if (!navigator.geolocation) {
    $('#form-error').textContent = 'This device does not provide geolocation.';
    return;
  }
  $('#capture-location').disabled = true;
  $('#location-value').textContent = 'Capturing…';
  navigator.geolocation.getCurrentPosition((position) => {
    state.location = {
      longitude: position.coords.longitude,
      latitude: position.coords.latitude,
      accuracyM: position.coords.accuracy,
      capturedAt: new Date(position.timestamp).toISOString()
    };
    $('#location-value').textContent = `${state.location.latitude.toFixed(5)}, ${state.location.longitude.toFixed(5)}`;
    $('#accuracy-value').textContent = `±${Math.round(state.location.accuracyM)} m`;
    $('#location-time').textContent = formatTime(state.location.capturedAt);
    $('#capture-location').disabled = false;
    $('#form-error').textContent = '';
  }, (error) => {
    $('#location-value').textContent = 'Not captured';
    $('#capture-location').disabled = false;
    $('#form-error').textContent = `GPS is required: ${error.message}`;
  }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 });
}

async function submitReport(event) {
  event.preventDefault();
  $('#form-error').textContent = '';
  if (!state.session) return void ($('#form-error').textContent = 'An authorized field session is required.');
  if (!state.location) return void ($('#form-error').textContent = 'Capture GPS before saving this report.');
  if (!event.currentTarget.reportValidity()) return;
  const form = new FormData(event.currentTarget);
  const note = String(form.get('note') ?? '').trim();
  if (containsPii(note)) return void ($('#form-error').textContent = 'Remove email addresses or phone numbers. FieldNet reports do not collect personal details by default.');
  const reportType = String(form.get('reportType'));
  const reportId = uid('field-report');
  const capturedAt = state.location.capturedAt;
  const files = [$('#media').files[0], $('#audio').files[0]].filter(Boolean);
  let mediaReferences;
  try {
    mediaReferences = (await Promise.all(files.map((file) => mediaReference(file, capturedAt)))).filter(Boolean);
  } catch (error) {
    $('#form-error').textContent = error.message;
    return;
  }
  const answers = structuredAnswers(reportType, form);
  if (containsPii(JSON.stringify(answers))) return void ($('#form-error').textContent = 'Remove email addresses or phone numbers. FieldNet reports do not collect personal details by default.');
  const report = {
    reportId, reportType, incidentId: state.session.incidentId, deviceId: state.session.deviceId,
    sessionId: state.session.sessionId, observedAt: capturedAt, receivedAt: new Date().toISOString(),
    connectivityAtCapture: navigator.onLine ? 'ONLINE' : 'OFFLINE',
    geometry: { type: 'Point', coordinates: [state.location.longitude, state.location.latitude] },
    horizontalUncertaintyM: state.location.accuracyM,
    bearingDegrees: form.get('bearing') === '' ? null : Number(form.get('bearing')),
    linkedTaskId: form.get('linkedTask') || null, structuredAnswers: answers,
    note: note || null, mediaReferences
  };
  report.rawEvidenceHash = await digest(JSON.stringify(report));
  await queueAction({
    id: uid('queue'), type: 'REPORT', method: 'POST', path: '/api/fieldnet/reports', body: { report },
    incidentId: report.incidentId, reportId, linkedTaskId: report.linkedTaskId, reportType,
    summary: `${reportType.replaceAll('_', ' ')} · ${state.location.latitude.toFixed(4)}, ${state.location.longitude.toFixed(4)}`,
    createdAt: new Date().toISOString()
  });
  event.currentTarget.reset();
  $('#report-type').value = reportType;
  renderReportFields();
  renderLinkedTasks();
  toast('Report saved to the durable local browser queue.');
}

function bindEvents() {
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => activateView(tab.dataset.view)));
  $('#capture-location').addEventListener('click', captureLocation);
  $('#report-type').addEventListener('change', renderReportFields);
  $('#report-form').addEventListener('submit', submitReport);
  $('#refresh-tasks').addEventListener('click', refreshTasks);
  $('#sync-now').addEventListener('click', syncNow);
  $('#task-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-task-action]');
    const card = event.target.closest('[data-task-id]');
    if (!button || !card) return;
    const handlers = {
      accept: () => acknowledgeTask(card.dataset.taskId, 'ACCEPTED', 'SAFE_TO_PROCEED'),
      unsafe: () => acknowledgeTask(card.dataset.taskId, 'DECLINED_UNSAFE', 'NOT_SAFE'),
      unavailable: () => acknowledgeTask(card.dataset.taskId, 'DECLINED_UNAVAILABLE', 'CANNOT_ASSESS'),
      complete: () => completeTask(card.dataset.taskId)
    };
    handlers[button.dataset.taskAction]?.();
  });
  window.addEventListener('online', () => { updateConnectivity(); restoreSession().then(flushQueue); });
  window.addEventListener('offline', updateConnectivity);
}

async function initialize() {
  state.db = await openDatabase();
  bindEvents();
  updateConnectivity();
  renderReportFields();
  setSession(null);
  await restoreSession();
  const cachedTasks = await get(META_STORE, 'tasks');
  state.tasks = cachedTasks?.value ?? [];
  renderTasks();
  renderLinkedTasks();
  await renderQueue();
  if (state.session) {
    await refreshTasks();
    flushQueue().catch(() => undefined);
  }
  captureLocation();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/fieldnet-lite/service-worker.js', { scope: '/fieldnet-lite/' }).catch(() => undefined);
}

initialize().catch((error) => {
  $('#form-error').textContent = `FieldNet Lite could not initialize: ${error.message}`;
});
