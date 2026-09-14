import { FieldNetClient } from './fieldnet/client.js';
import { emptyModel, fieldNetSummary, loadFieldNet, refreshFieldNet } from './fieldnet/model.js';
import { renderFieldNetShell, renderIncidentEntry } from './fieldnet/shell.js';
import { OfflineFieldMap } from './fieldnet/offline-map.js';
import { mapSelection } from './fieldnet/views/command.js';
import { observationFromForm } from './fieldnet/views/observe.js';
import { replayLength, replayMapContract } from './fieldnet/views/replay.js';

const shell = document.querySelector('[data-fieldnet-shell]');
const client = new FieldNetClient();
let model = emptyModel(), map = null, nodeSummary = null, nodeIncidentId = null, poll = null, eventRefresh = null;
const nodeEvents = ['READY','CONNECTION_STATE_CHANGED','FIELD_OBSERVATION_ADDED','TASK_CREATED','TASK_ACKNOWLEDGED','TASK_UPDATED','CONFLICT_CREATED','CONFLICT_RESOLVED','DEVICE_REGISTERED','SYNC_COMPLETED'];

function render() {
  map?.destroy(); map = null;
  shell.innerHTML = renderFieldNetShell(model, client.baseUrl);
  shell.dataset.connectionState = model.node?.connectionState ?? 'UNKNOWN';
  shell.dataset.workspaceLoadMs = model.timings?.workspaceLoadMs ?? '';
  shell.dataset.mapLoadMs = model.timings?.mapLoadMs ?? '';
  const canvas = shell.querySelector('[data-fieldnet-map],[data-fieldnet-replay-map]');
  if (canvas) map = new OfflineFieldMap(canvas, model.map, (feature) => {
    const target = shell.querySelector('[data-fieldnet-map-selection]');
    if(target){target.innerHTML = mapSelection(feature); target.hidden = false;}
  });
  if(canvas?.matches('[data-fieldnet-replay-map]'))map.setContract(replayMapContract(model));
}

async function refreshEntries() {
  try {
    const loaded = await loadFieldNet(client, nodeIncidentId);
    nodeSummary = fieldNetSummary(loaded); nodeIncidentId = loaded.incidentId;
    document.querySelectorAll('[data-fieldnet-entry]').forEach((entry) => {
      const content = renderIncidentEntry(nodeSummary, nodeIncidentId, entry.dataset.incidentId, loaded);
      entry.innerHTML = content; entry.hidden = !content;
    });
  } catch { document.querySelectorAll('[data-fieldnet-entry]').forEach((entry) => { entry.hidden = true; }); }
}

function refreshFromNodeEvent() {
  window.clearTimeout(eventRefresh);
  eventRefresh = window.setTimeout(async () => {
    if (model.phase !== 'ready' || shell.hidden) return refreshEntries();
    try {
      const refreshed = await refreshFieldNet(client, model), current = model;
      model = { ...refreshed, panel:current.panel, selected:current.selected, replayIndex:current.replayIndex, message:current.message };
      render();
    } catch { /* EventSource reconnect preserves the current local view. */ }
  }, 80);
}

const nodeStream = new EventSource(`${client.baseUrl}/api/fieldnet/events`);
nodeEvents.forEach((type) => nodeStream.addEventListener(type, refreshFromNodeEvent));

async function openFieldNet(incidentId) {
  shell.hidden = false; shell.setAttribute('aria-busy', 'true'); document.body.classList.add('fieldnet-open');
  model = { ...emptyModel(), phase:'loading' }; render();
  try { model = await loadFieldNet(client, incidentId); history.replaceState(null, '', `#fieldnet=${encodeURIComponent(model.incidentId)}`); }
  catch (error) { model = { ...model, phase:'error', error:error.message }; }
  shell.removeAttribute('aria-busy'); render();
}

function closeFieldNet() {
  map?.destroy(); map = null; shell.hidden = true; shell.innerHTML = ''; document.body.classList.remove('fieldnet-open'); history.replaceState(null, '', `${location.pathname}${location.search}`);
}

async function mutate(work, successTitle) {
  const started = performance.now();
  try {
    const result = await work();
    const committedMs = Number(result?.durationMs ?? (performance.now() - started));
    model = await refreshFieldNet(client, model);
    model.timings.lastActionMs = Number(committedMs.toFixed(1));
    model.timings.lastRefreshAfterActionMs = Number((performance.now() - started).toFixed(1));
    model.message = { tone:'good', title:successTitle, detail:`Committed by the local Field Node in ${model.timings.lastActionMs} ms · ${model.node.connectionState === 'FULL' ? 'sync eligible' : 'queued for synchronization'}` };
  } catch (error) { model.message = { tone:'attention', title:'Local action was not committed', detail:error.message }; }
  render();
}

function frameMap(kind, id = null) {
  if (model.panel !== 'command') { model.panel = 'command'; render(); }
  window.requestAnimationFrame(() => map?.frame(kind, id));
}

