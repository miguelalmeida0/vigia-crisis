import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PUBLIC_EVIDENCE_SOURCES } from '../src/modules/worldclass/public-evidence-war-room.mjs';
import { buildHistoricalShadowDecisions } from '../src/modules/worldclass/historical-shadow-evidence.mjs';

test('public evidence registry admits only identified authoritative public sources with rights fingerprints', () => {
  assert.deepEqual(PUBLIC_EVIDENCE_SOURCES.map((source) => source.providerId).sort(), ['alberta-wildfire', 'bc-wildfire-service', 'cwfis-nrcan', 'eccc-msc-cap', 'eccc-msc-nwp', 'noaa-goes-public', 'noaa-nws-cap', 'nrcan-canelevation', 'nrcan-fbp-fuel']);
  for (const source of PUBLIC_EVIDENCE_SOURCES) { assert.equal(source.access, 'AUTHORITATIVE_PUBLIC'); assert.match(source.licenceFingerprint, /^sha256:[a-f0-9]{64}$/); assert.ok(source.authority); assert.ok(source.licenceUrl); }
});

test('historical shadow decisions preserve the cutoff and use only later official reality', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'vigia-public-evidence-')), directory = path.join(root, 'data/validation/evidence-war-room'); await mkdir(directory, { recursive: true });
  const incidents = Array.from({ length: 100 }, (_, index) => ({ id: `CA-AB-TEST${index}`, region: 'CA-AB', officialIdentity: { fireNumber: `TEST${index}` }, officialObservedAt: '2025-05-01T00:00:00.000Z', geometry: { type: 'Point', coordinates: [-115, 54] }, fireType: 'Wildfire', status: 'BH', areaEstimateHectares: 1, finalPerimeter: { areaHectares: 10 + index, capturedAt: '2025-05-02T00:00:00.000Z', rawProductId: `raw:perimeter:${index}` }, lineage: { locationRawProductId: `raw:location:${index}`, perimeterRawProductId: `raw:perimeter:${index}` } }));
  await writeFile(path.join(directory, 'canada-incident-corpus.json'), JSON.stringify({ fingerprint: 'fixture-corpus', incidents }));
  const report = await buildHistoricalShadowDecisions({ projectRoot: root, clock: () => new Date('2026-01-01T00:00:00Z') });
  assert.equal(report.episodes.length, 100); assert.equal(report.informationValueOutcomes.length, 100); assert.equal(report.passed, true); assert.equal(report.episodes.every((episode) => episode.consequentialActionsExecuted === 0), true); assert.equal(report.episodes.every((episode) => Date.parse(episode.cutoff) < Date.parse(episode.laterReality.officialPerimeter.capturedAt)), true);
});
