import { PORTUGAL_MAINLAND_RING } from './portugal-geometry.js';
import { ATLAS_VIEW, CITY_LABELS, project } from './map-projection.js';
import { basemapTiles } from './tile-grid.js';
import { REFERENCE_RIVERS, REFERENCE_ROADS, contourCoordinates } from './reference-cartography.js';
import { clusterIncidents } from './atlas-clusters.js';

const NS = 'http://www.w3.org/2000/svg';
const VISIBLE_BY_MODE = Object.freeze({
  prevent: new Set(['finding','prevention', 'hazard', 'watch']),
  detect: new Set(['event','replay','incident', 'thermal', 'watch']),
  respond: new Set(['incident', 'asset', 'watch']),
  command: new Set(['finding','event', 'prevention', 'hazard', 'incident', 'thermal', 'asset', 'watch']),
  live: new Set(['finding','event']),
  replay: new Set(['replay', 'thermal'])
});
function element(name, attributes = {}, content = null) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (content !== null) node.textContent = content;
  return node;
}
function linePath(coordinates, close = false) {
  const path = coordinates.map((coordinate, index) => `${index ? 'L' : 'M'}${project(coordinate).join(',')}`).join(' ');
  return close ? `${path} Z` : path;
}
function installDefs(svg) {
  const defs = element('defs');
  const clip = element('clipPath', { id: 'portugal-atlas-clip' });
  clip.append(element('path', { d: linePath(PORTUGAL_MAINLAND_RING, true) }));
  const land = element('linearGradient', { id: 'atlas-land', x1: '0', y1: '0', x2: '1', y2: '1' });
  land.append(
    element('stop', { offset: '0%', 'stop-color': '#193022' }),
    element('stop', { offset: '48%', 'stop-color': '#14271d' }),
    element('stop', { offset: '100%', 'stop-color': '#17241c' })
  );
  const shadow = element('filter', { id: 'atlas-shadow', x: '-40%', y: '-40%', width: '180%', height: '180%' });
  shadow.append(element('feDropShadow', { dx: '0', dy: '14', stdDeviation: '10', 'flood-color': '#000', 'flood-opacity': '.48' }));
  defs.append(clip, land, shadow);
  svg.append(defs);
}
function appendLinear(group, className, items) {
  for (const item of items) group.append(element('path', {
    class: className,
    d: linePath(item.coordinates),
    'data-reference': item.name
  }));
}
function appendBase(svg, detailLevel = 1) {
  svg.append(element('rect', { class: 'atlas-ocean', width: '1000', height: '1000' }));
  const country = linePath(PORTUGAL_MAINLAND_RING, true);
  svg.append(element('path', { class: `atlas-country-shadow${detailLevel >= 1.7 ? ' is-local' : ''}`, d: country }));
  svg.append(element('path', { class: `atlas-country-land${detailLevel >= 1.7 ? ' is-local' : ''}`, d: country }));
  const clipped = element('g', { class: 'atlas-clipped', 'clip-path': 'url(#portugal-atlas-clip)' });
  for (let index = 0; index < 24; index += 1) clipped.append(element('path', {
    class: `atlas-contour${index % 5 === 0 ? ' major' : ''}`,
    d: linePath(contourCoordinates(index))
  }));
  appendLinear(clipped, 'atlas-road', REFERENCE_ROADS);
  appendLinear(clipped, 'atlas-river', REFERENCE_RIVERS);
  svg.append(clipped);
  svg.append(element('path', { class: `atlas-country-line${detailLevel >= 1.7 ? ' is-local' : ''}`, d: country }));
  // Real basemap labels own the national view. Custom labels are only added at local detail
  // to avoid the broken-looking collisions that low-zoom screenshots exposed.
  if (detailLevel >= 1.75) {
    for (const city of CITY_LABELS) {
      const [x, y] = project(city.coordinate);
      const scale = Math.max(1, detailLevel); const dot = 2 / scale; const font = Math.max(2.1, 7.4 / scale);
      const group = element('g', { class: 'atlas-city detail-local' });
      group.append(element('circle', { cx: x, cy: y, r: dot }), element('text', { x: x + 7 / scale, y: y + 3 / scale, 'font-size': font }, city.name));
      svg.append(group);
    }
  }
}

function appendThermalOverlay(svg, overlay) {
  if (!overlay?.url || !Array.isArray(overlay.bbox)) return;
  const [west, south, east, north] = overlay.bbox.map(Number);
  if (![west, south, east, north].every(Number.isFinite)) return;
  const [left, top] = project([west, north]);
  const [right, bottom] = project([east, south]);
  const image = element('image', {
    class: 'atlas-thermal-live', href: overlay.url,
    x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top),
    preserveAspectRatio: 'none', 'clip-path': 'url(#portugal-atlas-clip)',
    'data-provider': overlay.provider ?? '', 'data-acquired-at': overlay.acquiredAt ?? ''
  });
  svg.append(image);
}


