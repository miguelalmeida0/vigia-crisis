import test from 'node:test';
import assert from 'node:assert/strict';
import { OsrmRoutingAdapter } from '../src/modules/response-capability/osrm-routing-adapter.mjs';
import { ResponseCapabilityService } from '../src/modules/response-capability/response-capability-service.mjs';
import { routingCoverage } from '../src/modules/response-capability/routing-cohort.mjs';

const at = '2026-09-05T08:00:00.000Z';
const facility = (id, kind = 'FIRE_STATION', index = 0) => ({
  id, kind, name: id, coordinate: [-8.5 + index / 10_000, 41.2], distanceKm: index + 1,
  staticCapability: kind === 'FIRE_STATION'
    ? { wildfireCapability: { state: 'KNOWN', value: true } }
    : { emergencyDepartment: { state: 'KNOWN', value: true } },
  provenance: { provider: 'governed-test', sourceRecordId: id },
  retrieval: { straightLineRank: index + 1 }
});

const json = (value) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'content-type': 'application/json' }
});

test('OSRM table exhaustively routes a batched governed denominator and records explicit unreachable truth', async () => {
  const requests = [];
  const adapter = new OsrmRoutingAdapter({
    endpoint: 'https://routing.test', clock: () => new Date(at),
    fetchImpl: async (url) => {
      requests.push(url);
      const destinationCount = new URL(url).searchParams.get('destinations').split(';').length;
      const durations = Array.from({ length: destinationCount }, (_, index) => requests.length === 2 && index === 2 ? null : 60 * (index + 1));
      return json({ code: 'Ok', durations: [durations], distances: [durations.map((value) => value == null ? null : value * 10)] });
    }
  });
  const input = Array.from({ length: 55 }, (_, index) => facility(`fire:${index}`, 'FIRE_STATION', index));
  const result = await adapter.routeMany([-8.5, 41.2], input);
  assert.equal(requests.length, 2);
  assert.equal(result.length, 55);
  assert.equal(result.filter((item) => item.reachability.state === 'ROUTED').length, 54);
  const unreachable = result.find((item) => item.reachability.state === 'UNREACHABLE');
  assert.match(unreachable.reachability.reason, /explicitly returned no drivable route/);
  assert.equal(unreachable.reachability.source.provider, 'OSRM public routing service');
  assert.equal(unreachable.reachability.checkedAt, at);
});

test('an incomplete matrix degrades the whole denominator and invalid unreachable metadata fails closed', async () => {
  const adapter = new OsrmRoutingAdapter({
    endpoint: 'https://routing.test', clock: () => new Date(at),
    fetchImpl: async () => json({ code: 'Ok', durations: [[60]], distances: [[600]] })
  });
  const input = [facility('fire:1'), facility('fire:2', 'FIRE_STATION', 1)];
  const result = await adapter.routeMany([-8.5, 41.2], input);
  assert.ok(result.every((item) => item.reachability.state === 'DISTANCE_ONLY_FALLBACK'));
  const invalid = { ...input[0], reachability: { state: 'UNREACHABLE', reason: '', source: null, checkedAt: null } };
  const coverage = routingCoverage({ FIRE_STATION: [invalid] }, adapter, at);
  assert.equal(coverage.state, 'DEGRADED');
  assert.deepEqual(coverage.unreachableValidation.invalid[0].missing, ['reason', 'source', 'checkedAt']);
});

test('OSRM matrix retries a transient batch without discarding successful denominator batches', async () => {
  const attempts = new Map();
  const adapter = new OsrmRoutingAdapter({
    endpoint: 'https://routing.test', clock: () => new Date(at), concurrency: 1,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      const key = parsed.pathname;
      const attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      const destinationCount = parsed.searchParams.get('destinations').split(';').length;
      if (destinationCount === 6 && attempt === 1) throw new Error('transient_batch_outage');
      const durations = Array.from({ length: destinationCount }, (_, index) => 60 * (index + 1));
      return json({ code: 'Ok', durations: [durations], distances: [durations.map((value) => value * 10)] });
    }
  });
  const input = Array.from({ length: 55 }, (_, index) => facility(`fire:${index}`, 'FIRE_STATION', index));
  const result = await adapter.routeMany([-8.5, 41.2], input);
  assert.equal(result.length, 55);
  assert.ok(result.every((item) => item.reachability.state === 'ROUTED'));
  assert.equal([...attempts.values()].reduce((total, value) => total + value, 0), 3);
});

