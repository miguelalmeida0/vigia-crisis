import { count, elapsed, html, label, stamp } from './format.js';
import { fieldNetSummary } from './model.js';
import { commandView } from './views/command.js';
import { observeView } from './views/observe.js';
import { tasksView } from './views/tasks.js';
import { conflictsView } from './views/conflicts.js';
import { replayView } from './views/replay.js';
import { joinView } from './views/join.js';

const PANELS = [
  ['command','Field command'], ['observe','Observe'], ['tasks','Tasks'], ['conflicts','Conflicts'], ['replay','The network fails'], ['join','Join + devices']
];

function panel(model, baseUrl) {
  if (model.panel === 'observe') return observeView(model);
  if (model.panel === 'tasks') return tasksView(model);
  if (model.panel === 'conflicts') return conflictsView(model);
  if (model.panel === 'replay') return replayView(model);
  if (model.panel === 'join') return joinView(model, baseUrl);
  return commandView(model);
}

export function renderFieldNetShell(model, baseUrl) {
  if (model.phase === 'loading') return `<div class="fieldnet-loading"><span>FIELDNET</span><strong>Connecting to the local incident node</strong><p>Local Node ${html(baseUrl)}</p></div>`;
  if (model.phase === 'error') return `<div class="fieldnet-loading is-error"><span>FIELDNET LOCAL NODE</span><strong>Field Node is not reachable</strong><p>${html(model.error)}</p><div><button type="button" data-fieldnet-close>Return to Incident</button><button type="button" data-fieldnet-retry>Retry local node</button></div></div>`;
  const summary = fieldNetSummary(model), disconnected = !['FULL','RECOVERING'].includes(summary.connectionState), stateClass = summary.connectionState.toLowerCase().replaceAll('_','-'),session=globalThis.__VIGIA_SESSION__,actorName=session?.actor?.name??session?.name??'Unauthenticated',actorTitle=session?.actor?.title??session?.title??'Session unavailable';
  return `<header class="fieldnet-topbar"><button type="button" data-fieldnet-close aria-label="Return to VIGIA Incident">Return to Incident</button><div class="fieldnet-brand"><span>VIGIA / FIELDNET</span><strong>${html(model.incident?.incidentState?.label ?? model.incident?.label ?? model.incidentId)}</strong><small>${html(summary.releaseId)} · ${html(label(summary.releaseCompatibility))}</small></div><div class="fieldnet-connection is-${stateClass}"><span>CONNECTION STATE</span><strong>${html(label(summary.connectionState))}</strong><small>${disconnected ? `Local incident operational · ${summary.pending} pending` : summary.connectionState === 'RECOVERING' ? 'Reconciliation in progress' : 'Regional command reachable'}</small></div><div class="fieldnet-identity"><span>FIELD OPERATOR</span><strong>${html(actorName)}</strong><small>${html(actorTitle)}</small></div></header>
    <div class="fieldnet-summary-strip"><div><strong>${count(summary.observations)}</strong><span>Local observations</span></div><div><strong>${count(summary.activeTasks)}</strong><span>Active tasks</span></div><div class="${summary.conflicts ? 'is-attention' : ''}"><strong>${count(summary.conflicts)}</strong><span>Open conflicts</span></div><div><strong>${count(summary.pending)}</strong><span>Pending sync</span></div><div><strong>${count(summary.devices)}</strong><span>Known devices</span></div><div><strong>${html(elapsed(summary.lastSync))}</strong><span>Since package / sync</span></div>${summary.connectionState === 'RECOVERING' || (summary.connectionState === 'FULL' && summary.pending) ? '<button type="button" data-fieldnet-sync>Synchronize now</button>' : ''}</div>
    ${model.message ? `<div class="fieldnet-message is-${html(model.message.tone ?? 'neutral')}"><strong>${html(model.message.title)}</strong><span>${html(model.message.detail)}</span></div>` : ''}
    <nav class="fieldnet-nav" aria-label="Incident field workspace">${PANELS.map(([id, title]) => `<button type="button" class="${model.panel === id ? 'is-active' : ''}" data-fieldnet-panel="${id}">${title}${id === 'conflicts' && summary.conflicts ? `<b>${summary.conflicts}</b>` : ''}${id === 'tasks' && summary.activeTasks ? `<b>${summary.activeTasks}</b>` : ''}</button>`).join('')}</nav>
    <main class="fieldnet-main" data-fieldnet-main>${panel(model, baseUrl)}</main>`;
}

export function renderIncidentEntry(summary, nodeIncidentId, selectedIncidentId, model = {}) {
  if (!summary || nodeIncidentId !== selectedIncidentId) return '';
  const disconnected = !['FULL','RECOVERING'].includes(summary.connectionState);
  const tail = (model.replay?.mutations ?? []).slice(-3).reverse();
  return `<header><div><span>FIELDNET · ${html(label(summary.connectionState))}</span><strong>${disconnected ? 'Local incident operational' : summary.connectionState === 'RECOVERING' ? 'Deterministic reconciliation active' : 'Field Node connected'}</strong><small>${html(summary.releaseId)} · ${html(label(summary.releaseCompatibility))}</small></div><b>${count(summary.pending)} PENDING</b></header><div><span><strong>${count(summary.observations)}</strong> observations</span><span><strong>${count(summary.activeTasks)}</strong> active tasks</span><span><strong>${count(summary.conflicts)}</strong> conflicts</span><span>last package / sync <strong>${html(elapsed(summary.lastSync))}</strong></span></div>${tail.length ? `<section><span>DECISION LEDGER · FIELDNET TAIL</span>${tail.map((item) => `<p><time>${html(stamp(item.wallClockAt))}</time><strong>${html(label(item.type))}</strong><small>${html(item.actor)}</small></p>`).join('')}</section>` : ''}<button type="button" data-action="open-fieldnet" data-incident-id="${html(nodeIncidentId)}">Open FieldNet</button>`;
}
