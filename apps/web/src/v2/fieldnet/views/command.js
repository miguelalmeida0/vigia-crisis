import { count, elapsed, html, label, observationTitle, truthState } from '../format.js';
import { fieldNetSummary } from '../model.js';

const freshnessRows = (model) => (model.freshness?.sources ?? []).map((source) => `<div class="fieldnet-source-row"><span>${html(label(source.sourceFamily))}</span><strong class="is-${source.state === 'STALE' ? 'stale' : 'known'}">${html(label(source.state))}</strong><small>${source.lastReceivedAt ? `${elapsed(source.lastReceivedAt)} ago` : 'No synchronized timestamp'}</small></div>`).join('');

const bearingLabel = (from, to) => {
  if (![from, to].every((coordinate) => Array.isArray(coordinate) && coordinate.every(Number.isFinite))) return null;
  const meanLatitude = (from[1] + to[1]) * Math.PI / 360, east = (to[0] - from[0]) * Math.cos(meanLatitude), north = to[1] - from[1], angle = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(angle / 45) % 8];
};
const distanceLabel = (from, to) => {
  if (![from, to].every((coordinate) => Array.isArray(coordinate) && coordinate.every(Number.isFinite))) return null;
  const meanLatitude = (from[1] + to[1]) * Math.PI / 360, metres = Math.hypot((to[0] - from[0]) * 111_320 * Math.cos(meanLatitude), (to[1] - from[1]) * 111_320), bearing = bearingLabel(from, to);
  return `${metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`} ${bearing}`;
};
const focusTask = (task, incidentCoordinate) => { const coordinate = task.geometry?.coordinates ?? task.subject?.geometry?.coordinates, where = distanceLabel(incidentCoordinate, coordinate) ?? task.subject?.distanceLabel ?? task.subject?.place ?? 'Incident anchor'; return `<article class="fieldnet-focus-task"><span>MY NEXT TASK · ${html(label(task.priority))}</span><h3>${html(task.requiredAction)}</h3><p>${html(where)} · ${html(label(task.state))} · ${html(task.owner?.displayName ?? task.owner ?? 'Unassigned')}</p><dl><div><dt>Why</dt><dd>${html(task.subject?.reason ?? 'Verification required by incident command')}</dd></div><div><dt>Bring back</dt><dd>${html((task.requiredEvidence ?? []).map(label).join(' + ') || 'Operator note')}</dd></div></dl><div class="fieldnet-focus-actions"><button type="button" data-map-frame-kind="TASK" data-map-frame-id="${html(task.taskId)}">Show on map</button><button type="button" data-fieldnet-panel="tasks">Work task</button></div></article>`; };

export function commandView(model) {
  const summary = fieldNetSummary(model), conflict = model.conflicts.find((item) => item.state === 'OPEN'), task = model.tasks.find((item) => !['COMPLETED','CANCELLED'].includes(item.state)), truth = truthState(model);
  const supporting = (model.truthGraph?.edges ?? []).filter((item) => item.relation === 'SUPPORTS').length, latestLocal = [...model.observations].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0], latestRegional = [...(model.incident?.physicalObservations ?? [])].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
  const geography = model.map?.baseLayer?.featureCounts ?? {}, terrain = model.map?.baseLayer?.terrain, incidentCoordinate = model.map?.incidentAnchor?.coordinates ?? model.incident?.incidentState?.coordinate;
  return `<div class="fieldnet-command-grid">
    <section class="fieldnet-map-stage" aria-label="Offline incident map">
      <header><div><span>PROTECTED TERRITORY · ${html(model.map?.region?.properties?.bufferKm ?? '?')} KM INCIDENT CELL</span><strong>${html(model.incident?.incidentState?.label ?? model.incident?.label ?? model.incidentId)}</strong></div><b>${terrain?.state === 'LOCAL_DEM_PACKAGED' ? 'OFFLINE TOPOGRAPHY' : 'VECTOR OVERLAYS ONLY'}</b></header>
      <canvas data-fieldnet-map aria-label="Offline FieldNet map; drag to pan, scroll to zoom, select a marker to inspect"></canvas>
      <div class="fieldnet-map-controls"><button type="button" data-map-zoom="1.25" aria-label="Zoom in">+</button><button type="button" data-map-zoom=".8" aria-label="Zoom out">−</button><button type="button" data-map-frame-kind="INCIDENT_ANCHOR">Incident</button>${task ? `<button type="button" data-map-frame-kind="TASK" data-map-frame-id="${html(task.taskId)}">Task</button>` : ''}${conflict ? `<button type="button" data-map-frame-kind="CONFLICT" data-map-frame-id="${html(conflict.conflictId)}">Conflict</button>` : ''}</div>
      <div class="fieldnet-terrain-readout"><strong>${count(geography.road)} roads/trails · ${count(geography.structure)} structures · ${count(geography.place)} places</strong><span>${terrain?.statistics ? `${terrain.statistics.minElevationM}–${terrain.statistics.maxElevationM} m terrain · Copernicus DEM` : 'Terrain not packaged'}</span></div>
      <div class="fieldnet-map-legend"><span class="is-road">ROAD / TRAIL</span><span class="is-field">FIELD</span><span class="is-physical">SATELLITE</span><span class="is-task">TASK</span><span class="is-conflict">CONFLICT</span></div>
      <aside data-fieldnet-map-selection hidden></aside>
      <footer>${html(model.map?.baseLayer?.qualification ?? 'Packaged map data is served by the local Field Node; no remote tile request is used.')}</footer>
    </section>
    <aside class="fieldnet-now">
      <header><span>WHAT NEEDS ACTION HERE?</span><strong>${conflict ? 'Evidence conflict requires verification' : task ? 'Field task requires action' : 'Local incident is operational'}</strong></header>
      <div class="fieldnet-truth-state is-${truth.toLowerCase()}"><span>FIELD TRUTH</span><strong>${truth}</strong><p>${count(model.observations.length)} local observations · ${count(summary.conflicts)} unresolved conflicts</p></div>
      <div class="fieldnet-truth-measures"><div><span>EVIDENCE SUPPORTING</span><strong>${count(supporting)}</strong></div><div><span>EVIDENCE CONFLICTING</span><strong>${count(summary.conflicts)}</strong></div><div><span>LATEST LOCAL</span><strong>${latestLocal ? `${elapsed(latestLocal.observedAt)} ago` : 'None'}</strong></div><div><span>LATEST SATELLITE</span><strong>${latestRegional ? `${elapsed(latestRegional.observedAt)} ago · stale` : 'Not packaged'}</strong></div></div>
      ${conflict ? `<button class="fieldnet-priority-row" type="button" data-fieldnet-panel="conflicts"><span>WHAT WE DO NOT KNOW</span><strong>${html(label(conflict.conflictingFields?.join(' ') ?? 'Conflicting evidence'))}</strong><small>${html(conflict.resolutionPlan?.recommendedVerificationTask ?? 'Verification required · inspect both observations')}</small></button>` : ''}
      ${task ? focusTask(task, incidentCoordinate) : '<p class="fieldnet-empty">No active local task. Local capture and incident map remain available.</p>'}
      <section class="fieldnet-source-freshness"><header><span>SOURCE FRESHNESS</span><strong>${summary.connectionState === 'FULL' ? 'Regional clocks available' : 'Last synchronized evidence'}</strong></header>${freshnessRows(model) || '<p>No regional source clock was packaged.</p>'}</section>
      <button type="button" class="fieldnet-observe-cta" data-fieldnet-panel="observe">Add field observation</button>
    </aside>
  </div>`;
}

export function mapSelection(feature) {
  const item = feature.properties ?? {};
  const title = item.requiredAction ?? observationTitle(item) ?? item.name ?? item.displayName ?? item.label ?? (item.kind === 'ASSET' ? 'Unidentified reference feature' : 'Mapped item');
  return `<button type="button" data-map-selection-close aria-label="Close map detail">Close</button><span>${html(label(item.kind))}</span><strong>${html(title)}</strong><p>${item.observedAt ? `${html(elapsed(item.observedAt))} ago · ` : ''}${html(item.syncState ? label(item.syncState) : item.source ? `${item.source} · packaged locally` : 'Packaged locally')}</p>`;
}
