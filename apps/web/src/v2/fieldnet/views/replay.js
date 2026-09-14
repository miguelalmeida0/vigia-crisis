import { dateStamp, html, label } from '../format.js';

const TITLES = {
  INCIDENT_PACKAGE_IMPORTED:'Incident synchronized', CONNECTION_STATE_CHANGED:'Connection state changed', FIELD_OBSERVATION_ADDED:'Field observation submitted locally',
  TASK_CREATED:'Field task created', TASK_ACKNOWLEDGED:'Task acknowledged locally', TASK_UPDATED:'Task state changed', CONFLICT_CREATED:'Conflicting evidence preserved',
  SYNC_ACKNOWLEDGED:'Synchronization acknowledged', SYNC_COMPLETED:'Synchronization completed', CONFLICT_RESOLVED:'Conflict resolved', DEVICE_REGISTERED:'Field device joined'
};

export function replayItems(model) {
  if (model.proof?.frames?.length) return model.proof.frames.map((item) => ({ ...item, detail:item.connectionState }));
  const mutations = model.replay?.mutations ?? [], audit = model.replay?.audit ?? [];
  const normalized = [
    ...audit.map((item) => ({ id:item.id, at:item.createdAt, type:item.recordType, actor:item.actor, detail:item.payloadHash })),
    ...mutations.map((item) => ({ id:item.id, at:item.wallClockAt, type:item.type, actor:item.actor, detail:item.syncState, payload:item.payload }))
  ];
  return normalized.filter((item) => Number.isFinite(Date.parse(item.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).filter((item, index, all) => index === all.findIndex((candidate) => candidate.type === item.type && candidate.at === item.at));
}

export function replayFrame(model) {
  const items=replayItems(model),selected=Math.max(0,Math.min(items.length-1,Number(model.replayIndex??items.length-1)));
  return {items,selected,current:items[selected]};
}

export function replayMapContract(model) {
  const {current}=replayFrame(model),mutations=(model.replay?.mutations??[]).filter((item)=>!current?.at||Date.parse(item.wallClockAt)<=Date.parse(current.at));
  const observationCount=current?.observations??mutations.filter((item)=>item.type==='FIELD_OBSERVATION_ADDED').length;
  const taskCount=current?.tasks??mutations.filter((item)=>item.type==='TASK_CREATED').length;
  const conflictCount=current?.conflicts??mutations.filter((item)=>item.type==='CONFLICT_CREATED').length;
  return {...model.map,layers:{...(model.map?.layers??{}),localObservations:(model.map?.layers?.localObservations??[]).slice(0,observationCount),tasks:(model.map?.layers?.tasks??[]).slice(0,taskCount),conflicts:(model.map?.layers?.conflicts??[]).slice(0,conflictCount)}};
}

export function replayView(model) {
  const {items,selected,current}=replayFrame(model),debtItems=model.replay?.evidenceDebt?.length?model.replay.evidenceDebt:model.incident?.measurementDebt?.length?model.incident.measurementDebt:[model.proof?.evidenceDebt?.updatedAfterReconciliation].filter(Boolean),debt=debtItems.find((item)=>!['MEASURED','RESOLVED'].includes(item.currentState));
  return `<section class="fieldnet-replay"><header><div><span>CONTROLLED FIELD EXERCISE · ATTRIBUTABLE LEDGER</span><h2>The network fails. The incident continues.</h2></div><p>Playback is derived from the persisted FieldNet mutation/audit proof—not a frontend connectivity flag.</p></header>
    <section class="fieldnet-replay-map-stage"><header><div><span>OFFLINE GEOGRAPHY · STEP ${selected+1}</span><strong>${html(current?.title??TITLES[current?.type]??label(current?.type??'Incident package'))}</strong></div><b>${html(label(current?.connectionState??model.node.connectionState))}</b></header><canvas data-fieldnet-replay-map aria-label="FieldNet replay map with locally packaged geography"></canvas><footer><span>${numberOrZero(model.map?.baseLayer?.featureCounts?.road)} roads/trails · terrain ${html(model.map?.baseLayer?.terrain?.state==='LOCAL_DEM_PACKAGED'?'packaged':'unavailable')}</span><strong>${debt?`Evidence debt: ${html(debt.question)}`:'No open packaged EvidenceDebt item'}</strong></footer></section>
    <div class="fieldnet-replay-instrument"><section class="fieldnet-replay-focus"><span>STEP ${selected + 1} / ${items.length || 0}</span><strong>${html(current?.title ?? TITLES[current?.type] ?? label(current?.type ?? 'No replay step'))}</strong><p>${html(dateStamp(current?.at))} · ${html(current?.actor ?? 'FieldNet kernel')}</p><dl><div><dt>Connection</dt><dd>${html(label(current?.connectionState ?? model.node.connectionState))}</dd></div><div><dt>Map</dt><dd>${html(label(current?.mapState ?? 'persisted local context'))}</dd></div><div><dt>Observations</dt><dd>${current?.observations ?? model.observations.length}</dd></div><div><dt>Tasks</dt><dd>${current?.tasks ?? model.tasks.length}</dd></div><div><dt>Truth conflicts</dt><dd>${current?.conflicts ?? model.conflicts.filter((item) => item.state === 'OPEN').length}</dd></div><div><dt>Sync queue</dt><dd>${current?.pendingSync ?? model.syncQueue.pendingTotal} pending</dd></div></dl></section>
      <ol class="fieldnet-replay-list">${items.map((item, index) => `<li class="${index === selected ? 'is-selected' : ''}"><button type="button" data-replay-index="${index}"><time>${html(dateStamp(item.at))}</time><strong>${html(item.title ?? TITLES[item.type] ?? label(item.type))}</strong><small>${html(item.actor ?? 'FieldNet kernel')} · ${html(label(item.detail ?? 'recorded'))}</small></button></li>`).join('')}</ol>
    </div>${items.length > 1 ? `<div class="fieldnet-replay-control"><button type="button" data-replay-step="-1" ${selected === 0 ? 'disabled' : ''}>Previous</button><input type="range" min="0" max="${items.length - 1}" value="${selected}" data-replay-range aria-label="Disconnection replay step"><button type="button" data-replay-step="1" ${selected === items.length - 1 ? 'disabled' : ''}>Next</button></div>` : ''}
    <footer><span>AUDIT CHAIN</span><strong>${model.proof?.audit?.valid || model.metrics.audit?.valid ? 'VERIFIED' : 'NOT VERIFIED'}</strong><p>${model.proof?.audit?.records ?? model.metrics.audit?.records ?? 0} records · ${model.proof?.dataIntegrity?.duplicateMutationsAppliedAtCentral ?? 0} duplicate mutations applied · zero silent loss ${model.proof?.dataIntegrity?.zeroSilentLoss ? 'verified' : 'not verified'}</p></footer>
  </section>`;
}

export function replayLength(model) { return replayItems(model).length; }
function numberOrZero(value){return Number(value??0).toLocaleString();}
