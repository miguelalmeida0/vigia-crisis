import test from 'node:test';
import assert from 'node:assert/strict';
import { preventionDisposition } from '../../web/src/v2/views/prevention-connectivity.js';

test('runtime consensus vocabulary routes non-robust PREVENT geometry to measurement',()=>{
  const zone={support_fraction:.88,position_uncertainty:{p90_meters:311},alternative_zone_count:2};
  assert.equal(preventionDisposition({consensusTopology:{state:'UNSTABLE_INTERVENTION_GEOMETRY',zone}}).kind,'measurement');
  assert.equal(preventionDisposition({consensusTopology:{state:'MIXED_INTERVENTION_ZONE',zone}}).kind,'measurement');
  assert.equal(preventionDisposition({consensusTopology:{state:'NO_DEFENSIBLE_INTERVENTION_ZONE',zone}}).kind,'measurement');
  assert.equal(preventionDisposition({consensusTopology:{state:'ROBUST_INTERVENTION_ZONE',zone}}).kind,'external_validation');
});
