import {e, button} from './html.js';

// Upgrades the existing Intelligence Gaps section in place. No new route, no new
// dashboard, no contradiction UI, no score.
//
// The composition follows the established operational-picture anatomy: a compact
// article per gap, the physical/operational fact first, the machinery (source
// state, provenance, requirement identity) in the disclosure underneath.

const btn = (label, cmd, attrs = '', primary = false) => button(label, 'op-' + cmd, {tone: primary ? 'primary' : '', extra: attrs});
const date = (value) => value ? new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'}).format(new Date(value)) + ' UTC' : 'Time unavailable';

const CLASS_LABEL = {
  FACILITY_CAPABILITY: 'Capability verification',
  FACILITY_IDENTITY: 'Identity resolution',
  PUBLIC_CONTACT: 'Published contact',
  ROAD_INFORMATION: 'Road information',
  RECEPTION_ACTIVATION: 'Reception activation',
  OFFICIAL_DESIGNATION: 'Official designation',
  ROUTE_MISSING: 'Calculated route',
  SOURCE_STALE: 'Source freshness',
  PHYSICAL_OBSERVATION_GAP: 'Physical observation'
};

const OUTPUT_LABEL = {
  QUALIFIED_NEAREST_RANKING: 'qualified-nearest ranking',
  SUPPORT_ALTERNATIVES: 'support alternatives',
  COMMUNITY_SUPPORT: 'community support',
  COVERAGE_CLASS: 'coverage classification',
  OPERATIONAL_SUPPORT_BRIEF: 'operational support brief',
  SHARED_ROAD_DEPENDENCY: 'shared-road dependency',
  RECEPTION_RESULT: 'reception result',
  INTELLIGENCE_GAPS: 'intelligence gaps',
  ASK_ANSWERABILITY: 'Ask VIGIA answerability'
};

const sourceLine = (tasking) => {
  if (!tasking) return 'Source status not read.';
  if (tasking.state === 'NO_REGISTERED_SOURCE') return 'No approved registered source is linked to this subject.';
  if (tasking.state === 'OWNED_BY_ACQUISITION_LANE') return 'Answered by the configured acquisition pipeline.';
  const first = tasking.sources?.[0];
  if (!first) return 'Approved source registered.';
  return `${first.provider ?? first.sourceId} · ${first.health.state.toLowerCase().replaceAll('_', ' ')}${first.manualReviewRequired ? ' · review required' : ''}`;
};

/**
 * The upgraded Intelligence Gaps body.
 *
 * `gaps` are the existing picture gaps; `collection` is the collection-intelligence
 * payload. When collection intelligence is unavailable the original gap list is
 * rendered unchanged, so the section never becomes worse than it was.
 */
export function IntelligenceGapsMarkup(gaps = [], collection = null) {
  if (!collection?.tasks?.length) {
    return (gaps.map((gap) => `<article class="op-dependency"><h3>${e(gap.category)}</h3><p>${e(gap.text)}</p><p class="op-meta">${gap.state === 'SOURCE_UNAVAILABLE' ? 'Source unavailable' : 'Not retained in this incident context'}</p></article>`).join('')
      || '<p>No retained intelligence gap in this incident context.</p>')
      + (collection?.unavailableReason ? `<p class="op-meta">${e(collection.unavailableReason)}</p>` : '');
  }

  const head = `<p class="op-meta">${collection.tasks.length} of ${collection.total} information requirements shown, ordered by explicit operational factors · evaluated ${e(date(collection.evaluatedAt))}</p>`;
  return head + collection.tasks.map((task) => {
    const known = task.currentKnownState ?? {};
    const impact = [];
    if (known.qualifiedFacilityCount === 1) impact.push('one retained qualified option');
    if (task.factors.affectedCommunityCount) impact.push(`${task.factors.affectedCommunityCount} ${task.factors.affectedCommunityCount === 1 ? 'community' : 'communities'}`);
    if (task.factors.affectedSupportRelationshipCount) impact.push(`${task.factors.affectedSupportRelationshipCount} support ${task.factors.affectedSupportRelationshipCount === 1 ? 'relationship' : 'relationships'}`);
    const candidate = Array.isArray(known.candidates) ? known.candidates[0] : null;
    return `<article class="op-dependency" data-requirement="${e(task.requirementId)}">
<h3>${e(task.subject.name)}</h3>
<p>${e(task.question)}</p>
<dl class="op-requirement">
<div><dt>Operational impact</dt><dd>${e(impact.join(' · ') || 'No retained dependency measured')}</dd></div>
${candidate ? `<div><dt>Next verification</dt><dd>${e(candidate.name)}${Number.isFinite(candidate.distanceKm) ? ' · ' + candidate.distanceKm.toFixed(1) + ' km' : ''}${candidate.retainedRouteExists ? '' : ' · no retained calculated route'}</dd></div>` : ''}
<div><dt>Why</dt><dd>${e(task.reasons[0] ?? 'Ordered by the declared operational factors')}</dd></div>
<div><dt>Approved source</dt><dd>${e(sourceLine(task.sourceTasking))}</dd></div>
</dl>
<div class="op-tools">${btn('Inspect requirement', 'requirement', `data-requirement="${e(task.requirementId)}"`)}${task.availablePreview ? btn('Preview knowledge impact', 'preview', `data-requirement="${e(task.requirementId)}"`, true) : ''}${btn('View approved sources', 'requirement-sources', `data-requirement="${e(task.requirementId)}"`)}</div>
<p class="op-meta">${e(CLASS_LABEL[task.requirementClass] ?? task.requirementClass)} · ${e(String(known.state ?? '').toLowerCase().replaceAll('_', ' ') || 'state not retained')}</p>
</article>`;
  }).join('');
}

