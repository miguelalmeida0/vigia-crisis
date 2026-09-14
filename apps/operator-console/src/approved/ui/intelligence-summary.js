import {DetailRows,TechnicalDetails} from './measurement-panel.js';
import { e, panel, button } from './html.js';
import { value, timeLabel } from '../../canonicalViewModel.js';
import { decisionIntelligenceMarkup } from './decision-intelligence.js';

export function intelligenceSummary(vm) {
  const intelligence = value(vm.source,'operationalIntelligence');
  if (!intelligence) return '';
  const selected = intelligence.incidents?.find(item=>String(item.incidentId).replace(/^incident:/,'')===String(vm.selected).replace(/^incident:/,''));
  const principal = vm.runtime.runtime?.session?.actor?.id;
  const seen = principal ? vm.runtime.intelligenceReviewedChanges?.[principal] ?? [] : [];
  const watches=value(vm.source,'decisionIntelligence')?.watches??[];
  const changes = [...new Map([...(intelligence.changes??[]),...watches.map(w=>({...w,timestamp:w.at,whyItMatters:w.conditionAsOf?'Continuing condition; first appearance time is not established.':null}))].map(item=>[item.id,item])).values()].filter(item=>!seen.includes(item.id));
  const recommendations = selected?.recommendations??[];
  const explanation = selected?.explanation;
  const body = `<div class="panel-pad">
    ${decisionIntelligenceMarkup(value(vm.source,'decisionIntelligence'))}
    ${selected?.assessment?`<p>${e(selected.assessment.summary)}</p>`:''}
    ${intelligence.sourceBlastRadius?.length?TechnicalDetails('Supporting source interruptions',DetailRows(intelligence.sourceBlastRadius.slice(0,3).map(item=>[item.summary,'Last healthy: '+(item.lastHealthyAt?timeLabel(item.lastHealthyAt):'not reported')]))):''}
    ${explanation?`<details><summary>Why this assessment?</summary><ul>${explanation.reasons.map(reason=>`<li>${e(reason)}</li>`).join('')}</ul><p>${e(selected.assessment.boundary)}</p><details><summary>Evidence and rules</summary><ul>${[...explanation.evidenceIds,...explanation.ruleIds].map(id=>`<li>${e(id)}</li>`).join('')}</ul></details></details>`:''}
    ${recommendations.slice(0,3).map(item=>`<details><summary>Recommended next action: ${e(item.what)}</summary><p>${e(item.why)}</p><p>Resolves when: ${e(item.unlockCondition)}</p><p>Owner: ${e(item.owner??'Not assigned')} · ${item.allowed?'Your session may manage governed work.':'Read-only recommendation; incident-command permission is required.'}</p>${button('Review incident work',`open-incident-route:operations:${item.incidentId}`)}<p>No assignment or dispatch occurs from this recommendation.</p></details>`).join('')}
    <details><summary>Changes and watch conditions to review · ${changes.length}</summary>
      <ul>${changes.slice(0,10).map(item=>`<li><time>${e(item.timestamp?timeLabel(item.timestamp):`Condition evaluated ${timeLabel(item.conditionAsOf)}`)}</time> — ${e(item.summary)}<p>${e(item.whyItMatters)}</p></li>`).join('')}</ul>
      ${changes.length&&principal?button('Mark returned changes reviewed','intelligence-review'):''}
    </details>
    <p>Assessment as of ${e(timeLabel(intelligence.generatedAt))}. Operational priority is not physical hazard severity.</p>
  </div>`;
  return panel('Operational intelligence',body);
}
