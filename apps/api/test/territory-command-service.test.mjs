import test from 'node:test';
import assert from 'node:assert/strict';
import { TerritoryCommandService } from '../src/modules/territory/territory-command-service.mjs';

test('territory command keeps populations distinct and puts physical candidates first', async () => {
  let preventionOptions=null;
  const service = new TerritoryCommandService({
    preventionService: { snapshot: async (options) => {preventionOptions=options;return{ findings: [{ findingId:'finding-1',place:'Loulé',coordinate:[-8,37],calibrationState:'SCREENING_CANDIDATE',firstObservableInterval:{end:'2026-08-08T11:31:15Z'},nearestStructureM:16,structuresWithinPolicyRadius:2,affectedAreaHa:1.1,validation:{state:'UNMEASURED'},sourceQuality:{state:'PIXEL_VERIFIED'},evidenceNeedId:'need:private',evidenceRequestId:'request:private',currentObservationId:'observation:private'} ] };} },
    operationalEventService: { snapshot: async () => ({ meta:{region:'Portugal mainland'},sources:{firms:{state:'current'},fires:{state:'current'}},events:[
      {id:'physical-1',label:'Physical candidate',coordinate:[-7,39],evidenceState:'satellite-only',physicalState:{freshness:'current'},reportState:{sourceActivity:'none'},lastSeenAt:'2026-08-11T10:00:00Z'},
      {id:'delayed-1',label:'Delayed physical',coordinate:[-7.5,38],evidenceState:'satellite-only',physicalState:{freshness:'delayed'},reportState:{sourceActivity:'none'},lastSeenAt:'2026-08-11T09:00:00Z'},
      {id:'two-family-history',label:'Historical two-family physical',coordinate:[-7.8,38],evidenceState:'satellite-only',physicalState:{freshness:'stale'},physicalSourceProfile:{twoPhysicalSourceFamilies:true},reportState:{sourceActivity:'none'},lastSeenAt:'2026-08-10T09:00:00Z'},
      {id:'report-1',label:'Report only',coordinate:[-8,40],evidenceState:'report-only',physicalState:{freshness:'unobserved'},reportState:{sourceActivity:'current'},lastSeenAt:'2026-08-11T11:00:00Z'}
    ] }) },
    clock: () => new Date('2026-08-11T12:00:00Z')
  });
  const result = await service.snapshot();
  assert.deepEqual(result.signals.map((item) => item.type), ['THERMAL_FIRE_CANDIDATE','DELAYED_PHYSICAL','PRE_IGNITION_FINDING','REPORT_ONLY_INCIDENT','MULTISOURCE_HISTORICAL']);
  assert.equal(result.summary.preIgnitionFindings, 1);
  assert.equal(result.summary.thermalFireCandidates, 1);
  assert.equal(result.summary.reportOnlyIncidents, 1);
  assert.equal(result.summary.delayedPhysicalEvents, 1);
  assert.equal(result.summary.multisourceHistoricalEvents, 1);
  assert.equal(preventionOptions.publicProjection,true);
  const serialized=JSON.stringify(result);assert.doesNotMatch(serialized,/need:private|request:private|observation:private/);assert.equal(result.signals.find((item)=>item.type==='PRE_IGNITION_FINDING').coordinate,null);
});
