import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runPortugalReplay } from '../../../scripts/lib/portugal-replay.mjs';

const corpusUrl = new URL('../../../data/replay/corpus/portugal-2024-official.json', import.meta.url);

test('official Portugal corpus runs through the production event path without future evidence leakage', { timeout: 20_000 }, async () => {
  const corpus = JSON.parse(await readFile(corpusUrl, 'utf8'));
  const result = await runPortugalReplay(corpus);
  assert.equal(corpus.metadata.evidenceClass, 'official_archival_evidence');
  assert.equal(corpus.cases.length, 35);
  assert.equal(result.softwareReplay.controlledClock, true);
  assert.equal(result.softwareReplay.futureEvidenceViolations, 0);
  assert.equal(result.softwareReplay.geometry.allRejectPerimeterAuthority, true);
  assert.equal(result.validation.state, 'MEASURED_AGAINST_OFFICIAL_REPORT_REFERENCES');
  assert.equal(result.validation.metrics.caseCount, 35);
  assert.equal(result.validation.metrics.physicalFirstCases, 7);
  assert.equal(result.validation.metrics.associatedCases, 35);
  assert.equal(result.validation.metrics.fragmentationRate, 0);
  assert.equal(result.validation.metrics.falseMergeRate, 0);
  assert.equal(result.validation.metrics.splitMetrics.held_out.caseCount, 10);
  assert.equal(result.caseStates.length, 35);
  assert.equal(result.softwareReplay.unjustifiedIdentityReassignments, 0);
});
