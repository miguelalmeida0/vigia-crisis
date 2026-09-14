import {e,button} from './html.js';
import {timeLabel} from '../../canonicalViewModel.js';
import {TrustDrawer} from './operator-answers.js';

const label=value=>String(value??'Unknown').toLowerCase().replaceAll('_',' ');
export function decisionIntelligenceMarkup(p){
  if(!p)return '';
  const debt=p.informationDebt;
  return `<details><summary>Decision support · gaps, deadlines and dependencies</summary>
    <p>${e(debt.missingIndependent)} incidents lack independent corroboration; ${e(debt.blockedDecisions)} decisions need information review; ${e(debt.unknownTaskDependencies)} task dependencies are unknown.</p>
    <p>Dependency coverage: ${e(p.graph.coverage.withNamedSource)} tasks name an observation source; ${e(p.graph.coverage.withNamedProvider)} name a provider or projection. ${e(p.graph.coverage.activeUnknownUpstreamSources)} active tasks still have unknown upstream source lineage. A named provider is not proof of that lineage.</p>
    ${p.assessments.map(a=>`<details><summary>What would change this assessment?</summary><ul>${a.transitionConditions.strengtheningConditions.map(c=>`<li>${e(c.condition)}</li>`).join('')}${a.transitionConditions.weakeningConditions.map(c=>`<li>${e(c)}</li>`).join('')}</ul>
      <h3>Missing evidence and collection options</h3><ul>${a.gaps.map(g=>`<li>${e(g.missingEvidenceType)}. ${e(g.resolutionCriteria.join(' '))}<ul>${g.availableCollectionOptions.map(o=>`<li>${e(o.label)}: ${e(label(o.availability))}; incident coverage ${o.coverage===true?'recorded':'not proven'}; collection rights ${e(label(o.rights))}.</li>`).join('')}</ul></li>`).join('')}</ul>
      <h3>Information actions</h3><ul>${a.collectionRecommendations.filter(r=>r.allowed).map(r=>`<li>${e(r.action)}. ${e(r.reasons.join(' '))} ${r.executable?'Eligible for human review.':'Not ready to execute.'}</li>`).join('')}</ul>
      <h3>Resolution path</h3><ol>${a.resolutionPath.steps.map(s=>`<li>${e(s.objective)}. ${e(s.resolutionCriteria.join(' '))}</li>`).join('')}</ol><p>${e(a.resolutionPath.estimatedCompletionBasis)}</p>
      <h3>Contradictions</h3>${a.contradictions.length?`<ul>${a.contradictions.map(c=>`<li>${e(c.assertionA?.state??'Attributable support')} versus ${e(c.assertionB?.state??'attributable contradiction')}. ${e(c.resolutionOptions.join(' '))}</li>`).join('')}</ul>`:'<p>No blocking contradiction is recorded in this assessment.</p>'}</details>`).join('')}
    <details><summary>Due next and blocked work</summary><ul>${p.temporal.conditions.map(c=>`<li>${e(label(c.condition))}: ${e(timeLabel(c.occursAt))}. ${e(c.operationalImpact)}</li>`).join('')}${p.readiness.map(r=>`<li>${e(r.title)}: ${e(label(r.state))}. ${e(r.reasons.join(' '))}<ul>${r.blockers.map(b=>`<li>${e(b.label)}: ${e(label(b.state))}</li>`).join('')}</ul></li>`).join('')}</ul></details>
    <details><summary>Shared dependencies and resource review</summary><ul>${p.coordination.shared.map(s=>`<li>${e(s.label)} is shared by ${e(s.incidentCount)} incidents. ${e(label(s.state))}.${s.type==='SOURCE'?button('Inspect failure assumption','intelligence-counterfactual',{extra:`data-id="${e(s.dependencyId)}"`}):''}</li>`).join('')}</ul><p>${e(p.coordination.contention.length)} returned resource-contention reviews. No automatic allocation.</p></details>
    <div data-intelligence-query data-query-incident="${e(p.inventory.assessments===1?p.assessments[0]?.incidentId:'')}"><label>Ask Vigia <input name="intelligence-question" maxlength="240" placeholder="What are conditions there?"></label><label>As of UTC (optional) <input name="intelligence-as-of" placeholder="2026-09-07T14:32:00Z" aria-label="Historical time in UTC"></label>
      ${button('Ask','intelligence-ask')}${button('Decision history','intelligence-history')}
      <p>Ask about conditions, detections, warnings, roads, exposure, changes, stale data, missing information or the source of a reading.</p>
      <div data-intelligence-answer role="status" aria-live="polite"></div>
    </div><p>As of ${e(timeLabel(p.asOf))}. ${e(p.truthBoundary)}</p>
  </details>`;
}

export function intelligenceAnswerMarkup(answer){
  if(answer.primaryAnswer)return `<p class="operator-question-answer">${e(answer.primaryAnswer)}</p><ul>${(answer.limitations??[]).map(l=>`<li>${e(l)}</li>`).join('')}</ul><p>As of ${e(answer.asOf)}.</p><details><summary>Why this answer?</summary>${(answer.supportingFacts??[]).map(f=>`<details><summary>${e(f.label)}</summary>${TrustDrawer(f)}</details>`).join('')}<p>${e(answer.auditRef)}</p></details>`;
  if(answer.simulation)return `<p>Read-only assumption: ${e(label(answer.assumption.kind))}. ${e(answer.changedReadiness.length)} readiness states change; ${e(answer.changedAssessments.length)} assessments change. Production was not modified.</p><ul>${answer.limitations.map(r=>`<li>${e(r)}</li>`).join('')}</ul>`;
  if(answer.decisions)return `<p>${e(answer.decisions.length)} returned decision records. Native snapshot history: ${e(label(answer.nativeHistoryState))}.</p><ul>${answer.decisions.map(d=>`<li>${e(timeLabel(d.timestamp))}: ${e(label(d.chosenAction))} by ${e(d.decisionMaker)}. ${e(d.operatorNote??'No operator note recorded.')}</li>`).join('')}</ul><p>${e(answer.boundary)}</p>`;
  return `<p>${e(answer.answer)}</p><ul>${(answer.results??[]).map(r=>`<li>${e(r.summary??r.action??r.objective??r.operationalImpact??r.reasons?.join(' ')??'Recorded dependency; inspect its evidence references.')}</li>`).join('')}</ul><p>${e(answer.reasons?.join(' '))} As of ${e(timeLabel(answer.asOf))}.</p><details><summary>Evidence references</summary><ul>${(answer.evidenceIds??[]).map(id=>`<li>${e(id)}</li>`).join('')}</ul></details>`;
}
