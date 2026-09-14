import {DetailRows,TechnicalDetails,readableAge} from './measurement-panel.js';
import {timeLabel} from '../../canonicalViewModel.js';
import { e, button } from './html.js';
import { displayMetric } from '../data/physical.js';

export function AnswerRow(vm,key,label) {
  const a=vm.answers?.[key];
  if(!a?.primaryAnswer||/\bunknown\b|not connected|not reported|unavailable|not available|has not been reported|no dated material change/i.test(a.primaryAnswer))return '';
  return `<div class="operator-answer" data-answer="${e(key)}"><div><h3>${e(label)}</h3>${button('Why this?','answer-inspect',{tone:'fact-inspect',extra:`data-id="${e(key)}"`})}</div><p>${e(a?.primaryAnswer??'This answer is not available for the selected incident.')}</p></div>`;
}
export function AskVigia(incidentId='') {
  return `<div class="operator-ask" data-intelligence-query data-query-incident="${e(incidentId)}"><p>Ask about conditions, fire detections, official warnings, roads, exposed places, changes or missing information.</p><label>Question<input name="intelligence-question" maxlength="240" placeholder="What don’t we know?" value="What don't we know?"></label><label>As of (UTC, optional)<input name="intelligence-as-of" placeholder="2026-09-08T14:32:00Z" aria-label="Historical time in UTC"></label>${button('Ask Vigia','intelligence-ask',{tone:'primary'})}<div data-intelligence-answer role="status" aria-live="polite"></div></div>`;
}
export function TrustDrawer(fact) {
  if(!fact)return '<p>No attributable fact was returned for this selection.</p>';
  const m=displayMetric(fact),definition=fact.definition;
  const def=definition?Object.entries(definition).map(([k,v])=>`${k.replace(/([a-z])([A-Z])/g,'$1 $2')}: ${Array.isArray(v)?v.join(' × '):v??'not supplied'}`).join(' · '):'Definition not supplied by the source.';
  const fields=[['Source',fact.sourceName??fact.source],['Original observation (UTC)',fact.observedAt??fact.asOf],['Received by Vigia (UTC)',fact.receivedAt],['Calculated by Vigia (UTC)',fact.calculatedAt],['Station / place',fact.sourceLocation?.name??fact.location],['Source coordinates (longitude, latitude)',fact.sourceLocation?.coordinate?.join(', ')],['Distance from incident',fact.distanceToSubject===null||fact.distanceToSubject===undefined?null:fact.distanceToSubject+' km'],['Freshness',m.freshnessLabel],['Expiry (UTC)',fact.expiresAt],['Measurement definition',def],['Spatial use',fact.suitability?.state?.replaceAll('_',' ').toLowerCase()],['Transformation',fact.transformation],['Provenance reference',fact.provenanceRef],['Normalizer / rule / model version',fact.version]];
  return `<div class="trust-drawer ux-trust" data-vqa="trust-drawer"><p class="trust-fact"><strong>${e(fact.label)}: ${e(m.display)}${m.available&&m.unit?' '+e(m.unit):''}</strong></p>
  ${DetailRows([['Source',fact.sourceName??fact.source],['Measured',timeLabel(fact.observedAt??fact.asOf)],['Station / place',fact.sourceLocation?.name??fact.location],['Distance from incident',fact.distanceToSubject===null||fact.distanceToSubject===undefined?null:fact.distanceToSubject+' km'],['Freshness',readableAge(m.freshnessLabel)]])}
  <section class="ux-limits"><h3>How to use this reading</h3><ul>${(fact.limitations?.length?fact.limitations:[fact.context??fact.reason??'No additional limitation supplied.']).map(l=>`<li>${e(l)}</li>`).join('')}</ul></section>
  ${TechnicalDetails('Technical measurement details',DetailRows(fields.map(([label,value])=>[label,value??'Not supplied'])))}
  ${TechnicalDetails('Supporting sources and conflicting reports',`<h4>Supporting sources</h4><p>${e(fact.supportingSources?.length?fact.supportingSources.map(s=>s.name??s.label??s.sourceId??'Source').join(' · '):'No additional supporting source is attached to this fact.')}</p><h4>Conflicting reports</h4><p>${e(fact.conflicts?.length?fact.conflicts.map(c=>c.summary??c.reason??'Recorded conflict').join(' · '):'No conflicting report was returned. This is not proof of agreement.')}</p>`)}
  </div>`;

}
