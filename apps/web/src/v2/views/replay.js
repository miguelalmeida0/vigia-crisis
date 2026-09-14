import { escapeHtml } from '../utils/html.js';
import { dateTime, number } from '../utils/format.js';
import { actions, metric, pill } from '../components/primitives.js';

export const replayFilters = Object.freeze([['all','All 35'],['physical_first','Physical first'],['associated','Joined'],['fragmented','Fragmented']]);
const pct = (value) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : 'Unmeasured';
const position = (value,start,end) => end > start ? Math.max(0,Math.min(100,(Date.parse(value)-start)/(end-start)*100)) : 0;
const visibleBy = (rows,at) => rows.filter((item) => Date.parse(item.visibleAt) <= Date.parse(at));

function replayMoment(detail,index) {
  const steps = detail?.controlledClock?.steps ?? [];
  const at = steps[Math.max(0,Math.min(steps.length - 1,index ?? steps.length - 1))];
  const visible = visibleBy(detail?.evidence ?? [],at);
  const thermal = visible.filter((item) => item.kind === 'thermal');
  const firstPhysicalAt = detail?.case?.firstThermalAt;
  const qualifyingThermal = thermal.filter((item) => !firstPhysicalAt || Date.parse(item.observedAt) >= Date.parse(firstPhysicalAt));
  const report = visible.find((item) => item.kind === 'report');
  const frames = (detail?.observedThermalFrames ?? []).filter((item) => Date.parse(item.visibleAt) <= Date.parse(at));
  return { steps,at,visible,thermal,qualifyingThermal,report,frames,frame:frames.at(-1) ?? null };
}

function knowledge(detail,moment) {
  const firstPhysicalAt = Date.parse(detail?.case?.firstThermalAt ?? '');
  if (!Number.isFinite(firstPhysicalAt) || Date.parse(moment.at) < firstPhysicalAt) return { state:'AWAITING FIRST PHYSICAL SIGNAL', tone:'empty', detail:moment.thermal.length ? `${moment.thermal.length} earlier observations remain unresolved or abstained.` : 'No qualifying physical event exists at this replay time.' };
  if (!moment.report) return { state:'PHYSICAL EVENT CREATED', tone:'physical', detail:'Qualifying physical sensor evidence is visible. No public report exists yet.' };
  return { state:'PUBLIC REPORT ASSOCIATED', tone:'joined', detail:'The official report joined the same canonical physical event.' };
}

function frpChart(frames,currentAt) {
  const visibleFrames = frames.filter((item) => Date.parse(item.visibleAt ?? item.at) <= Date.parse(currentAt));
  if (!visibleFrames.length) return '<div class="replay-frp-empty">No observed thermal-support frame is visible.</div>';
  const values = visibleFrames.map((item) => item.aggregateFrpMw ?? 0);
  const max = Math.max(1,...values);
  const points = visibleFrames.map((item,index) => `${visibleFrames.length === 1 ? 100 : index/(visibleFrames.length-1)*100},${38-(item.aggregateFrpMw??0)/max*34}`).join(' ');
  return `<div class="replay-frp"><svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Aggregate fire radiative power visible at the controlled clock"><polyline points="${points}"/><line x1="100" x2="100" y1="0" y2="40"/></svg><div><span>FRP · OBSERVED SUPPORT</span><strong>${number(visibleFrames.at(-1)?.aggregateFrpMw ?? 0)} MW</strong></div></div>`;
}

function laneDots(rows,start,end,currentAt,className) {
  return rows.map((item) => `<i class="${className} ${Date.parse(item.visibleAt) <= Date.parse(currentAt) ? 'is-visible' : ''}" style="left:${position(item.visibleAt,start,end).toFixed(2)}%" title="${escapeHtml(`${dateTime(item.visibleAt)} · ${item.platform ?? item.source}`)}"></i>`).join('');
}

