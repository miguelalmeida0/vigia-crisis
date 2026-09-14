import { icon } from './icons.js?v=2.1.0';
import { navPrimary, navUtility, routes } from './data.js?v=2.1.0';
import { finiteNumberOrNull } from './truth.js?v=2.1.0';
import { routeProjectionDependency, timeLabel } from './canonicalViewModel.js?v=2.1.0';
import { stateLabel } from './stateLabel.js?v=1.0.0';

let shellState = null;
export function bindShellState(state){ shellState = state; }

function commandProjection(){
  const screen=shellState?.runtime?.canonical?.globals?.commandOverview?.value,section=screen?.data?.commandPresentation;
  return ['READY','DEGRADED'].includes(section?.state)&&section?.value&&typeof section.value==='object'?section.value:null;
}

export const esc = (value = '') => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));

export function badge(label, tone = 'teal', compact = false) {
  return `<span class="badge badge--${tone}${compact ? ' badge--compact' : ''}">${esc(label)}</span>`;
}

export function button(label, { tone = 'ghost', iconName = '', action = '', extra = '', disabled = false } = {}) {
  const inferred = action || `auto:${String(label ?? '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
  return `<button class="button button--${tone}" data-action="${esc(inferred)}" ${extra} ${disabled ? 'disabled' : ''}>${iconName ? icon(iconName, 16) : ''}<span>${esc(label)}</span></button>`;
}

export function panel({ title = '', eyebrow = '', actions = '', body = '', className = '', id = '' }) {
  return `<section class="panel ${className}" ${id ? `id="${id}"` : ''}>
    ${(title || eyebrow || actions) ? `<header class="panel__header">
      <div>${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}${title ? `<h2>${esc(title)}</h2>` : ''}</div>
      ${actions ? `<div class="panel__actions">${actions}</div>` : ''}
    </header>` : ''}
    <div class="panel__body">${body}</div>
  </section>`;
}

function navLink([route, label, iconName], active) {
  return `<a class="nav-link ${active === route ? 'is-active' : ''}" href="#/${route}" data-route="${route}" aria-label="${esc(label)}" title="${esc(label)}" ${active === route ? 'aria-current="page"' : ''}>
    <span class="nav-link__icon">${icon(iconName,20)}</span><span>${esc(label)}</span>
  </a>`;
}

export function sidebar(active) {
  const actor = shellState?.runtime?.session?.actor;
  const projection=commandProjection(),conditions=projection?.conditions;
  const runtimeStatus=shellState?.runtime?.status??'error';
  const resourceState=shellState?.runtime?.resourceState,systemState=['UNINITIALIZED','BOOTSTRAPPING'].includes(resourceState)?{label:'Connecting to incident services',tone:'updating',iconName:'sync'}:resourceState==='REFRESHING'?{label:'Refreshing · last-good retained',tone:'updating',iconName:'sync'}:{ready:{label:'Data connected',tone:'',iconName:'check'},degraded:{label:'Operating with degraded sources',tone:'warning',iconName:'warning'},loading:{label:'Refreshing data',tone:'updating',iconName:'sync'},error:{label:'Current view unavailable',tone:'critical',iconName:'warning'}}[runtimeStatus]??{label:'Current view unavailable',tone:'critical',iconName:'warning'};
  const routeState=routeProjectionDependency(shellState,active).state;
  if(runtimeStatus==='ready'&&routeState==='FAILED')Object.assign(systemState,{label:'Current route unavailable',tone:'critical',iconName:'warning'});
  else if(runtimeStatus==='ready'&&routeState==='STALE')Object.assign(systemState,{label:'Current route is last known',tone:'warning',iconName:'warning'});
  else if(runtimeStatus==='ready'&&routeState==='LOADING')Object.assign(systemState,{label:'Current route updating',tone:'updating',iconName:'sync'});
  const name = actor?.name ?? actor?.displayName ?? 'Local operator';
  const title = actor?.title ?? actor?.position ?? (shellState?.runtime?.session?.authenticated ? 'Authenticated operator' : 'Read-only session');
  const region=conditions?.region??actor?.region??(['UNINITIALIZED','BOOTSTRAPPING'].includes(resourceState)?'Connecting to authorized scope':'Authorized scope');
  const routeOverridesGlobal=runtimeStatus==='ready'&&['FAILED','STALE','LOADING'].includes(routeState);
  const systemLabel=runtimeStatus==='ready'&&!routeOverridesGlobal?(projection?.systemStatus?.label??systemState.label):systemState.label;
  const initials = String(name).split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase() || 'OP';
  return `<aside class="sidebar" id="primary-navigation" aria-label="Primary navigation" data-scroll-key="sidebar" data-vqa="shell.sidebar">
    <a class="brand" href="#/command-overview" data-route="command-overview" data-vqa="shell.brand" aria-label="VIGIA Command Overview">
    <img class="brand__mark" src="./assets/vigia-brand-mark.svg" width="42" height="42" alt=""><span class="brand__word">VIGIA</span>
    </a>
    <nav class="sidebar__nav sidebar__nav--primary" data-vqa="shell.navigation">${navPrimary.map(item => navLink(item, active)).join('')}</nav>
    ${navUtility.length?`<nav class="sidebar__nav sidebar__nav--utility">${navUtility.map(item => navLink(item, active)).join('')}</nav>`:''}
    <div class="sidebar__footer">
      <div class="system-state ${systemState.tone?`system-state--${systemState.tone}`:''}" data-vqa="shell.system-status" data-system-state="${esc(routeOverridesGlobal?routeState.toLowerCase():runtimeStatus)}"><i aria-hidden="true">${icon(systemState.iconName,18)}</i><span><small>System Status</small><strong>${esc(systemLabel)}</strong></span></div>
      <button class="operator-card" data-vqa="shell.operator" data-action="open-operator" aria-label="Open operator session"><span class="avatar">${esc(initials)}</span><span><strong>${esc(name)}</strong><small>${esc(title)}</small><small>${esc(region)}</small></span>${icon('chevron',14)}</button>
    </div>
  </aside>`;
}

export function topbar(active, { contextual = false } = {}) {
  const route = routes[active] || routes['command-overview'];
  const runtime = shellState?.runtime;
  const projection=commandProjection(),conditions=projection?.conditions;
  const currentness=routeProjectionDependency(shellState,active),projectionState=currentness.state;
  const resourceState=runtime?.resourceState,connecting=['UNINITIALIZED','BOOTSTRAPPING'].includes(resourceState),refreshing=resourceState==='REFRESHING';
  const statusLabel=connecting?'Connecting':refreshing?'Refreshing':projectionState==='READY'?'Operational':projectionState==='STALE'?'Last known':projectionState==='LOADING'?'Updating':projectionState==='DEGRADED'?'Source degraded':runtime?.status==='loading'?'Updating':'Unavailable';
  const hasWeather=conditions?.temperatureF!==null&&conditions?.temperatureF!==undefined;
  return `<header class="topbar ${contextual?'topbar--contextual':''}" data-vqa="shell.header">
    <button class="icon-button topbar__menu" data-action="toggle-nav" aria-label="Toggle navigation" aria-controls="primary-navigation" aria-expanded="${shellState?.navOpen?'true':'false'}">${icon('menu', 20)}</button>
    <div class="topbar__title" data-vqa="shell.header-title"><h1>${esc(route.title)}</h1><p>${esc(route.eyebrow)}</p></div>
    ${conditions?`<div class="conditions-cluster" data-vqa="shell.header-context"><div class="command-context"><span>${esc(conditions.region??'Authorized scope')}</span><strong>${esc(conditions.command??'Wildfire command')}</strong></div><div class="topbar-clock"><span>${esc(conditions.localDate??'')}</span><strong>${esc(conditions.localTime??'')} ${esc(conditions.timezone??'UTC')}</strong></div>${hasWeather?`<div class="topbar-weather">${icon(conditions.sky==='clear'?'temp':'wind',18)}<strong>${esc(conditions.temperatureF)}°F</strong></div>`:''}</div>`:`<p class="conditions-unavailable">${connecting?'Connecting to authorized scope':'Authorized scope context unavailable'}</p>`}
    <button class="icon-button topbar__refresh" data-action="refresh-runtime" aria-label="Refresh data" ${runtime?.pendingOperations?.refresh||runtime?.pendingOperations?.governedMutation?'disabled':''}>${icon('sync',18)}</button>
    <span class="topbar__projection-state" data-projection-state="${esc(projectionState)}">${stateLabel(projectionState,{label:statusLabel,compact:true})}</span>
  </header>`;
}

function projectionDisclosure(active,currentness){
  if(currentness.state==='STALE'){const refreshing=currentness.deliveryState==='LAST_GOOD_REFRESHING',message=refreshing?'A governed refresh is running. Last-good values remain visible and are not presented as newly confirmed.':'The latest refresh failed. Retained values below are not current.';return`<section class="section-state route-projection-disclosure" data-vqa="shell.projection-currentness" data-route-projection-state="STALE" role="status">${stateLabel('STALE',{label:refreshing?'Refreshing · last-good retained':'Last known information',compact:true})}<small>${message}${currentness.lastGoodAt?` · last confirmed ${esc(timeLabel(currentness.lastGoodAt))}`:''}</small></section>`;}
  if(currentness.state==='FAILED')return`<section class="section-state route-projection-disclosure" data-vqa="shell.projection-currentness" data-route-projection-state="FAILED" role="alert">${stateLabel('FAILED',{label:'Information unavailable',compact:true})}<small>No retained information is available for this view.</small></section>`;
  return'';
}

export function shell(active, content, { pageClass = '', fullBleed = false, contextualHeader = false } = {}) {
  const currentness=routeProjectionDependency(shellState,active);
  return `<div class="app-shell ${fullBleed ? 'app-shell--full' : ''}">${sidebar(active)}<div class="app-frame ${contextualHeader?'app-frame--contextual':''}">${topbar(active,{contextual:contextualHeader})}<main class="route route--${active} ${pageClass}" id="main-content" data-vqa="shell.main" data-vigia-route="${esc(active)}" data-route-projection-state="${esc(currentness.state)}" data-scroll-key="route:${active}" tabindex="-1">${projectionDisclosure(active,currentness)}${content}</main></div><button class="nav-scrim" data-action="toggle-nav" aria-label="Close navigation"></button><div class="toast-region" data-testid="toast-region" aria-live="polite"></div></div>`;
}

export function metricCell([label, value, meta, tone = 'teal']) {
  return `<article class="metric-cell metric-cell--${tone}"><span>${esc(label??'Metric')}</span><strong>${esc(value??'Unavailable')}</strong><small>${esc(meta??'')}</small></article>`;
}

export function mapControls() {
  return `<div class="map-controls" aria-label="Map controls">
    <button class="icon-button" data-action="map-layers" aria-label="Map layers">${icon('layers', 18)}</button>
    <button class="icon-button" data-action="map-zoom-in" aria-label="Zoom in">${icon('plus', 18)}</button>
    <button class="icon-button" data-action="map-zoom-out" aria-label="Zoom out">${icon('minus', 18)}</button>
  </div>`;
}

export function marker({ x, y, label = '', tone = 'critical', iconName = 'flame', action = '' }) {
  return `<button class="map-marker map-marker--${tone}" style="--x:${x}%;--y:${y}%" data-action="${esc(action || 'map-marker-info')}" aria-label="${esc(label || tone)}">${icon(iconName, 17)}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
}

