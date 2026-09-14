import assert from 'node:assert/strict';
import test from 'node:test';

import { compactResponseCapabilityProjection } from '../src/modules/operator/canonical-operator-response-projection.mjs';

test('operator response DTO removes duplicated query/route geometry while preserving truth and exact populations', () => {
  const coordinates = Array.from({ length: 200 }, (_, index) => [-8 + index / 1000, 40 + index / 1000]);
  const route = { state: 'ROUTED', geometry: { type: 'LineString', coordinates }, travelTimeMinutes: 12, routeDistanceKm: 9 };
  const facility = {
    id: 'facility:1', kind: 'HOSPITAL', retrievalRank: 1,
    reachability: { state: 'ROUTED', travelTimeMinutes: 12, method: 'OSRM', source: { provider: 'OSRM' }, currentRoute: route },
    provenance: { provider: 'OpenStreetMap', sourceRecordId: 'node/1', archiveSha256: `sha256:${'a'.repeat(64)}`, query: 'large governed query' },
  };
  const feature = { type: 'Feature', id: 'route:1', geometry: route.geometry, properties: { facilityId: facility.id, facilityKind: facility.kind, dispatchClaimed: false } };
  const projection = {
    schemaVersion: 'vigia.response-capability.v1', facilities: { HOSPITAL: [facility] },
    resourceCoverageMap: { routeFeatures: { type: 'FeatureCollection', features: [feature] }, facilityFeatures: { type: 'FeatureCollection', features: [] } },
  };
  const compact = compactResponseCapabilityProjection(projection);
  assert.equal(compact.facilities.HOSPITAL.length, 1);
  assert.equal(compact.facilities.HOSPITAL[0].provenance.query, undefined);
  assert.equal(compact.facilities.HOSPITAL[0].provenance.sourceRecordId, 'node/1');
  assert.equal(compact.facilities.HOSPITAL[0].reachability.currentRoute.geometry, undefined);
  assert.equal(compact.resourceCoverageMap.routeFeatures.features[0].geometry.coordinates.length, 32);
  assert.deepEqual(compact.resourceCoverageMap.routeFeatures.features[0].geometry.coordinates[0], coordinates[0]);
  assert.deepEqual(compact.resourceCoverageMap.routeFeatures.features[0].geometry.coordinates.at(-1), coordinates.at(-1));
  assert.equal(compact.resourceCoverageMap.routeFeatures.features[0].properties.dispatchClaimed, false);
  assert.equal(compact.resourceCoverageMap.wireProjection.fullProjectionRetainedServerSide, true);
});