function appendBasemap(svg, detailLevel, { kind = 'streets', className = 'atlas-basemap', clip = true } = {}) {
  const attributes = { class: className, 'data-basemap-kind': kind };
  if (clip) attributes['clip-path'] = 'url(#portugal-atlas-clip)';
  const group = element('g', attributes);
  for (const tile of basemapTiles(detailLevel)) group.append(element('image', {
    class: `atlas-basemap-tile atlas-${kind}-tile`, href: `/api/v1/basemap/${kind}/${tile.zoom}/${tile.x}/${tile.y}`,
    x: tile.left, y: tile.top, width: tile.width, height: tile.height, preserveAspectRatio: 'none'
  }));
  svg.append(group);
}

function appendEventGeometry(svg, data) {
  for (const feature of data?.eventGeometry?.features ?? []) {
    const rings=feature.geometry?.type==='MultiPolygon'?(feature.geometry.coordinates??[]).map((polygon)=>polygon?.[0]).filter(Boolean):[feature.geometry?.coordinates?.[0]].filter(Boolean); if(!rings.length)continue;
    const selected = feature.properties?.selected ? ' selected' : '';
    const evolution = feature.properties?.evolution ?? 'current';
    const freshness = feature.properties?.geometryFreshness ?? 'unknown';
    const phenomenon=feature.properties?.phenomenon?` phenomenon-${feature.properties.phenomenon}`:'';
    for(const ring of rings)svg.append(element('path', { class: `atlas-event-footprint ${evolution} freshness-${freshness}${phenomenon}${selected}`, d: linePath(ring, true) }));
    if (feature.properties?.selected && Number.isFinite(Number(feature.properties?.movementBearing)) && Number(feature.properties?.movementKm) > 0.15) appendMovement(svg, feature);
  }
}
function appendMovement(svg, feature) {
  const coords=feature.geometry?.coordinates?.[0]??[]; if(!coords.length)return;
  const center=coords.reduce((acc,c)=>[acc[0]+c[0]/coords.length,acc[1]+c[1]/coords.length],[0,0]);
  const [x,y]=project(center),bearing=Number(feature.properties.movementBearing),km=Math.min(4,Number(feature.properties.movementKm)||0);
  const rad=(bearing-90)*Math.PI/180,length=24+km*8,ex=x+Math.cos(rad)*length,ey=y+Math.sin(rad)*length;
  svg.append(element('path',{class:'atlas-movement-vector',d:`M${x} ${y} L${ex} ${ey}`}));
  svg.append(element('circle',{class:'atlas-movement-tip',cx:ex,cy:ey,r:3}));
}
function appendSpread(svg, data) {
  for (const feature of data?.spread?.features ?? []) {
    const ring = feature.geometry?.coordinates?.[0];
    if (!ring) continue;
    const scenario = String(feature.properties?.sensitivity ?? 'central').toLowerCase();
    svg.append(element('path', { class: `atlas-spread ${scenario}`, d: linePath(ring, true) }));
  }
}

function markerClass(feature) {
  const { kind, stage, freshness, evolution, lifecycle } = feature.properties;
  if (kind === 'replay') return `replay-case ${stage === 'physical-first' ? 'physical-first' : 'report-first'}${feature.properties.associated ? ' associated' : ''}${feature.properties.fragmented ? ' fragmented' : ''}`;
  if (kind === 'event') {
    if (lifecycle === 'stale' || freshness === 'stale_open') return 'event stale';
    if (stage === 'satellite-only') return `event satellite${evolution === 'growing' ? ' growing' : ''}`;
    if (stage === 'sensor-only') return `event sensor${evolution === 'growing' ? ' growing' : ''}`;
    if (stage === 'multisource') return `event multisource${feature.properties.twoPhysicalSourceFamilies ? ' two-family' : ''}${evolution === 'growing' ? ' growing' : ''}`;
    if (stage === 'association-uncertain') return 'event uncertain';
    return `event reported${evolution === 'growing' ? ' growing' : ''}`;
  }
  if (kind !== 'incident') return kind === 'prevention' || kind==='finding' ? 'candidate' : kind;
  if (stage === 'verified') return 'incident verified';
  if (stage === 'corroborated') return 'incident supported';
  if (stage === 'rejected') return 'incident rejected';
  if (freshness === 'stale') return 'incident stale';
  return 'incident reported';
}

