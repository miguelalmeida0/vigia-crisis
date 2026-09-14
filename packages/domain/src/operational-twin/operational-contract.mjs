import { createEvidenceContract } from '../intelligence/contracts/evidence-contract.mjs';
import { createWildfireDetectionContract } from '../intelligence/contracts/wildfire-detection.mjs';

const foundation = createWildfireDetectionContract({ version: 'operational-twin-1' });
const { fingerprint, schemaVersion, ...input } = foundation;

export const OPERATIONAL_WILDFIRE_CONTRACT_V1 = createEvidenceContract({
  ...input,
  sourceExclusions: {
    ...foundation.sourceExclusions,
    sourceStatuses: ['COMPROMISED', 'EXCLUDED', 'DISALLOWED', 'QUARANTINED', 'STALE', 'UNAVAILABLE']
  },
  doctrine: `${foundation.doctrine} Operational twin binding excludes sources whose explicit or time-derived health is unsafe.`,
  metadata: { ...foundation.metadata, foundationContractVersion: '1', operationalBinding: 'event-fabric-v1' }
});
