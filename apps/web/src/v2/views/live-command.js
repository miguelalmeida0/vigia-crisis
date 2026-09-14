import { escapeHtml } from '../utils/html.js';
import { dateTime, isNumberValue, number, relativeTime, statusLabel } from '../utils/format.js';

const SOURCE_LABEL = Object.freeze({
  current: 'Current', available: 'Available', not_configured: 'Unavailable',
  unavailable: 'Unavailable', delayed: 'Delayed', stale: 'Delayed', empty: 'Acquired · no FRP points', catalogue_available: 'Catalogue ready · download locked', unknown: 'Unknown'
});

function sourceState(source) {
  return SOURCE_LABEL[source?.state ?? source?.selected?.state] ?? statusLabel(source?.state ?? source?.selected?.state ?? 'unknown');
}

function measure(value, suffix = '') {
  return isNumberValue(value) ? `${Math.round(Number(value))}${suffix}` : 'Unavailable';
}

function reportLabel(event) {
  const state = event.reportState?.sourceActivity;
  if (state === 'current') return `Current · ${relativeTime(event.reportState.lastAt)}`;
  if (state === 'delayed') return `Delayed · ${relativeTime(event.reportState.lastAt)}`;
  if (state === 'stale_open') return `Stale · ${relativeTime(event.reportState.lastAt)}`;
  if (state === 'closed') return 'Closed';
  return 'Not reported';
}

function physicalLabel(event) {
  const state = event.physicalState?.freshness;
  if (state === 'current') return `Observed · ${relativeTime(event.physicalState.lastAt)}`;
  if (state === 'delayed') return `Aging · ${relativeTime(event.physicalState.lastAt)}`;
  if (state === 'stale') return `Stale · ${relativeTime(event.physicalState.lastAt)}`;
  return 'Unobserved';
}

function nextKnowledge(event) {
  const state = event.evidenceNeed?.state;
  if (state === 'WAITING_FOR_SCHEDULED_OBSERVATION' || state === 'WAITING_FOR_OBSERVATION') return 'Waiting for remote observation';
  if (state === 'FIELD_CAPACITY_NOT_CONFIGURED') return 'Manual confirmation required';
  if (state === 'NO_AVAILABLE_OBSERVATION') return 'No automated observation available';
  if (state === 'REQUEST_ACTIVE') return event.evidenceNeed?.ownerId ? 'Evidence request in progress' : 'Assign an owner';
  if (event.actionNeed?.needsRouting) return 'Physical confirmation required';
  return 'Continue monitoring';
}

