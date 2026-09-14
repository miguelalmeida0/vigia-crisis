import { thermalChart } from './event-presenter.js';
import { escapeHtml } from '../utils/html.js';
import { number, statusLabel } from '../utils/format.js';

export function analysisInstrument(event,state) {
  if (!state.analysisMode) return '';
  const physical = event.fireEvidenceState?.physicalEvidence ?? [];
  const thermalObservations=(event.observations??[]).filter((item)=>item.type==='thermal');
  const sourceProfile=event.physicalSourceProfile??{};
  const declaredObservations=physical.reduce((sum,item)=>sum+Number(item.observationCount??0),0);
  const observations=Math.max(declaredObservations,Number(sourceProfile.observationCount??0),thermalObservations.length);
  const familyCount=Math.max(physical.length,Number(sourceProfile.familyCount??0),new Set(thermalObservations.map((item)=>item.sourceFamily).filter(Boolean)).size);
  const support = event.observedThermalSupport?.properties ?? {};
  const supportCount=Math.max(Number(support.observationCount??0),Number(event.thermal?.samples??0),thermalObservations.length);
  const derivedThermalSeries=thermalObservations.map((item)=>({at:item.at??item.observedAt,frpMw:Number(item.frpMw)})).filter((item)=>Number.isFinite(Date.parse(item.at))&&Number.isFinite(item.frpMw)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const chartEvent=event.thermalSeries?.length||event.thermal?.series?.length?event:{...event,thermalSeries:derivedThermalSeries};
  const movement = event.movement;
  const movementLabel = movement?.direction === 'moving'
    ? `${number(movement.distanceKm)} km centroid displacement · ${number(movement.bearingDeg)}°`
    : movement?.direction === 'stationary' ? 'No material centroid displacement observed' : 'Unmeasured';
  return `<section class="living-fire-analysis" aria-label="Living Fire analysis">
    <header><div><span>LIVING FIRE ANALYSIS</span><strong>${escapeHtml(event.label)}</strong></div><p>Observed support and source history only. This is not a flame-front perimeter or spread forecast.</p></header>
    <div class="living-fire-measures">
      <article><span>EVIDENCE STATE</span><strong>${escapeHtml(statusLabel(event.fireEvidenceState?.state ?? event.evidenceState ?? 'unknown'))}</strong><small>${familyCount} independent physical group${familyCount === 1 ? '' : 's'}</small></article>
      <article><span>PHYSICAL FRESHNESS</span><strong>${escapeHtml(statusLabel(event.physicalState?.freshness ?? 'unobserved'))}</strong><small>${observations} associated physical observation${observations === 1 ? '' : 's'}</small></article>
      <article><span>OBSERVED SUPPORT</span><strong>${number(supportCount)} detections</strong><small>${escapeHtml(event.geometryFreshness ? `${statusLabel(event.geometryFreshness)} geometry` : 'Geometry unmeasured')}</small></article>
      <article><span>OBSERVED MOVEMENT</span><strong>${escapeHtml(movementLabel)}</strong><small>Thermal-support centroid, not fire-front motion</small></article>
    </div>
    ${thermalChart(chartEvent)}
  </section>`;
}
