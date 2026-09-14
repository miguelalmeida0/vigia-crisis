import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GovernedResponseFacilityRepository, osmElementToResponseFacility } from '../src/modules/response-capability/governed-facility-repository.mjs';

test('facility addresses preserve supplied address tags without inventing missing identity', () => {
  const facility = tags => osmElementToResponseFacility({type:'node',id:1,lon:-8,lat:39,tags:{amenity:'shelter',...tags}}, {provider:'OpenStreetMap'});
  assert.equal(facility({'addr:full':'Rua da Escola 12, Évora'}).address, 'Rua da Escola 12, Évora');
  assert.equal(facility({'addr:street':'Rua da Escola','addr:housenumber':'12','addr:postcode':'7000','addr:city':'Évora'}).address, 'Rua da Escola 12, 7000 Évora');
  assert.equal(facility({}).address, null);
  assert.equal(facility({}).name, 'Mapped shelter');
  assert.equal(facility({'addr:city':'Évora'}).locality, 'Évora');
  assert.equal(facility({'addr:city':'Évora'}).addressPrecision, 'LOCALITY');
  assert.equal(facility({'addr:street':'Rua da Escola'}).addressPrecision, 'ADDRESS');
  assert.equal(facility({}).locality, null);
});

test('governed OSM response acquisition shapes classify all eight facility classes without implying live capacity', () => {
  const provenance = {
    provider: 'OpenStreetMap contributors via Overpass API', retrievedAt: '2026-09-04T12:00:00.000Z',
    archiveSha256: `sha256:${'a'.repeat(64)}`, query: '[out:json];(nwr[amenity=hospital];);out center;', purpose: 'RESPONSE_FACILITIES'
  };
  const cases = [
    ['HOSPITAL', { amenity: 'hospital', name: 'Mapped hospital' }],
    ['FIRE_STATION', { amenity: 'fire_station', name: 'Mapped fire station' }],
    ['EMS_BASE', { emergency: 'ambulance_station', name: 'Mapped EMS base' }],
    ['CIVIL_PROTECTION', { office: 'government', government: 'civil_protection', name: 'Protecao Civil' }],
    ['POLICE', { amenity: 'police', name: 'Mapped police facility' }],
    ['SHELTER', { amenity: 'social_facility', social_facility: 'shelter', name: 'Mapped shelter' }],
    ['WATER_POINT', { emergency: 'fire_hydrant', name: 'Mapped hydrant' }],
    ['AIR_SUPPORT_BASE', { aeroway: 'heliport', operator: 'Civil protection rescue', name: 'Mapped air support base' }]
  ];
  const projected = cases.map(([expectedKind, tags], index) => {
    const facility = osmElementToResponseFacility({ type: 'node', id: index + 1, lon: -8.5 + index / 100, lat: 41.1, tags }, provenance);
    assert.equal(facility.kind, expectedKind);
    assert.equal(facility.freshness.retrievedAt, provenance.retrievedAt);
    assert.equal(facility.freshness.state, 'STATIC_SNAPSHOT');
    assert.equal(facility.provenance.sourceRecordId, `node/${index + 1}`);
    assert.equal(facility.dynamicCapacity, undefined);
    assert.match(facility.staticCapability.limitation, /unknown|require/i);
    return facility;
  });
  assert.deepEqual(projected.map((facility) => facility.kind), cases.map(([kind]) => kind));
});

test('governed repository verifies and exposes the retained OSM hospital/fire source with provenance', async () => {
  const repository = new GovernedResponseFacilityRepository({ projectRoot: process.cwd() });
  const status = await repository.initialize();
  assert.equal(status.state, 'READY');
  assert.deepEqual(status.counts, { HOSPITAL: 381, FIRE_STATION: 614, EMS_BASE: 43, CIVIL_PROTECTION: 10, POLICE: 1286, PUBLIC_INSTITUTION: 0, SHELTER: 2877, WATER_POINT: 10816, AIR_SUPPORT_BASE: 6 });
  const result = repository.nearest([-8.472136, 41.060385], { limitPerKind: 3 });
  assert.equal(result.covered, true);
  for (const kind of ['HOSPITAL', 'FIRE_STATION', 'EMS_BASE', 'CIVIL_PROTECTION', 'POLICE', 'SHELTER', 'WATER_POINT', 'AIR_SUPPORT_BASE']) {
    assert.ok(result.byKind[kind].length > 0, kind);
    assert.equal(result.sourceCoverage[kind].state, 'GOVERNED_ARCHIVE_AVAILABLE');
  }
  assert.match(result.byKind.HOSPITAL[0].provenance.archiveSha256, /^sha256:/);
  assert.equal(result.byKind.HOSPITAL[0].provenance.licence.startsWith('ODbL'), true);
  assert.equal(Object.values(result.byKind).flat().some((facility) => facility.dynamicCapacity !== undefined), false);
});

test('all governed operational-proof coordinates resolve hospital and fire-station context with static provenance', async () => {
  const repository = new GovernedResponseFacilityRepository({ projectRoot: process.cwd() });
  await repository.initialize();
  const context = JSON.parse(await readFile('data/reference/operational-proof/governed-incident-context.json', 'utf8'));
  assert.equal(context.incidents.length, context.coverage.validCoordinates);
  assert.ok(context.incidents.length > 0);
  for (const incident of context.incidents) {
    const result = repository.nearest(incident.coordinate, { limitPerKind: 1 });
    for (const kind of ['HOSPITAL', 'FIRE_STATION']) {
      assert.equal(result.byKind[kind].length, 1, `${incident.incidentId} ${kind}`);
      assert.equal(result.byKind[kind][0].provenance.provider, 'OpenStreetMap contributors via Overpass API');
      assert.match(result.byKind[kind][0].provenance.archiveSha256, /^sha256:/);
    }
  }
});

