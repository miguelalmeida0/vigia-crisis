import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  createRevocationRegistry, evaluateCapability, evaluateContinuousTrust, revocationStatus, validateProofEnvelopeStructure, verifyProofEnvelope
} from '../packages/domain/src/proof-plane/index.mjs';
import { grant, NOW, proofFixture, request, signedBundle } from '../packages/domain/test/intelligence/proof-plane-fixtures.mjs';

function benchmark(name, iterations, operation) {
  for (let index = 0; index < Math.min(1_000, iterations); index += 1) operation(index);
  const started = performance.now(); for (let index = 0; index < iterations; index += 1) operation(index);
  const elapsedMs = performance.now() - started;
  return { name, iterations, elapsedMs: Number(elapsedMs.toFixed(3)), operationsPerSecond: Math.round(iterations / (elapsedMs / 1_000)), microsecondsPerOperation: Number((elapsedMs * 1_000 / iterations).toFixed(3)) };
}

const fixture = proofFixture(), requested = request(), capability = grant('control:reconcile'), bundle = signedBundle(fixture, { request: requested, grants: [capability] });
const revocations = createRevocationRegistry([{ targetType: 'CREDENTIAL', targetId: 'credential:other', issuerId: 'org:fire', reason: 'benchmark fixture', effectiveAt: NOW }]);
const results = [
  benchmark('proof envelope structural validation', 100_000, () => { assert.equal(validateProofEnvelopeStructure(bundle.actionEnvelope).valid, true); }),
  benchmark('Ed25519 proof verification', 10_000, () => { assert.equal(verifyProofEnvelope(bundle.actionEnvelope, { trustRoots: fixture.roots, revocations, at: NOW, usage: 'ACTION' }).status, 'VALID'); }),
  benchmark('scoped capability decision', 100_000, () => { assert.equal(evaluateCapability([capability], requested, NOW).allowed, true); }),
  benchmark('continuous trust decision', 100_000, () => { assert.equal(evaluateContinuousTrust({ at: NOW, policy: fixture.policy, hardPrerequisites: { proof: true, capability: true }, softSignals: [] }).decision, 'ALLOW'); }),
  benchmark('revocation lookup', 100_000, () => { assert.equal(revocationStatus(revocations, { targets: [{ type: 'CREDENTIAL', id: 'credential:active' }], statementAt: NOW, evaluatedAt: NOW }).revoked, false); })
];
for (let sequence = 10; sequence < 20; sequence += 1) fixture.service.authorize(signedBundle(fixture, { request: requested, grants: [capability], sequence }), requested, { at: NOW });
const replay = fixture.service.createReplay(NOW);
results.push(benchmark('signed transparency replay verification', 1_000, () => { assert.equal(fixture.service.verifyReplay(replay).valid, true); }));
process.stdout.write(`${JSON.stringify({ schemaVersion: 'vigia.proof-plane-benchmark.v1', generatedAt: new Date().toISOString(), runtime: process.version,
  workload: { envelopeValidations: 100_000, cryptographicVerifications: 10_000, capabilityChecks: 100_000, continuousTrustDecisions: 100_000, revocationLookups: 100_000, replayVerifications: 1_000 }, results }, null, 2)}\n`);
