import { createCapabilityGrant, evaluateCapability } from '../../../../../packages/domain/src/proof-plane/index.mjs';

export const FOUNDRY_CAPABILITIES = Object.freeze(['ACQUIRE_PROVIDER_DATA', 'WRITE_RAW_VAULT', 'MATERIALIZE_SILVER', 'BUILD_GOLD_CORPUS', 'RUN_LEAKAGE_AUDIT', 'EXPORT_DERIVED_DATA']);
export function foundryWorkerGrants({ incidentIds = [], validFrom = '2025-01-01T00:00:00.000Z', validUntil = '2030-01-01T00:00:00.000Z' } = {}) { return FOUNDRY_CAPABILITIES.map((capability) => createCapabilityGrant({ capability, scope: { incidentIds, resourceTypes: ['DATA_PRODUCT'], resourceIds: ['*'], actionClasses: [capability] }, validFrom, validUntil, delegable: false })); }
export function authorizeFoundryWorker(grants, { capability, incidentId, resourceId = '*', at = new Date().toISOString() } = {}) { return evaluateCapability(grants, { capability, incidentId, resourceType: 'DATA_PRODUCT', resourceId, actionClass: capability }, at); }