function shapeFor(group, feature, selected, detailLevel = 1) {
  const { kind, stage, freshness } = feature.properties;
  const size = (selected ? 9 : 6.5) / Math.max(1, detailLevel);
  if (kind === 'finding' || kind === 'prevention' || kind === 'thermal' || (kind === 'replay' && feature.properties.physicalFirst) || (kind === 'event' && ['satellite-only','sensor-only'].includes(stage))) {
    group.append(element('path', { class: 'marker-core', d: `M0 ${-size} L${size} 0 L0 ${size} L${-size} 0 Z` }));
    return;
  }
  if (kind === 'asset') {
    group.append(element('rect', { class: 'marker-core', x: -size, y: -size, width: size * 2, height: size * 2, rx: '1' }));
    return;
  }
  group.append(element('circle', { class: 'marker-core', r: size }));
  if (kind === 'incident' && stage === 'rejected') {
    const cross = 4 / Math.max(1, detailLevel);
    group.append(element('path', { class: 'marker-cross', d: `M${-cross} ${-cross} L${cross} ${cross} M${cross} ${-cross} L${-cross} ${cross}` }));
  }
  if (kind === 'incident' && freshness === 'stale') group.setAttribute('aria-description', 'Stale public report');
}

function appendMarkers(svg, data, mode, detailLevel = 1) {
  const allowed = VISIBLE_BY_MODE[mode] ?? VISIBLE_BY_MODE.prevent;
  const raw = [...(data?.points?.features ?? []), ...(data?.assets?.features ?? [])]
    .filter((feature) => allowed.has(feature.properties.kind));
  const entries = mode === 'live' || mode === 'detect' || mode === 'respond' || mode === 'command' ? clusterIncidents(raw,{detailLevel}) : raw.map((feature) => ({ feature, count: 1 }));
  for (const { feature, count } of entries) {
    const [x, y] = project(feature.geometry.coordinates);
    const { kind, id, label, selected } = feature.properties;
    const group = element('g', {
      class: `atlas-marker ${markerClass(feature)}${selected ? ' is-selected' : ''}${count > 1 ? ' is-cluster' : ''}`,
      transform: `translate(${x} ${y})`, tabindex: '0', role: 'button',
      'data-kind': kind, 'data-id': id, 'data-label': label,
      'aria-label': count > 1 ? `${count} events near ${label}` : label
    });
    const scale = Math.max(1, detailLevel);
    group.append(element('circle', { class: 'marker-halo', r: (selected ? 18 : count > 1 ? 15 : 12) / scale }));
    shapeFor(group, feature, selected, detailLevel);
    if (selected) group.append(element('circle', { class: 'marker-pulse', r: 17 / scale }));
    if (count > 1) { group.append(element('circle',{class:'cluster-badge',r:(selected?12:10)/scale})); group.append(element('text', { class: 'cluster-count', x: '0', y: 2.6 / scale, 'font-size': Math.max(1.8, 6.2 / scale) }, `${count}`)); }
    group.append(element('title', {}, count > 1 ? `${count} grouped events near ${label}` : `${label} · ${kind}`));
    svg.append(group);
    const importantLabel = detailLevel >= 1.65 && (kind === 'replay' || kind === 'hazard' || (kind === 'incident' && ['verified', 'corroborated'].includes(feature.properties.stage)) || (kind === 'event' && ['growing'].includes(feature.properties.evolution)));
    if ((selected && detailLevel >= 1.2) || importantLabel) {
      const scale = Math.max(1, detailLevel);
      svg.append(element('text', { class: 'atlas-feature-label', x: x + 15 / scale, y: y - 12 / scale, 'font-size': Math.max(2, 9 / scale) }, String(label ?? '').slice(0, 34)));
    }
  }
}

export function renderAtlas(svg, { data, mode, view = ATLAS_VIEW }) {
  svg.replaceChildren();
  const detailLevel = Math.max(1, ATLAS_VIEW.width / Math.max(1, view.width));
  installDefs(svg);
  appendBase(svg, detailLevel);
  // The command views remain geographically legible at national zoom using the
  // real reference basemap. Operational overlays still come exclusively from
  // governed observations and incidents.
  if (detailLevel >= 1) {
    if (mode === 'live') {
      // Overview is a terrain-first operational briefing. The imagery and road
      // context are real provider tiles; physical markers are still rendered
      // exclusively from governed observations below.
      appendBasemap(svg, detailLevel, { kind: 'imagery', className: 'atlas-overview-imagery', clip: false });
      appendBasemap(svg, detailLevel, { kind: 'streets', className: 'atlas-overview-streets', clip: false });
    } else appendBasemap(svg, detailLevel);
  }
  svg.append(element('path', { class: `atlas-country-line atlas-country-line-top${detailLevel >= 1.7 ? ' is-local' : ''}`, d: linePath(PORTUGAL_MAINLAND_RING, true) }));
  if (mode === 'live') appendThermalOverlay(svg, data?.thermalOverlay);
  if (['live','replay','detect','command'].includes(mode)) appendEventGeometry(svg, data);
  if (mode === 'respond') appendSpread(svg, data);
  appendMarkers(svg, data, mode, detailLevel);
}