export function nationalCommandState(live,prevention={},evidenceNeeds=[],territory=null,detectionBenchmark=null) {
  const summary = { ...(live?.summary??{}), ...(territory?.summary??{}) };
  const physical = summary.physicalFireEvents ?? summary.currentPhysicalEvents ?? 0;
  const reportOnly = summary.reportOnlyIncidents ?? summary.needsPhysicalObservation ?? 0;
  const preIgnition=summary.preIgnitionFindings??prevention.summary?.screeningFindings??0;
  const openNeeds=(evidenceNeeds??[]).filter((item)=>item.state!=='RESOLVED').length;
  const viirs=live?.sources?.firms?.state??territory?.sensing?.firms??'not_configured',sentinel3=live?.sources?.sentinel3Pixels?.state??territory?.sensing?.sentinel3??'not_configured';
  const viirsAvailable=['current','stale','empty'].includes(viirs),sentinel3Available=['current','stale','empty'].includes(sentinel3);
  const sensing = viirsAvailable&&sentinel3Available ? viirs==='current'&&sentinel3==='current'?'Two-family current':'Two-family connected · delayed' : viirsAvailable||sentinel3Available ? 'Single-family live' : sentinel3==='catalogue_available' ? 'VIIRS delayed · SLSTR locked' : live?.sources?.thermal?.state === 'current' ? 'Context only' : 'Unavailable';
  const sensingTone=viirsAvailable&&sentinel3Available?'operational':viirsAvailable||sentinel3==='catalogue_available'?'degraded':'unavailable';
  const science=detectionBenchmark?.physicalSensingViirs?.smallFireOpportunityMetrics??detectionBenchmark?.smallFire?.cascade??null;
  const granules=detectionBenchmark?.physicalSensingViirs?.granuleMetrics??detectionBenchmark?.smallFire?.granuleSummary??null;
  const sentinelProof=detectionBenchmark?.physicalSensing?.sentinel3??null,runtimeS3=live?.sources?.sentinel3Pixels??{};
  const runtimeS3Products=Number(runtimeS3.acquiredProducts??0),runtimeS3Observations=Number(summary.sentinel3PhysicalObservations??runtimeS3.accepted??0),runtimeTwoFamily=Number(summary.viirsSentinel3Events??summary.twoPhysicalFamilyEvents??0),runtimeS3Proven=runtimeS3Products>0||runtimeS3Observations>0;
  const percent=(value)=>Number.isFinite(Number(value))?`${(Number(value)*100).toFixed(2)}%`:'UNMEASURED';
  const s3Proof=runtimeS3Proven?`${number(runtimeS3Products)} S3 products · ${number(runtimeS3Observations)} observations · ${number(runtimeTwoFamily)} VIIRS+S3`:`${number(sentinelProof?.positiveProducts??0)} Sentinel-3 positives`;
  const sensorProof=science?`<div class="sensor-proof-strip ${runtimeS3Proven?'is-multisensor-proven':''}"><span>GOVERNED SENSOR PROOF · REAL 2024 FIRES</span><strong>${number(granules?.activeFireGranulesAcquired??0)} VIIRS granules</strong><b>${number(science.productLevelGranuleProof??0)} product-level cases</b><b>${number(science.validOpportunity??0)} valid opportunities</b><b>${number(science.fireSignal??0)} native fire signals</b><b>${percent(science.sensorDetectionGivenValidOpportunity)} sensor recall</b><b>${escapeHtml(s3Proof)}</b></div>`:'';
  const notes = [];
  if (!physical) notes.push('No qualifying current physical evidence is present. This does not mean there is no fire.');
  if (live?.clocks?.mtg?.observedAt) notes.push(`Broad satellite context timestamp ${dateTime(live.clocks.mtg.observedAt)}; context only, not an event observation.`);
  return `<section class="national-command-state">
    <div class="shadow-capture-strip"><span>LIVE SHADOW CAPTURE ACTIVE</span><strong>${number(summary.prospectiveDetectionsCaptured??0)} prospective · ${number(summary.fullTimingCaptures??0)} full timing</strong><small>Last successful VIIRS poll ${escapeHtml(relativeTime(live?.sources?.firms?.lastSuccessAt))} · latest provider observation ${escapeHtml(relativeTime(live?.sources?.firms?.latestSourceObservation??live?.sources?.firms?.upstreamAt))}</small></div>
    <header><div><span>PORTUGAL · TERRITORY COMMAND</span><h2>${physical?`${physical} CURRENT PHYSICAL EVENT${physical===1?'':'S'}`:preIgnition?`${preIgnition} PRE-IGNITION CONDITION${preIgnition===1?'':'S'} REQUIRE REVIEW`:'NO CURRENT PHYSICAL EVENT · COVERAGE STATE EXPLICIT'}</h2></div><strong class="sensing-${sensingTone}">${escapeHtml(sensing)}</strong></header>
    ${sensorProof}
    <div class="national-command-metrics">
      <div><strong>${number(physical)}</strong><span>Physical fires now</span></div>
      <div><strong>${number(summary.thermalFireCandidates ?? summary.unreportedPhysicalCandidates ?? 0)}</strong><span>New physical candidates</span></div>
      <div><strong>${number(summary.unreportedPhysicalCandidates??0)}</strong><span>Physical-first / unreported</span></div>
      <div><strong>${number(reportOnly)}</strong><span>Report-only current</span></div>
      <div><strong>${escapeHtml(sensing)}</strong><span>Source coverage</span></div>
      <div><strong>${number(summary.twoPhysicalFamilyEvents ?? 0)}</strong><span>Multisource events</span></div>
      <div><strong>${number(preIgnition)}</strong><span>Pre-ignition</span></div>
    </div>
    <footer><span>VIIRS <b>${escapeHtml(sourceState(live?.sources?.firms))}</b></span><span>SENTINEL-3 / SLSTR <b>${escapeHtml(sourceState(live?.sources?.sentinel3Pixels))}</b></span><span>TWO-FAMILY EVENTS <b>${number(summary.twoPhysicalFamilyEvents ?? 0)}</b></span><span>INCIDENT REPORTS <b>${escapeHtml(sourceState(live?.sources?.fires))}</b></span></footer>
    ${notes.length ? `<p>${escapeHtml(notes.join(' '))}</p>` : ''}
  </section>`;
}

