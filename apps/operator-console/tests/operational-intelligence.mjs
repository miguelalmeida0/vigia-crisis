import test from 'node:test';
import assert from 'node:assert/strict';
import { applyIncidentSelection } from '../src/incidentSelection.js';
import { routeParamsFromState,applyRouteParams } from '../src/routeState.js';
import { intelligenceSummary } from '../src/approved/ui/intelligence-summary.js';

test('incident workspace isolates and restores evidence, question and task without changing map context',()=>{
  const state={selectedIncidentId:'a',selectedEvidenceId:'e:a',approvedQuestionId:'q:a',selectedOperationId:'t:a',mapSceneCameras:{scene:{center:[-8,40]}}};
  applyIncidentSelection(state,'b');assert.equal(state.selectedEvidenceId,null);assert.equal(state.approvedQuestionId,null);assert.equal(state.selectedOperationId,null);
  state.selectedEvidenceId='e:b';applyIncidentSelection(state,'a');
  assert.equal(state.selectedEvidenceId,'e:a');assert.equal(state.approvedQuestionId,'q:a');assert.equal(state.selectedOperationId,'t:a');assert.deepEqual(state.mapSceneCameras.scene.center,[-8,40]);
});
test('route reentry retains filters and does not copy Reports state to another route',()=>{
  const state={incidentSearch:'Porto',incidentStateFilter:'DETECTION_CANDIDATE',reportsTab:'quality'};
  const params=routeParamsFromState('incidents',state);applyRouteParams(state,'incidents',params);
  assert.equal(state.incidentSearch,'Porto');assert.equal(params.has('view'),false);
});
test('intelligence component renders domain statements and escapes evidence text without demo fallback',()=>{
  assert.equal(intelligenceSummary({source:null}), '');
  const vm={selected:'a',runtime:{runtime:{session:{actor:{id:'operator'}}}},source:{data:{operationalIntelligence:{state:'READY',value:{generatedAt:'2026-09-07T12:00:00Z',changes:[],incidents:[{incidentId:'a',assessment:{summary:'Heat detected. <script>no</script>',boundary:'Not an order'},explanation:{reasons:['Official confirmation absent'],evidenceIds:['e:1'],ruleIds:['rule:1']},recommendations:[]}]}}}}};
  const html=intelligenceSummary(vm);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Why this assessment/);
});