export function emptyState(title, body, iconName = 'evidence') {
  return `<div class="empty-state">${icon(iconName, 26)}<strong>${esc(title)}</strong><p>${esc(body)}</p></div>`;
}

export function decisionFrame({ now, next, why, nowMeta = '', nextMeta = '', whyMeta = '', className = '' } = {}) {
  const item = (label, value, meta, tone) => `<section class="decision-frame__item decision-frame__item--${tone}">
    <span>${label}</span>
    <strong>${esc(value || 'Unreported')}</strong>
    ${meta ? `<p>${esc(meta)}</p>` : ''}
  </section>`;
  return `<div class="decision-frame ${className}" aria-label="Now, next and why">
    ${item('Now', now, nowMeta, 'now')}
    ${item('Next', next, nextMeta, 'next')}
    ${item('Why', why, whyMeta, 'why')}
  </div>`;
}

export function whatChangedPanel(changes=[],{title='What changed',limit=6}={}){
  const rows=[...changes].slice(-limit).reverse(),tones={'NEW FACT':'green','RECOMPUTED VIEW':'teal','HUMAN DECISION':'warning','SOURCE STATUS CHANGE':'critical'};
  return `<section class="panel what-changed"><header><div><span class="eyebrow">Decision chronology</span><h3>${esc(title)}</h3></div>${badge(`${rows.length} changes`,rows.length?'teal':'green',true)}</header><div class="what-changed__rows">${rows.map(item=>`<article><span>${badge(item.category,tones[item.category]??'teal',true)}</span><span><strong>${esc(item.label)}</strong><small>${esc(item.from??'Not previously present')} → ${esc(item.to??'Unavailable')}</small><em>${esc(item.basis??'Attributable basis unavailable')}</em></span><time>${item.changedAt?esc(new Date(item.changedAt).toLocaleString()):'Time unavailable'}</time></article>`).join('')||'<div class="empty-note">No material change has been observed since this browser began comparing canonical projections.</div>'}</div></section>`;
}

