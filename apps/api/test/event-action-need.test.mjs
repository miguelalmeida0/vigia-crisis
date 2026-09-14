import assert from 'node:assert/strict';
import test from 'node:test';
import { actionNeed } from '../src/modules/events/fire-event-service.mjs';

test('stale event evidence is preserved without creating current Action work',()=>{
  const need=actionNeed({evolutionState:'stale',evidenceState:'multisource',physicalState:{freshness:'stale'},evidenceFusion:{ambiguities:[{kind:'conflicting_physical_observations'}]}});
  assert.equal(need.kind,'none');assert.equal(need.needsRouting,false);assert.match(need.reason,/Preserve the historical unknown/);
});

test('current physical conflicts still route supervisor review',()=>{
  const need=actionNeed({evolutionState:'active',evidenceState:'multisource',physicalState:{freshness:'current'},evidenceFusion:{ambiguities:[{kind:'conflicting_physical_observations'}]}});
  assert.equal(need.kind,'resolve_evidence_conflict');assert.equal(need.needsRouting,true);
});