test('facility archive checksum mismatch fails closed and coordinates outside governed coverage do not get invented facilities', async (context) => {
  const base = path.resolve('.tmp/test'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'response-facility-integrity-')); context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'data/archive.json'), JSON.stringify({ elements: [] }));
  await writeFile(path.join(root, 'data/context.json'), JSON.stringify({ sources: { openStreetMap: { archives: [{ path: 'data/archive.json', sha256: `sha256:${'0'.repeat(64)}` }] } } }));
  await assert.rejects(() => new GovernedResponseFacilityRepository({ projectRoot: root, archivePath: 'data/archive.json', contextPath: 'data/context.json' }).initialize(), /checksum_mismatch/);
  const repository = new GovernedResponseFacilityRepository({ projectRoot: process.cwd() }); await repository.initialize();
  const outside = repository.nearest([-20, 50]);
  assert.equal(outside.covered, false);
  assert.ok(Object.values(outside.byKind).every((items) => items.length === 0));
  assert.ok(Object.values(outside.sourceCoverage).every((item) => item.state === 'OUTSIDE_GOVERNED_COVERAGE'));
});

test('governed response acquisition retains archive lineage and repository selects the newest registered snapshot', async (context) => {
  const base = path.resolve('.tmp/test'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'response-facility-lineage-')); context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'data'), { recursive: true });
  const oldArchive = JSON.stringify({ elements: [{ type: 'node', id: 1, lon: -8.5, lat: 41.2, tags: { amenity: 'hospital', name: 'Older snapshot hospital' } }] });
  const newArchive = JSON.stringify({ elements: [{ type: 'node', id: 2, lon: -8.49, lat: 41.2, tags: { amenity: 'hospital', name: 'Newest snapshot hospital' } }] });
  await writeFile(path.join(root, 'data/old.json'), oldArchive);
  await writeFile(path.join(root, 'data/new.json'), newArchive);
  const checksum = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
  await writeFile(path.join(root, 'data/context.json'), JSON.stringify({ sources: { openStreetMap: {
    provider: 'OpenStreetMap contributors via Overpass API', license: 'ODbL 1.0', archives: [
      { path: 'data/old.json', sha256: checksum(oldArchive), purpose: 'RESPONSE_FACILITIES', retrievedAt: '2026-09-03T12:00:00Z' },
      { path: 'data/new.json', sha256: checksum(newArchive), purpose: 'RESPONSE_FACILITIES', retrievedAt: '2026-09-04T12:00:00Z' }
    ]
  } } }));
  const repository = new GovernedResponseFacilityRepository({ projectRoot: root, contextPath: 'data/context.json' });
  const status = await repository.initialize();
  assert.equal(status.source.archivePath, 'data/new.json');
  assert.equal(repository.nearest([-8.5, 41.2], { limitPerKind: 1 }).byKind.HOSPITAL[0].name, 'Newest snapshot hospital');
});

test('candidate retrieval preserves its full denominator and retains a farther current-report facility beyond the distance prefilter', async (context) => {
  const base = path.resolve('.tmp/test'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'response-facility-cohort-')); context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'data'), { recursive: true });
  const archive = JSON.stringify({ elements: [
    { type: 'node', id: 1, lon: -8.49, lat: 41.2, tags: { amenity: 'fire_station', name: 'Nearest unknown station' } },
    { type: 'node', id: 2, lon: -8.40, lat: 41.2, tags: { amenity: 'fire_station', name: 'Second unknown station' } },
    { type: 'node', id: 3, lon: -7.80, lat: 41.2, tags: { amenity: 'fire_station', name: 'Farther currently reported station' } }
  ] });
  await writeFile(path.join(root, 'data/archive.json'), archive);
  const checksum = `sha256:${createHash('sha256').update(archive).digest('hex')}`;
  await writeFile(path.join(root, 'data/context.json'), JSON.stringify({ sources: { openStreetMap: {
    provider: 'Governed OSM test archive', license: 'ODbL 1.0', archives: [{
      path: 'data/archive.json', sha256: checksum, purpose: 'RESPONSE_FACILITIES', retrievedAt: '2026-09-04T12:00:00Z'
    }]
  } } }));
  const repository = new GovernedResponseFacilityRepository({ projectRoot: root, contextPath: 'data/context.json' });
  await repository.initialize();
  const result = repository.nearest([-8.5, 41.2], {
    limitPerKind: { FIRE_STATION: 1 }, maximumDistanceKm: 150, mustIncludeIds: ['osm:node:3']
  });
  assert.deepEqual(result.byKind.FIRE_STATION.map((item) => item.id), ['osm:node:1', 'osm:node:3']);
  assert.equal(result.byKind.FIRE_STATION[0].retrieval.straightLineRank, 1);
  assert.equal(result.byKind.FIRE_STATION[1].retrieval.straightLineRank, 3);
  assert.match(result.byKind.FIRE_STATION[1].retrieval.selectedBecause, /CURRENT_ATTRIBUTABLE_REPORT/);
  assert.deepEqual(result.retrieval.byKind.FIRE_STATION, {
    governedSourceRecordCount: 3,
    withinDistanceCount: 3,
    distancePrefilterLimit: 1,
    retainedCurrentReportCount: 1,
    returnedCandidateCount: 2,
    truncatedCount: 1,
    cohortPolicy: 'DISTANCE_PREFILTER_PLUS_CURRENT_ATTRIBUTABLE_REPORTS',
    omissionReason: 'Lower straight-line-ranked records without a current attributable report are outside this facility-class road-routing cohort.'
  });
});