test('OSRM matrix preserves successful batches while a permanently failed batch remains fail-closed', async () => {
  const adapter = new OsrmRoutingAdapter({
    endpoint: 'https://routing.test', clock: () => new Date(at), concurrency: 1,
    fetchImpl: async (url) => {
      const destinationCount = new URL(url).searchParams.get('destinations').split(';').length;
      if (destinationCount === 6) throw new Error('persistent_batch_outage');
      const durations = Array.from({ length: destinationCount }, (_, index) => 60 * (index + 1));
      return json({ code: 'Ok', durations: [durations], distances: [durations.map((value) => value * 10)] });
    }
  });
  const input = Array.from({ length: 55 }, (_, index) => facility(`fire:${index}`, 'FIRE_STATION', index));
  const result = await adapter.routeMany([-8.5, 41.2], input);
  assert.equal(result.filter((item) => item.reachability.state === 'ROUTED').length, 49);
  assert.equal(result.filter((item) => item.reachability.state === 'DISTANCE_ONLY_FALLBACK').length, 6);
  assert.match(result.at(-1).reachability.reason, /persistent_batch_outage/);
});

test('governed constraints degrade the pre-rank denominator without public per-candidate geometry calls', async () => {
  let requests = 0;
  const adapter = new OsrmRoutingAdapter({
    endpoint: 'https://routing.test', clock: () => new Date(at),
    fetchImpl: async () => { requests += 1; throw new Error('must_not_call'); }
  });
  const input = Array.from({ length: 120 }, (_, index) => facility(`fire:${index}`, 'FIRE_STATION', index));
  const result = await adapter.routeMany([-8.5, 41.2], input, {
    roadContext: { closures: [{ id: 'closure:one', state: 'CLOSED', geometry: { type: 'LineString', coordinates: [[-8.5, 41.2], [-8.4, 41.1]] } }] }
  });
  assert.equal(requests, 0);
  assert.ok(result.every((item) => item.reachability.state === 'WITHHELD_UNSUPPORTED_GOVERNED_CONSTRAINT'));
  assert.equal(routingCoverage({ FIRE_STATION: result }, adapter, at).state, 'DEGRADED');
});

test('service routes every governed hospital/fire candidate before decision-rank trimming', async () => {
  const all = Array.from({ length: 30 }, (_, index) => facility(`fire:${index}`, 'FIRE_STATION', index));
  let routeInputCount = 0;
  const repository = { nearest: (_origin, options) => {
    assert.equal(options.limitPerKind.FIRE_STATION, Number.MAX_SAFE_INTEGER);
    return {
      byKind: { FIRE_STATION: all }, sourceCoverage: { FIRE_STATION: { sourceRecordCount: 30 } },
      retrieval: { covered: true, maximumDistanceKm: 150, byKind: { FIRE_STATION: {
        withinDistanceCount: 30, returnedCandidateCount: 30, truncatedCount: 0,
        cohortPolicy: 'EXHAUSTIVE_WITHIN_GOVERNED_MAX_DISTANCE'
      } } }
    };
  } };
  const routingAdapter = {
    endpoint: 'governed:test-router',
    async routeMany(_origin, items) {
      routeInputCount = items.length;
      return items.map((item, index) => ({ ...item, reachability: {
        state: 'ROUTED', travelTimeMinutes: index === 29 ? 1 : index + 10,
        routeDistanceKm: index + 1, checkedAt: at, source: { provider: 'test-router' }
      } }));
    },
    async routeDetails(_origin, items) { return items; }
  };
  const service = new ResponseCapabilityService({
    facilityRepository: repository, routingAdapter, clock: () => new Date(at)
  });
  const result = await service.projectIncident({ id: 'incident:road-denominator', coordinate: [-8.5, 41.2] });
  assert.equal(routeInputCount, 30);
  assert.equal(result.retrievalCoverage.byKind.FIRE_STATION.retrievedCount, 30);
  assert.equal(result.retrievalCoverage.byKind.FIRE_STATION.rankedCount, 30);
  assert.equal(result.retrievalCoverage.byKind.FIRE_STATION.returnedCount, 6);
  assert.equal(result.facilities.FIRE_STATION[0].id, 'fire:29');
  assert.equal(result.facilities.FIRE_STATION[0].candidateCohort.denominatorRankedCount, 30);
});
