import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ReplayService } from '../src/modules/replay/replay-service.mjs';

const root = new URL('../../../', import.meta.url);
const service = new ReplayService({
  corpusFile: fileURLToPath(new URL('data/replay/corpus/portugal-2024-official.json', root)),
  sourceManifestFile: fileURLToPath(new URL('data/replay/corpus/portugal-2024-source-manifest.json', root)),
  benchmarkFile: fileURLToPath(new URL('data/replay/results/portugal-2024-benchmark.json', root))
});

test('replay overview exposes governed real evidence and a defensible physical-first hero', async () => {
  await service.initialize();
  const overview = service.overview();
  assert.equal(overview.mode, 'HISTORICAL_REPLAY');
  assert.equal(overview.corpus.synthetic, false);
  assert.equal(overview.cases.length, 35);
  assert.equal(overview.sources.length, 4);
  assert.ok(overview.sources.every((item) => item.state === 'archived_verified' && item.checksumSha256));
  assert.equal(overview.heroCaseId, 'PT-2024-ICNF-59158');
  const hero = overview.cases.find((item) => item.hero);
  assert.equal(hero.benchmark.associated, true);
  assert.equal(hero.benchmark.fragmented, false);
  assert.equal(hero.physicalLeadMinutes, 41);
});

test('replay case detail uses the controlled clock and retains source provenance', { timeout: 20_000 }, async () => {
  await service.initialize();
  const detail = await service.caseDetail('PT-2024-ICNF-59677');
  assert.equal(detail.controlledClock.futureEvidenceViolations, 0);
  assert.ok(detail.controlledClock.steps.length > 1);
  assert.ok(detail.evidence.some((item) => item.kind === 'report'));
  assert.ok(detail.evidence.some((item) => item.kind === 'thermal'));
  assert.ok(detail.evidence.every((item) => item.synthetic === false && item.checksumSha256));
  assert.ok(detail.derived.events.some((item) => item.geometryTimeline.length >= 2));
  assert.equal(detail.probability.state, 'UNCALIBRATED');
});