function timelineLanes(detail,moment,start,end) {
  const visibleEvidence = (detail.evidence ?? []).filter((item) => Date.parse(item.visibleAt) <= Date.parse(moment.at));
  const physical = visibleEvidence.filter((item) => item.kind === 'thermal'),viirs=physical.filter((item)=>item.sourceFamily==='viirs'||/VIIRS/i.test(item.sensor??'')),sentinel3=physical.filter((item)=>item.sourceFamily==='sentinel3_slstr');
  const reports = visibleEvidence.filter((item) => item.kind === 'report');
  const ambiguous = physical.filter((item) => item.association?.state === 'ambiguous');
  const first = Date.parse(detail.case?.firstThermalAt) <= Date.parse(moment.at) ? detail.case.firstThermalAt : null;
  const report = Date.parse(detail.case?.alertAt) <= Date.parse(moment.at) ? detail.case.alertAt : null;
  const identityStart = first ? position(first,start,end) : 0;
  const identityWidth = first ? Math.max(0,position(moment.at,start,end)-identityStart) : 0;
  return `<div class="replay-lanes" aria-label="Synchronized evidence timeline">
    <div><span>VIIRS</span><b>${laneDots(viirs,start,end,moment.at,'lane-physical')}</b></div>
    <div><span>S3 / SLSTR</span><b>${laneDots(sentinel3,start,end,moment.at,'lane-sentinel3')}</b></div>
    <div><span>Public report</span><b>${laneDots(reports,start,end,moment.at,'lane-report')}</b></div>
    <div><span>Canonical identity</span><b><em class="identity-line" style="left:${identityStart.toFixed(2)}%;width:${identityWidth.toFixed(2)}%"></em></b></div>
    <div><span>Ambiguity / abstention</span><b>${laneDots(ambiguous,start,end,moment.at,'lane-ambiguity')}</b></div>
    <div class="lane-milestones"><span>Milestones</span><b>${first ? `<i class="milestone physical" style="left:${position(first,start,end).toFixed(2)}%">PHYSICAL</i>` : ''}${report ? `<i class="milestone report" style="left:${position(report,start,end).toFixed(2)}%">REPORT</i>` : ''}</b></div>
  </div>`;
}

export function replaySummary(state) {
  if (state.replay?.state === 'unavailable') return `<div class="summary-hero unavailable"><strong>—</strong><span>replay unavailable</span></div><p class="summary-note">The governed archive was not loaded, so no replay metric is presented.</p><button type="button" class="summary-drilldown" data-action="refresh">Retry replay</button>`;
  const metrics = state.replay?.benchmark?.validation?.metrics ?? {};
  const held = metrics.splitMetrics?.held_out ?? {};
  return `<div class="replay-heldout-summary"><span>HELD-OUT EVALUATION · ${number(held.caseCount ?? 0)} CASES</span><strong>${pct(held.observationLevelAssociationAccuracy)}</strong><p>Observation association</p></div><div class="summary-grid replay-validation-grid"><div><strong>${pct(held.reportJoinAccuracy)}</strong><span>Report join</span></div><div><strong>${pct(held.ambiguityRate)}</strong><span>Abstention</span></div><div><strong>${number(state.replay?.benchmark?.softwareReplay?.futureEvidenceViolations ?? 0)}</strong><span>Future leaks</span></div></div><div class="summary-contract">${number(metrics.caseCount ?? 0)} real incidents · ${number(metrics.physicalFirstCases ?? 0)} physical-first · median ${number(metrics.physicalLeadMedianMinutes ?? 0)}m observation→report</div>`;
}

export function replayIntro(state) {
  if (state.replay?.state === 'unavailable') return `<div class="replay-stage-status is-unavailable"><div><span class="replay-label">OFFICIAL REPLAY</span><i></i><strong>ARCHIVE UNAVAILABLE</strong></div><h2>REPLAY NOT RESOLVED</h2><p>${escapeHtml(state.replay.error ?? 'The governed archive did not load.')}</p></div>`;
  const hero = state.replay?.cases?.find((item) => item.hero);
  const selected = state.replay?.cases?.find((item) => item.id === state.selected?.id) ?? hero;
  if (!selected) return '';
  const families=selected.physicalSourceFamilies??['viirs'];
  return `<div class="replay-stage-status"><div><span class="replay-label">REAL EVIDENCE · CONTROLLED CLOCK</span><i></i><strong>${escapeHtml(selected.evaluationSplit?.replaceAll('_',' ') ?? 'governed corpus')}</strong></div><h2>${escapeHtml(selected.municipality)} <em>${escapeHtml(dateTime(selected.alertAt).split(',')[0])}</em></h2><p>${number(selected.thermalObservationCount)} retained physical observations · ${escapeHtml(families.join(' + '))} · ${selected.twoPhysicalFamilies?'TWO PHYSICAL FAMILIES':`${number((selected.independentPlatforms ?? []).length)} platforms`} · ${selected.physicalFirst ? `${number(selected.physicalLeadMinutes)}m observation→report` : 'report first'}</p></div>`;
}