export function listRow({ label, value, meta = '', tone = '', iconName = '' }) {
  return `<div class="list-row ${tone ? `list-row--${tone}` : ''}">
    <div class="list-row__title">${iconName ? icon(iconName, 17) : ''}<span><strong>${esc(label)}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}</span></div>
    <span class="list-row__value">${esc(value??'Unavailable')}</span>
  </div>`;
}

export function progress(value, tone = 'teal', label = '') {
  const measured = finiteNumberOrNull(value);
  if (measured === null) {
    return `<div class="progress progress--unavailable" role="img" aria-label="${esc(label || 'Progress')} unavailable"><span class="progress__fill progress__fill--${tone}" style="width:0"></span></div>`;
  }
  const safe = Math.max(0, Math.min(100, measured));
  return `<div class="progress" role="progressbar" aria-valuenow="${safe}" aria-valuemin="0" aria-valuemax="100" ${label ? `aria-label="${esc(label)}"` : ''}><span class="progress__fill progress__fill--${tone}" style="width:${safe}%"></span></div>`;
}

export function toggle(label, checked = false, action = '') {
  return `<label class="toggle"><span>${esc(label)}</span><input type="checkbox" ${checked ? 'checked' : ''} ${action ? `data-action="${esc(action)}"` : ''}><span class="toggle__track"></span></label>`;
}