async function useGeolocation(button) {
  const form = button.closest('form'), label = form.querySelector('[data-fieldnet-location-label]'), detail = form.querySelector('[data-fieldnet-location-detail]');
  if (!navigator.geolocation) { detail.textContent = 'Device location is unavailable in this browser.'; return; }
  label.textContent = 'Acquiring device GPS';
  navigator.geolocation.getCurrentPosition((position) => {
    form.elements.longitude.value = position.coords.longitude; form.elements.latitude.value = position.coords.latitude; form.elements.accuracy.value = Math.round(position.coords.accuracy);
    label.textContent = 'Device GPS'; detail.textContent = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} · accuracy ±${Math.round(position.coords.accuracy)} m`;
  }, (error) => { label.textContent = 'Incident package reference'; detail.textContent = `Device GPS not used: ${error.message}`; }, { enableHighAccuracy:true, timeout:8_000, maximumAge:15_000 });
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.matches('[data-action="open-fieldnet"]')) return openFieldNet(target.dataset.incidentId);
  if (!shell.contains(target)) return;
  if (target.matches('[data-fieldnet-close]')) return closeFieldNet();
  if (target.matches('[data-fieldnet-retry]')) return openFieldNet(model.incidentId);
  if (target.dataset.fieldnetPanel) { model.panel = target.dataset.fieldnetPanel; model.message = null; return render(); }
  if (target.dataset.mapZoom) return map?.changeZoom(Number(target.dataset.mapZoom));
  if (target.matches('[data-map-reset]')) return map?.reset();
  if (target.dataset.mapFrameKind) return frameMap(target.dataset.mapFrameKind, target.dataset.mapFrameId ?? null);
  if (target.matches('[data-map-selection-close]')) return target.parentElement.hidden = true;
  if (target.matches('[data-fieldnet-geolocate]')) return useGeolocation(target);
  if (target.matches('[data-fieldnet-join]')) {
    let id = localStorage.getItem('vigia.fieldnet.device-id'); if (!id) { id = `field-device:browser:${crypto.randomUUID()}`; localStorage.setItem('vigia.fieldnet.device-id', id); }
    const session=globalThis.__VIGIA_SESSION__,operator=session?.authenticated?`${session.actor.name} · ${session.actor.title}`:'UNAUTHENTICATED';
    if(!session?.authenticated)throw new Error('fieldnet_requires_authoritative_session');
    const device = { deviceId:id, deviceType:'PHONE', hardwareIdentity:id, ownerOperator:operator, capabilities:['FIELD_REPORT','TASK_ACK','CAMERA_EVIDENCE'], calibrationStatus:'NOT_APPLICABLE', timeQuality:'SYNCED', locationQuality:'BROWSER_GEOLOCATION_ON_REQUEST', trustQualification:'LOCAL_OPERATOR_SESSION' };
    return mutate(() => client.registerDevice(device), 'FIELD DEVICE JOINED');
  }
  if (target.dataset.fieldnetTaskAction) {
    const task = model.tasks.find((item) => item.taskId === target.dataset.taskId); if (!task) return;
    const state = target.dataset.fieldnetTaskAction;
    return mutate(() => state === 'ACKNOWLEDGED' ? client.acknowledge(task) : client.mutateTask(task, { state }), state === 'ACKNOWLEDGED' ? 'TASK ACKNOWLEDGED LOCALLY' : `TASK ${state.replaceAll('_',' ')}`);
  }
  if (target.dataset.fieldnetResolve) return mutate(() => client.resolveConflict(target.dataset.conflictId, target.dataset.fieldnetResolve), 'CONFLICT RESOLUTION RECORDED');
  if (target.matches('[data-fieldnet-sync]')) return mutate(() => client.sync(), 'SYNC COMPLETE');
  if (target.dataset.copyFieldnetUrl) { await navigator.clipboard.writeText(target.dataset.copyFieldnetUrl); model.message = { tone:'good', title:'LOCAL ADDRESS COPIED', detail:'No credential or secret was included.' }; return render(); }
  if (target.dataset.replayIndex != null) { model.replayIndex = Number(target.dataset.replayIndex); return render(); }
  if (target.dataset.replayStep) { model.replayIndex = Math.max(0, Math.min(replayLength(model) - 1, Number(model.replayIndex ?? replayLength(model) - 1) + Number(target.dataset.replayStep))); return render(); }
});

shell.addEventListener('input', (event) => { if (event.target.matches('[data-replay-range]')) { model.replayIndex = Number(event.target.value); render(); } });
shell.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-fieldnet-observation-form]'); if (!form) return; event.preventDefault();
  const status = form.querySelector('[data-fieldnet-capture-status]'); status.textContent = 'Saving to local Field Node…';
  try { const observation = await observationFromForm(form, model); await mutate(() => client.addObservation(observation), model.node.connectionState === 'FULL' ? 'OBSERVATION SAVED LOCALLY · SYNC ELIGIBLE' : 'OBSERVATION SAVED LOCALLY'); model.panel = 'command'; render(); }
  catch (error) { status.textContent = error.message; }
});

new MutationObserver(() => refreshEntries()).observe(document.querySelector('[data-inspector-content]'), { childList:true, subtree:true });
refreshEntries(); poll = window.setInterval(refreshEntries, 5_000);
window.addEventListener('beforeunload', () => { window.clearInterval(poll); window.clearTimeout(eventRefresh); nodeStream.close(); });
const hashIncident = new URLSearchParams(location.hash.slice(1)).get('fieldnet'); if (hashIncident) openFieldNet(hashIncident);