function responseBlock(response = {}) {
  const available = response.state === 'available';
  const status = response.status ? statusLabel(response.status) : 'Status unavailable';
  return `<section class="command-block response-block"><header><span>OFFICIAL RESPONSE</span><strong>${escapeHtml(status)}</strong></header>
    <div class="command-values">
      <div><span>Personnel</span><b>${available ? number(response.personnel) : '—'}</b></div>
      <div><span>Ground vehicles</span><b>${available ? number(response.groundVehicles) : '—'}</b></div>
      <div><span>Aircraft</span><b>${available ? number(response.aircraft) : '—'}</b></div>
    </div>
    <p>${available ? `${escapeHtml(response.source)} · updated ${escapeHtml(relativeTime(response.observedAt))}` : 'Response resource counts are unavailable from connected sources.'}</p></section>`;
}

function environmentBlock(event) {
  const weather = event.weather ?? {};
  const wind = isNumberValue(weather.windSpeedKph) ? `${Math.round(Number(weather.windSpeedKph))} km/h${weather.windDirection ? ` ${weather.windDirection}` : ''}` : 'Unavailable';
  return `<section class="command-block environment-block"><header><span>CONDITIONS</span><strong>${event.risk ? `${event.risk.level}/5 · ${escapeHtml(event.risk.label ?? '')}` : 'Fire danger unavailable'}</strong></header>
    <div class="command-values">
      <div><span>Temperature</span><b>${measure(weather.temperatureC, '°C')}</b></div>
      <div><span>Humidity</span><b>${measure(weather.humidityPercent, '%')}</b></div>
      <div><span>Wind</span><b>${escapeHtml(wind)}</b></div>
    </div>
    <p>${escapeHtml(weather.name ?? 'Weather station unavailable')}${weather.observedAt ? ` · ${escapeHtml(dateTime(weather.observedAt))}` : ''}</p></section>`;
}

export function incidentCommandSnapshot(event) {
  const behavior = event.behaviorState && event.behaviorState !== 'unknown' ? statusLabel(event.behaviorState) : 'Unknown';
  const viirsState = event.sensorCoverage?.viirs?.pointDetection ? 'Associated observation' : 'No associated observation';
  const sentinel3State = event.sensorCoverage?.sentinel3?.pointDetection ? 'Associated observation' : 'No associated observation';
  const familyCount=event.physicalSourceProfile?.familyCount??event.fireEvidenceState?.physicalSourceFamilyCount??0;
  return `<section class="incident-command-snapshot" aria-label="Incident command snapshot">
    <div class="incident-truth-strip">
      <div><span>Report state</span><strong>${escapeHtml(reportLabel(event))}</strong></div>
      <div><span>Physical state</span><strong>${escapeHtml(physicalLabel(event))}</strong></div>
      <div><span>Observed trend</span><strong>${escapeHtml(behavior)}</strong></div>
    </div>
    <div class="command-block-grid">${responseBlock(event.response)}${environmentBlock(event)}</div>
    <section class="command-block sensing-block"><header><span>SENSING</span><strong>${familyCount} physical ${familyCount===1?'family':'families'}</strong></header><p>VIIRS: ${escapeHtml(viirsState)} · Sentinel-3 / SLSTR: ${escapeHtml(sentinel3State)}. Broad thermal context: ${escapeHtml(event.mtg?.state === 'coverage_context' ? 'available · context only' : event.mtg?.state ? statusLabel(event.mtg.state) : 'not connected')}.</p></section>
    <section class="next-knowledge"><span>NEXT KNOWLEDGE</span><strong>${escapeHtml(nextKnowledge(event))}</strong><p>${escapeHtml(event.actionNeed?.reason ?? 'Maintain source monitoring and preserve the current evidence state.')}</p></section>
  </section>`;
}