export function renderReplayOverlay(state) {
  if (state.replay?.state === 'unavailable') return `<div class="replay-instrument service-unavailable"><div><span>REPLAY WORKSPACE UNAVAILABLE</span><strong>Governed archive state was not loaded.</strong><p>${escapeHtml(state.replay.error ?? 'The replay service did not complete.')}</p></div><button type="button" data-action="refresh">Retry replay</button></div>`;
  if (state.replayLoading) return '<div class="replay-instrument loading"><strong>Projecting the real evidence clock…</strong><span>Association · support geometry · provenance</span></div>';
  const detail = state.replayCase;
  if (!detail) return '<div class="replay-instrument"><strong>Select a real incident.</strong></div>';
  const moment = replayMoment(detail,state.replayTimeIndex);
  const known = knowledge(detail,moment);
  const start = Date.parse(moment.steps[0]);
  const end = Date.parse(moment.steps.at(-1));
  const caseItem = detail.case;
  const reportInterval = moment.report && caseItem.physicalFirst ? `Observation timestamp preceded report by ${caseItem.physicalLeadMinutes} min.` : 'Later evidence remains hidden.';
  return `<div class="replay-instrument">
    <header><div><span>KNOWLEDGE AT</span><strong>${escapeHtml(dateTime(moment.at))}</strong></div><div class="replay-knowledge ${known.tone}"><b>${known.state}</b><small>${escapeHtml(known.detail)}</small></div></header>
    <div class="replay-jumps"><button type="button" data-action="replay-jump-start">Start from beginning</button><button type="button" data-action="replay-jump-physical">Jump first physical</button><button type="button" data-action="replay-jump-report">Jump public report</button></div>
    <div class="replay-body"><div class="replay-controls"><button type="button" data-action="${state.replayPlaying ? 'replay-pause' : 'replay-play'}" aria-label="${state.replayPlaying ? 'Pause' : 'Play'} replay">${state.replayPlaying ? 'Ⅱ' : '▶'}</button>${[1,5,20].map((speed) => `<button type="button" class="${Number(state.replaySpeed ?? 1) === speed ? 'is-active' : ''}" data-action="replay-speed" data-speed="${speed}">${speed}×</button>`).join('')}<button type="button" data-action="replay-step" aria-label="Step to next evidence arrival">STEP →</button></div><div class="replay-timeline-stack"><div class="replay-rail"><input type="range" min="0" max="${Math.max(0,moment.steps.length-1)}" value="${Math.max(0,moment.steps.indexOf(moment.at))}" step="1" data-replay-range aria-label="Real incident replay timeline"><div class="replay-rail-labels"><span>BEGIN<br>${escapeHtml(dateTime(moment.steps[0]))}</span><b>${moment.frame ? `${moment.frame.activePixelCount} active support · ${number(moment.frame.aggregateFrpMw)} MW` : 'No physical frame'}</b><span>END<br>${escapeHtml(dateTime(moment.steps.at(-1)))}</span></div></div>${timelineLanes(detail,moment,start,end)}</div>${frpChart(detail.observedThermalFrames ?? [],moment.at)}</div>
    <footer><span>${moment.qualifyingThermal.length} qualifying observations visible · ${moment.frame?.sourceFamilies?.length ?? 0} physical famil${moment.frame?.sourceFamilies?.length === 1 ? 'y' : 'ies'}</span><span>${escapeHtml(reportInterval)} Provider delivery latency unmeasured.</span></footer>
  </div>`;
}

function evidenceMatrix(detail,moment,benchmark) {
  const byPlatform = new Map();
  for (const item of moment.qualifyingThermal) {
    const current = byPlatform.get(item.platform) ?? { count:0, latest:null, peak:0 };
    current.count += 1; current.latest = item.observedAt; current.peak = Math.max(current.peak,Number(item.frpMw) || 0); byPlatform.set(item.platform,current);
  }
  const platforms = [...byPlatform.entries()].map(([name,value]) => `<div class="matrix-platform"><strong>${escapeHtml(name)}</strong><span>${value.count} observations · peak ${number(value.peak)} MW</span><small>Latest ${escapeHtml(dateTime(value.latest))}</small></div>`).join('');
  const abstained = Number(benchmark?.unresolvedObservationCount ?? 0);
  return `<div class="evidence-matrix"><article><span>PHYSICAL EVIDENCE</span><strong>${moment.qualifyingThermal.length} qualifying sensor observations</strong>${platforms || '<p>No qualifying physical evidence at this clock time.</p>'}</article><article><span>REPORT EVIDENCE</span><strong>${moment.report ? 'ICNF report visible' : 'Public report not yet received'}</strong><p>${moment.report ? escapeHtml(dateTime(moment.report.observedAt)) : 'Later report evidence is not backfilled.'}</p></article><article><span>CONTRADICTIONS / AMBIGUITY</span><strong>${abstained} observations abstained</strong><p>Preserved outside canonical identity when the report anchor is not strong enough.</p></article><article><span>COVERAGE GAPS</span><strong>Provider delivery latency unmeasured</strong><p>Observed support is not an authoritative fire perimeter.</p></article></div>`;
}