/** Detail view for one requirement: the deterministic causal explanation. */
export function RequirementDetailMarkup(detail) {
  if (!detail?.requirement) return '<p>This information requirement is no longer retained.</p>';
  const {requirement, explanation, availablePreview} = detail;
  return `<article class="op-dependency">
<h3>${e(requirement.subject.name)}</h3>
<p>${e(requirement.question)}</p>
<h4>Why this requirement?</h4>
<ul>${explanation.facts.map((fact) => `<li>${e(fact)}</li>`).join('')}</ul>
<p>${e(explanation.consequenceIfResolved)}</p>
<h4>What depends on it</h4>
<p>${e(requirement.dependentOutputs.map((output) => OUTPUT_LABEL[output] ?? output.toLowerCase().replaceAll('_', ' ')).join(', '))}</p>
<div class="op-tools">${availablePreview ? btn('Preview knowledge impact', 'preview', `data-requirement="${e(requirement.id)}"`, true) : ''}${btn('View approved sources', 'requirement-sources', `data-requirement="${e(requirement.id)}"`)}${btn('Back to gaps', 'section', 'data-section="gaps"')}</div>
<p class="op-meta">${e(requirement.truthBoundary)}</p>
</article>`;
}

/**
 * The knowledge-impact preview. The label is not decoration: this view must be
 * unmistakably a preview, and it states plainly that nothing was modified.
 */
