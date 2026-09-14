import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFireEvidenceState } from '../src/fire-evidence-state.mjs';

test('fire evidence state exposes conflict, coverage gaps and next observation without probability',()=>{
  const result=buildFireEvidenceState({event:{physicalState:{freshness:'current',lastAt:'2026-08-12T08:00:00Z'},ambiguousAssociations:[{observationId:'thermal-2',reasonCodes:['close_competitor']}],observations:[{id:'report-1',type:'report',at:'2026-08-12T07:50:00Z',source:'ICNF'}]},fusion:{reportObservationCount:1,witnesses:[{dependencyGroup:'viirs_noaa20',source:'NASA FIRMS',type:'thermal',latestAt:'2026-08-12T08:00:00Z',observationCount:1,polarity:'support'},{dependencyGroup:'field_1',source:'Field',type:'field',latestAt:'2026-08-12T08:02:00Z',observationCount:1,polarity:'negative'}],ambiguities:[{kind:'conflicting_physical_observations',supportGroups:['viirs_noaa20'],negativeGroups:['field_1']}]},coverage:{viirs:{coverageState:'observed_with_detection'},sentinel3:{coverageState:'unknown',state:'not_configured'}},observationPlan:{remote:[{id:'sentinel3',label:'Sentinel-3',availability:'CREDENTIAL_REQUIRED',latency:{state:'PASS_DEPENDENT'}}]}});
  assert.equal(result.state,'EVIDENCE_CONFLICT');
  assert.equal(result.reportEvidence.present,true);
  assert.equal(result.associationAmbiguity.count,1);
  assert.equal(result.nextObservation.state,'PASS_DEPENDENT_OR_BLOCKED');
  assert.equal(result.existenceProbability,null);
});

test('fire evidence state separates physical source families from dependency groups',()=>{
  const result=buildFireEvidenceState({event:{physicalState:{freshness:'current'}},fusion:{witnesses:[
    {dependencyGroup:'viirs_noaa20',sourceFamily:'viirs',source:'NASA FIRMS',type:'thermal',observationCount:3,polarity:'support'},
    {dependencyGroup:'viirs_noaa21',sourceFamily:'viirs',source:'NASA FIRMS',type:'thermal',observationCount:2,polarity:'support'},
    {dependencyGroup:'sentinel_3a_slstr',sourceFamily:'sentinel3_slstr',source:'Copernicus',type:'thermal',observationCount:1,polarity:'support'}
  ]}});
  assert.deepEqual(result.physicalSourceFamilies,['viirs','sentinel3_slstr']);assert.equal(result.physicalSourceFamilyCount,2);assert.equal(result.twoPhysicalSourceFamilies,true);assert.equal(result.independenceGroups.length,3);
});
