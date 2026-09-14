import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseOpportunityGranule,
  assertTrustedEarthdataUrl,
  pointInPolygon,
  polygonEdgeDistanceKm,
  selectReportStratifiedCohort
} from '../src/modules/world/viirs/viirs-granule-opportunity.mjs';

const polygon=[[-10,36],[-5,36],[-5,43],[-10,43]];

test('Earthdata bearer-token downloads are confined to the exact LAADS origin',()=>{
  assert.equal(assertTrustedEarthdataUrl('https://data.laadsdaac.earthdatacloud.nasa.gov/prod-lads/file.nc').origin,'https://data.laadsdaac.earthdatacloud.nasa.gov');
  assert.throws(()=>assertTrustedEarthdataUrl('https://data.laadsdaac.earthdatacloud.nasa.gov.attacker.test/file.nc'),/earthdata_asset_url_rejected/);
  assert.throws(()=>assertTrustedEarthdataUrl('https://data.laadsdaac.earthdatacloud.nasa.gov:444/file.nc'),/earthdata_asset_url_rejected/);
  assert.throws(()=>assertTrustedEarthdataUrl('https://token@data.laadsdaac.earthdatacloud.nasa.gov/file.nc'),/earthdata_asset_url_rejected/);
});

test('VIIRS opportunity selection requires time compatibility and point-in-swath geometry',()=>{
  const reference={alertAt:'2024-09-17T10:00:00Z',timeWindow:{start:'2024-09-16T22:00:00Z',end:'2024-09-18T10:00:00Z'},coordinate:[-8,40]};
  const outside={conceptId:'outside',midpointAt:'2024-09-17T11:00:00Z',polygon:[[10,36],[15,36],[15,43],[10,43]]};
  const before={conceptId:'before',midpointAt:'2024-09-17T09:00:00Z',polygon};
  const usable={conceptId:'usable',midpointAt:'2024-09-17T12:00:00Z',polygon};
  assert.equal(pointInPolygon(reference.coordinate,polygon),true);
  assert.equal(pointInPolygon(reference.coordinate,outside.polygon),false);
  assert.ok(polygonEdgeDistanceKm(reference.coordinate,polygon)>100);
  const result=chooseOpportunityGranule(reference,[outside,before,usable]);
  assert.equal(result.state,'ASSIGNED');
  assert.equal(result.temporalGranules,2);
  assert.equal(result.insideSwathGranules,1);
  assert.equal(result.selected.conceptId,'usable');
  assert.equal(result.timeSeparationHours,2);
});

test('VIIRS opportunity selection favors the pass with the strongest interior swath margin',()=>{
  const reference={alertAt:'2024-09-17T10:00:00Z',timeWindow:{start:'2024-09-17T10:00:00Z',end:'2024-09-18T10:00:00Z'},coordinate:[-8,40]};
  const edge={conceptId:'edge',midpointAt:'2024-09-17T11:00:00Z',polygon:[[-8.01,36],[-5,36],[-5,43],[-8.01,43]]};
  const interior={conceptId:'interior',midpointAt:'2024-09-17T12:00:00Z',polygon};
  const result=chooseOpportunityGranule(reference,[edge,interior]);
  assert.equal(result.selected.conceptId,'interior');
  assert.ok(result.selected.catalogueEdgeMarginKm>100);
});

test('small-fire cohort selection is report-only, monthly, and deterministic',()=>{
  const cases=[
    {caseId:'a1',referenceLabel:'FIRE_POSITIVE',burnedAreaHa:.5,alertAt:'2024-04-02T10:00:00Z'},
    {caseId:'a2',referenceLabel:'FIRE_POSITIVE',burnedAreaHa:2,alertAt:'2024-04-02T11:00:00Z'},
    {caseId:'a3',referenceLabel:'FIRE_POSITIVE',burnedAreaHa:4,alertAt:'2024-04-03T11:00:00Z'},
    {caseId:'m1',referenceLabel:'FIRE_POSITIVE',burnedAreaHa:7,alertAt:'2024-05-04T11:00:00Z'},
    {caseId:'excluded-large',referenceLabel:'FIRE_POSITIVE',burnedAreaHa:10,alertAt:'2024-05-04T12:00:00Z'},
    {caseId:'excluded-negative',referenceLabel:'FIRE_NEGATIVE',burnedAreaHa:.2,alertAt:'2024-05-04T13:00:00Z'}
  ];
  const cohort=selectReportStratifiedCohort(cases);
  assert.deepEqual(cohort.selectedDates,['2024-04-02','2024-04-03','2024-05-04']);
  assert.deepEqual(cohort.cases.map((item)=>item.caseId),['a1','a2','a3','m1']);
  assert.match(cohort.policy,/blind|reports only/i);
});