export function KnowledgeImpactMarkup(preview) {
  if (!preview?.branches) return '<p>No knowledge impact preview is available for this requirement.</p>';
  const {branches, changes} = preview;
  const rows = [];
  if (changes.primaryChanged) rows.push(['Primary option', `${branches.unresolved.primary?.name ?? 'none retained'} → ${branches.confirmed.primary?.name ?? 'none retained'}`]);
  if (branches.unresolved.optionCount !== branches.confirmed.optionCount) rows.push(['Retained options', `${branches.unresolved.optionCount} → ${branches.confirmed.optionCount}`]);
  if (changes.affectedCommunityCount) rows.push(['Communities affected', String(changes.affectedCommunityCount)]);
  if (changes.coverageClassificationChangeCount) rows.push(['Coverage', `${changes.coverageClassificationChangeCount} retained community ${changes.coverageClassificationChangeCount === 1 ? 'classification' : 'classifications'} could change`]);
  for (const change of changes.rankingChanges.slice(0, 3)) rows.push([change.ranking.replace(/([A-Z])/g, ' $1').toLowerCase().trim(), `${change.previous ?? 'none'} → ${change.preview ?? 'none'}`]);

  return `<article class="op-dependency op-preview">
<h3>Knowledge impact preview</h3>
<p class="op-preview-label"><strong>${e(preview.label)}</strong></p>
<p>If ${e(preview.assumption.subjectName)} ${e(previewSentence(preview.assumption))}:</p>
${rows.length ? `<dl class="op-requirement">${rows.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>` : '<p>No retained support relationship would change.</p>'}
${preview.blockedBy ? `<p>${e(preview.blockedBy.text)}</p>` : ''}
<p><strong>No current data has been modified.</strong></p>
${preview.mapIntent ? `<div class="op-tools">${btn('Show affected', 'preview-map', `data-intent="${e(JSON.stringify(preview.mapIntent))}"`)}${btn('Back to gaps', 'section', 'data-section="gaps"')}</div>` : `<div class="op-tools">${btn('Back to gaps', 'section', 'data-section="gaps"')}</div>`}
<p class="op-meta">${e(preview.truthBoundary)}</p>
</article>`;
}

function previewSentence(assumption) {
  if (assumption.kind === 'FACILITY_CAPABILITY_CONFIRMED') return assumption.capability === 'emergencyDepartment' ? 'had a verified emergency department' : 'had verified fire-response capability';
  if (assumption.kind === 'RECEPTION_ACTIVATION_CONFIRMED') return 'had a confirmed current activation';
  if (assumption.kind === 'FACILITY_IDENTITY_RESOLVED') return 'had a resolved canonical identity';
  return 'were inside the connected road-information coverage';
}

/** Approved sources for one requirement. */
export function RequirementSourcesMarkup(tasking) {
  if (!tasking) return '<p>Source status is not retained for this requirement.</p>';
  if (tasking.state === 'NO_REGISTERED_SOURCE' || tasking.state === 'OWNED_BY_ACQUISITION_LANE') {
    return `<article class="op-dependency"><h3>Approved sources</h3><p>${e(tasking.reason)}</p><div class="op-tools">${btn('Back to gaps', 'section', 'data-section="gaps"')}</div></article>`;
  }
  return `<article class="op-dependency"><h3>Approved sources</h3>
${tasking.sources.map((source) => `<div class="op-corridor"><span>${e(source.provider ?? source.sourceId)}</span><span>${e(String(source.authority ?? 'authority not stated').toLowerCase())} · ${e(source.health.state.toLowerCase().replaceAll('_', ' '))}</span><span>${source.deterministicParserAvailable ? 'deterministic parser' : 'no deterministic parser'}${source.manualReviewRequired ? ' · review required' : ''}</span></div>`).join('')}
<p class="op-meta">${e(tasking.limitation ?? '')}</p>
<div class="op-tools">${btn('Back to gaps', 'section', 'data-section="gaps"')}</div>
</article>`;
}

/** "What did VIGIA learn?" — distinct from what changed in the world. */
export function KnowledgeChangesMarkup(delta) {
  if (!delta || (!delta.learnedCount && !delta.lostCount && !delta.gapsClosedCount && !delta.gapsOpenedCount)) {
    return '<p>No change in retained knowledge in this interval.</p>';
  }
  const line = (event) => {
    const consequence = event.consequence ?? {};
    const became = (consequence.becamePrimaryFor ?? [])[0];
    return `<article class="op-dependency"><h3>${e(String(event.kind).toLowerCase().replaceAll('_', ' '))}</h3>
<p>${e(event.subject.name)}${event.subject.fact ? ' · ' + e(String(event.subject.fact)) : ''}</p>
<p class="op-meta">${e(date(event.at))} · VIGIA learned — the world did not change</p>
${became ? `<p>${e(became.subjectName ?? became.subjectId)} · ${e(String(became.category ?? '').replaceAll('_', ' '))}: became the primary retained option</p>` : ''}
${consequence.supportChangeCount ? `<p>${consequence.supportChangeCount} retained support ${consequence.supportChangeCount === 1 ? 'relationship' : 'relationships'} changed as a result</p>` : ''}
</article>`;
  };
  return `<p class="op-meta">${delta.learnedCount} learned · ${delta.lostCount} lost to staleness · ${delta.gapsClosedCount} gaps closed · ${delta.gapsOpenedCount} gaps opened · ${delta.worldChangeCount ?? 0} separate world changes</p>`
    + [...delta.learned, ...delta.lost].slice(0, 8).map(line).join('');
}
