import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evidenceGraph as adaptEvidenceGraph, evidenceQualification, incidentEnvelope } from '../src/canonicalViewModel.js';
import { renderIntelligenceEvidence } from '../src/routes/intelligenceEvidence.js';
import { renderEvidenceDebt } from '../src/routes/evidenceDebt.js';
import { phaseBFixture } from './phase-b-fixture.mjs';

const state=phaseBFixture(),intelligence=incidentEnvelope(state,'intelligence'),graph=adaptEvidenceGraph(intelligence),qualification=evidenceQualification(intelligence),html=renderIntelligenceEvidence(state);
assert.match(html,/Geospatial intelligence/);
assert.match(html,/Intelligence Brief/);
assert.match(html,/Scientific boundary/);
assert.match(html,/Spread forecast unavailable/);
assert.match(html,/More observation time is required/);
assert.match(html,/AUTHORITATIVE_CRISIS_TRUTH_GATE_NOT_PASSED/);
assert.match(html,/Competing hypotheses/);
assert.match(html,/Evidence and intelligence assessment/);
for(const step of ['Now','Next','Watch','Uncertainty','Decision'])assert.match(html,new RegExp(`>${step}<`));
const primaryIntelligence=html.replace(/<details class="technical-details">[\s\S]*?<\/details>/g,'');
assert.doesNotMatch(primaryIntelligence,/AUTHORITATIVE_CRISIS_TRUTH_GATE_NOT_PASSED|TIME_ACCUMULATION_REQUIRED|OPERATIONAL_TWIN_EVIDENCE_GRAPH/,'machine states must stay inside progressive technical disclosure');
assert.equal(graph.sourceFamilies[0].id,'family:official','source families survive adapter conversion');
assert.equal(graph.sources[0].id,'source:official','source nodes survive adapter conversion');
assert.equal(graph.observations[0].id,'observation:phase-b','observation nodes survive adapter conversion');
assert.equal(graph.evidence[0].id,'evidence:phase-b','evidence nodes survive adapter conversion');
assert.deepEqual(graph.lineages[0].rootObservationIds,['observation:phase-b'],'causal lineage edges survive adapter conversion');
assert.equal(qualification.contradictions[0].evidenceId,'evidence:phase-b','evidence qualification and contradictions survive adapter conversion');

const evidence=renderEvidenceDebt(state);
for(const bucket of ['New','Under review','Confirmed','Contradictory'])assert.match(evidence,new RegExp(bucket));
for(const marker of ['observation:phase-b','evidence:phase-b','Backend contradiction','Official perimeter','Canonical registry source'])assert.match(evidence,new RegExp(marker),`Evidence UI omitted ${marker}`);
assert.equal((evidence.match(/data-action="select-evidence:evidence:phase-b"/g)??[]).length,1,'one canonical evidence statement must not inflate into duplicate witnesses');

const unavailable=phaseBFixture();
unavailable.runtime.canonical.incidents['incident:phase-b'].intelligence.value.data.evidenceGraph.value.sources[0].status=null;
assert.match(renderEvidenceDebt(unavailable),/Unavailable/,'unavailable source health remains unavailable');

for(const file of ['../src/routes/intelligenceEvidence.js','../src/routes/evidenceDebt.js','../src/routes/operations.js']){
  const source=await readFile(new URL(file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/confidence percentage|risk percentage|trust score|familyCount|independent corroboration/i);
}
const evidenceSource=await readFile(new URL('../src/routes/evidenceDebt.js',import.meta.url),'utf8');
assert.doesNotMatch(evidenceSource,/new Set|independentFamilies\s*=|deduplicat/i,'frontend must not derive independence or deduplicate witnesses');
console.log('Intelligence and Evidence contracts passed: canonical scientific state, graph nodes/edges, qualification, lineage, contradictions, source families, unavailable truth, and no witness inflation.');
