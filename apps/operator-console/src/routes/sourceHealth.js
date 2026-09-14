import { shell, badge, button, esc } from '../components.js?v=2.1.0';
import { icon } from '../icons.js?v=2.1.0';
import { sourceRows, sourceTone, ageLabel } from '../viewModel.js?v=2.1.0';
import { finiteNumberOrNull } from '../truth.js?v=2.1.0';
import { sourcePassportInspection } from '../intelligenceView.js?v=2.1.0';

function failureSemantics(source) {
  const raw = source.raw ?? {};
  const material = [raw.error, raw.lastError, raw.errorCode, raw.lastErrorCode, raw.reason, source.state].filter(Boolean).join(' ').toLowerCase();
  if (source.configured === false || String(source.state).toLowerCase() === 'not_configured') return 'NOT CONFIGURED';
  if (/auth|unauthor|forbidden|\b401\b|\b403\b/.test(material)) return 'AUTH FAILURE';
  if (/pars|schema|decode|invalid payload/.test(material)) return 'PARSER FAILURE';
  if (/persist|database|postgis|storage|write/.test(material)) return 'PERSISTENCE FAILURE';
  if (source.errorPresent || /fail|error|unavailable/.test(material)) return 'INGEST FAILURE';
  if (sourceTone(source.state) === 'warning') return 'STALE PROVIDER';
  return 'HEALTHY PROVIDER';
}

function observationSemantics(source) {
  const accepted = finiteNumberOrNull(source.accepted);
  if (accepted === 0) return 'NO QUALIFYING OBSERVATION';
  if (accepted !== null) return `${accepted} ACCEPTED`;
  return 'OBSERVATION COUNT UNMEASURED';
}

export function renderSourceHealth(state) {
  const all = sourceRows(state);
  const filter = state.sourceFilter || 'all';
  const rows = all.filter(row => filter === 'all' || row.key.toLowerCase().includes(filter) || row.name.toLowerCase().includes(filter));
  const healthy = all.filter(row => failureSemantics(row) === 'HEALTHY PROVIDER').length;
  const stale = all.filter(row => failureSemantics(row) === 'STALE PROVIDER').length;
  const failed = all.length - healthy - stale;
  const workbenchRows = rows.map(row => {
    const providerState = failureSemantics(row);
    const tone = providerState === 'HEALTHY PROVIDER' ? 'green' : providerState === 'STALE PROVIDER' ? 'warning' : 'critical';
    const observationState = observationSemantics(row);
    const time=value=>value?`${ageLabel(value)} · ${new Date(value).toLocaleString()}`:'UNAVAILABLE';
    return `<article class="source-workbench__row"><header><span class="provider-name">${icon(row.key.includes('firms') || row.key.includes('sentinel') ? 'detect' : 'evidence', 18)}<span><strong>${esc(row.name)}</strong><small>${esc(row.provider??'Provider not declared')}</small></span></span><div>${badge(providerState,tone,true)}${badge(observationState,observationState==='NO QUALIFYING OBSERVATION'?'teal':tone,true)}</div></header><dl><div><dt>Configuration</dt><dd>${esc(row.configurationState??(row.configured===null?'UNMEASURED':row.configured?'CONFIGURED':'NOT CONFIGURED'))}</dd></div><div><dt>Last poll</dt><dd>${esc(time(row.lastPollAt))}</dd></div><div><dt>Last success</dt><dd>${esc(time(row.lastSuccessAt))}</dd></div><div><dt>Latest observation</dt><dd>${esc(time(row.latestObservationAt))}</dd></div><div><dt>Ingest lag</dt><dd>${row.ingestLagSeconds===null?'UNMEASURED':`${esc(row.ingestLagSeconds)} s`}</dd></div><div><dt>Accepted / rejected</dt><dd>${row.accepted===null?'UNMEASURED':esc(row.accepted)} / ${row.rejected===null?'UNMEASURED':esc(row.rejected)}</dd></div><div><dt>Coverage</dt><dd>${esc(row.currentCoverage??'UNAVAILABLE')}</dd></div><div><dt>Parser / persistence</dt><dd>${esc(row.parserState??'UNMEASURED')} / ${esc(row.persistenceState??'UNMEASURED')}</dd></div><div><dt>Next opportunity</dt><dd>${esc(time(row.nextPollAt))}</dd></div><div><dt>Last error</dt><dd>${esc(row.lastError??'None returned')}</dd></div></dl></article>`;
  }).join('');
  const authenticated=state.runtime?.session?.mutationReady===true,pending=state.runtime?.pendingOperations?.sourceRefresh===true;
  const content = `<div class="source-route source-route--semantic">
    <header class="route-heading"><div><span class="eyebrow">Source health · recovery workbench</span><h2>Provider reliability</h2><p>Provider health, accepted observations and positive-fire evidence are separate states. A healthy provider may correctly return no qualifying observation.</p></div><div class="route-actions">${button(pending?'Refresh pending…':'Refresh read view', { tone:'ghost', iconName:'sync', action:'refresh-sources',disabled:pending })}${button(pending?'Retry pending…':authenticated?'Retry now':'Retry requires authenticated operator', { tone:'secondary', iconName:'sync', action:'retry-sources',disabled:pending||!authenticated })}</div></header>
    <section class="source-overview"><article><span>Healthy providers</span><strong class="text-green">${healthy}</strong><small>Acquisition path ready</small></article><article><span>Stale providers</span><strong class="text-warning">${stale}</strong><small>Last evidence is old</small></article><article><span>Failed / unavailable</span><strong class="text-critical">${failed}</strong><small>Cause named below</small></article><article><span>Backend</span><strong>${state.runtime?.status === 'ready' ? '4177 ready' : 'Unavailable'}</strong><small>${state.runtime?.loadedAt ? new Date(state.runtime.loadedAt).toLocaleTimeString() : 'Not loaded'}</small></article></section>
    <section class="source-semantics" aria-label="Source health state definitions"><span>${badge('HEALTHY PROVIDER', 'green', true)} acquisition path is usable</span><span>${badge('NO QUALIFYING OBSERVATION', 'teal', true)} no positive evidence was returned</span><span>${badge('STALE PROVIDER', 'warning', true)} evidence is older than policy</span><span>${badge('FAILURE', 'critical', true)} ingest, auth, parser or persistence failed</span></section>
    ${sourcePassportInspection(state)}
    <section class="panel source-workbench"><header><div class="table-tabs"><button class="${filter === 'all' ? 'is-active' : ''}" data-action="source-filter:all">All providers</button><button class="${filter === 'firms' ? 'is-active' : ''}" data-action="source-filter:firms">VIIRS</button><button class="${filter === 'sentinel3' ? 'is-active' : ''}" data-action="source-filter:sentinel3">Sentinel-3</button><button class="${filter === 'mtg' ? 'is-active' : ''}" data-action="source-filter:mtg">MTG</button></div><small>Retry uses the existing bounded world refresh. Provider throttling and gateway backoff remain authoritative.</small></header><div class="source-workbench__rows">${workbenchRows || '<div class="empty-note">No source rows returned by canonical VIGIA.</div>'}</div></section>
  </div>`;
  return shell('source-health', content);
}
