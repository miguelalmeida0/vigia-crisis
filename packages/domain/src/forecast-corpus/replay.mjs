import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

function semanticInventory(input = {}) {
  return {
    rawObjectHashes: uniqueSorted(input.rawObjectHashes), parserVersions: uniqueSorted(input.parserVersions),
    canonicalSchemaVersions: uniqueSorted(input.canonicalSchemaVersions), associationDoctrine: input.associationDoctrine,
    knowledgeTimePolicy: input.knowledgeTimePolicy, exampleBuilderVersion: input.exampleBuilderVersion,
    splitVersion: input.splitVersion, incidentCrosswalkHash: input.incidentCrosswalkHash,
    eligibleExampleIds: uniqueSorted(input.eligibleExampleIds), rejectedExampleIds: uniqueSorted(input.rejectedExampleIds),
    negativeControlIds: uniqueSorted(input.negativeControlIds), leakageAuditHash: input.leakageAuditHash,
  };
}
export function createCorpusReplayRecord(input = {}) {
  const inventory = semanticInventory(input), corpusFingerprint = semanticHash('forecast-corpus', inventory);
  return immutable({ schemaVersion: 'vigia.forecast-corpus-replay.v1', inventory, corpusFingerprint });
}
export function verifyCorpusReplay(record, reproducedInput) {
  const reproduced = createCorpusReplayRecord(reproducedInput), identical = reproduced.corpusFingerprint === record.corpusFingerprint;
  return immutable({ schemaVersion: 'vigia.forecast-corpus-replay-verification.v1', valid: identical, identical, expected: record.corpusFingerprint, actual: reproduced.corpusFingerprint, reversedOrderingStable: createCorpusReplayRecord({ ...reproducedInput, rawObjectHashes: [...(reproducedInput.rawObjectHashes ?? [])].reverse(), eligibleExampleIds: [...(reproducedInput.eligibleExampleIds ?? [])].reverse() }).corpusFingerprint === reproduced.corpusFingerprint });
}