function observationRows(moment) {
  if (!moment.visible.length) return '<p class="queue-empty">No evidence is visible at this moment.</p>';
  return moment.visible.slice(-10).reverse().map((item) => `<button type="button" class="replay-evidence-row" data-action="provenance" data-id="${escapeHtml(item.id)}"><i class="${escapeHtml(item.kind)}"></i><span><b>${escapeHtml(item.kind === 'thermal' ? item.platform : 'ICNF report')}</b><small>${escapeHtml(dateTime(item.observedAt))}${Number.isFinite(item.frpMw) ? ` · ${number(item.frpMw)} MW` : ''}</small></span><em>PROVENANCE →</em></button>`).join('');
}

export function replayInspector(state,item) {
  if (!item) return { kicker:'REPLAY CASE', content:'<section class="inspector-section"><h2>Select a real incident.</h2></section>', actions:'' };
  if (state.replayLoading) return { kicker:'REAL INCIDENT', content:'<section class="inspector-section"><h2>Resolving evidence state…</h2><p class="deck">The production association and geometry path is processing the archive.</p></section>', actions:'' };
  const detail = state.replayCase;
  const benchmark = item.benchmark ?? detail?.benchmark ?? {};
  const moment = replayMoment(detail,state.replayTimeIndex);
  const known = knowledge(detail,moment);
  const eventCount = new Set(benchmark.predictedEventIds ?? []).size;
  const frame = moment.frame;
  const change = frame?.change ?? {};
  return { kicker:`REAL INCIDENT · ${item.officialReportId}`, content:`<section class="inspector-section replay-identity"><div class="detail-kicker"><span>${item.hero ? 'FLAGSHIP PHYSICAL-FIRST CASE' : escapeHtml(item.evaluationSplit ?? 'GOVERNED CORPUS')}</span>${pill(item.physicalFirst ? 'verified' : 'reported',item.physicalFirst ? 'Physical first' : 'Report first')}</div><h2>${escapeHtml(item.municipality)}</h2><p>${escapeHtml(item.parish)} · ${escapeHtml(item.district)} · ${escapeHtml(item.id)}</p></section><div class="metric-row">${metric(item.physicalFirst ? `${item.physicalLeadMinutes} min` : 'None','observation→report')}${metric(`${moment.qualifyingThermal.length}/${item.thermalObservationCount}`,'observations revealed')}${metric(`${eventCount || 1}`,'canonical event')}</div><section class="inspector-section"><div class="section-label">CURRENT KNOWLEDGE</div><div class="knowledge-card ${known.tone}"><strong>${escapeHtml(known.state)}</strong><p>${escapeHtml(known.detail)}</p></div></section><section class="inspector-section"><div class="section-label">CURRENT PHYSICAL FRAME</div><div class="frame-readout"><div><span>ACTIVE THERMAL SUPPORT</span><strong>${number(frame?.activePixelCount ?? 0)}</strong></div><div><span>AGGREGATE FRP</span><strong>${number(frame?.aggregateFrpMw ?? 0)} MW</strong></div><div><span>NEW / PERSISTING</span><strong>${number(change.newSupport ?? 0)} / ${number(change.persistingSupport ?? 0)}</strong></div><div><span>NO LONGER OBSERVED</span><strong>${number(change.noLongerObservedSupport ?? 0)}</strong></div><div><span>CENTROID CHANGE</span><strong>${Number.isFinite(change.centroidMovementKm) ? `${number(change.centroidMovementKm)} km` : 'Unmeasured'}</strong></div></div><p class="instrument-caution">Sensor-supported geometry, never a claimed fire perimeter. No longer observed does not mean extinguished.</p></section><section class="inspector-section"><div class="section-label">EVIDENCE MATRIX</div>${evidenceMatrix(detail,moment,benchmark)}</section><section class="inspector-section"><div class="section-label">VISIBLE EVIDENCE</div>${observationRows(moment)}</section><section class="inspector-section"><div class="section-label">ASSOCIATION</div><div class="association-result"><strong>${benchmark.associated ? 'PUBLIC REPORT JOINED' : 'UNRESOLVED'}</strong><span>${benchmark.fragmented ? 'Fragmented canonical identity' : benchmark.unresolvedObservationCount ? `${benchmark.unresolvedObservationCount} observations abstained` : 'One stable canonical event'}</span><p>Fit is an interpretable ranking score, not a calibrated probability.</p></div></section><section class="inspector-section"><div class="section-label">TIMING QUALIFICATION</div><div class="trust-banner">${escapeHtml(item.physicalLeadBasis)} Provider delivery latency and exact ignition lead remain unmeasured.</div></section>`, actions:actions([{action:'validation',label:'Open system evidence',kind:'primary'},{action:'sources',label:'Archive provenance'}]) };
}
