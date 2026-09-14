import { evaluateEvidenceContract } from '../evaluation/evaluate-evidence-contract.mjs';
import { immutable, semanticHash } from '../shared.mjs';

export function createEvidenceReplay({ claim, contract, evidenceGraph, evaluationTime, previousEvaluation = null }) {
  const input = immutable({ claim, contract, evidenceGraph, evaluationTime: new Date(evaluationTime).toISOString(), previousEvaluation });
  const result = evaluateEvidenceContract({ claim: input.claim, contract: input.contract, evidenceGraph: input.evidenceGraph, evaluationTime: input.evaluationTime, previousEvaluation: input.previousEvaluation });
  const inputHash = semanticHash('evidence-replay-input', input);
  const outputHash = semanticHash('evidence-replay-output', result);
  return immutable({
    schemaVersion: 'vigia.evidence-replay.v1',
    id: semanticHash('evidence-replay', { inputHash, outputHash }),
    contract: { id: contract.id, version: contract.version, fingerprint: contract.fingerprint },
    evaluationTime: input.evaluationTime, inputHash, outputHash, input, result
  });
}

export function verifyEvidenceReplay(record) {
  const inputHash = semanticHash('evidence-replay-input', record.input);
  const result = evaluateEvidenceContract({
    claim: record.input.claim, contract: record.input.contract, evidenceGraph: record.input.evidenceGraph,
    evaluationTime: record.input.evaluationTime, previousEvaluation: record.input.previousEvaluation
  });
  const outputHash = semanticHash('evidence-replay-output', result);
  return immutable({
    verified: inputHash === record.inputHash && outputHash === record.outputHash,
    inputHashMatches: inputHash === record.inputHash, outputHashMatches: outputHash === record.outputHash,
    contract: { id: record.input.contract.id, version: record.input.contract.version, fingerprint: record.input.contract.fingerprint },
    result
  });
}
