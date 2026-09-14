import { escapeHtml } from '../utils/html.js';

export function incidentsSummary(state) {
  const s = state.live?.summary ?? {};
  return `<section class="detect-queue-summary"><div><span>PHYSICAL FIRES NOW</span><strong>${s.currentPhysicalEvents??0}</strong></div><div><span>PHYSICAL-FIRST</span><strong>${s.currentPhysicalCandidates??0}</strong></div><div><span>REPORT-ONLY</span><strong>${s.needsPhysicalObservation??0}</strong></div><div class="two-family-metric"><strong>${s.twoPhysicalFamilyEvents??0}</strong><span>two-family physical</span></div><p>Public reports and physical observations remain separate evidence states.</p></section>`;
}

export function incidentsIntro(state) {
  const s = state.live?.summary ?? {};
  return `<section class="detect-map-brief"><span>DETECT · LIVE PHYSICAL MAP</span><strong>${s.currentPhysicalEvents??0} physical now · ${s.currentPhysicalCandidates??0} physical-first · ${s.currentReportEvents??0} reports</strong><small>${s.twoPhysicalFamilyEvents??0} VIIRS + Sentinel-3 retained event${s.twoPhysicalFamilyEvents===1?'':'s'} · select a case for NOW / NEXT / WHY</small></section>`;
}

export const incidentFilters = [['all','All'],['current','Current reports'],['supported','Multisource'],['stale','Stale'],['needs_check','Needs confirmation']];
