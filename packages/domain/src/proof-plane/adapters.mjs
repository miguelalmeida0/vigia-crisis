import { immutable } from '../intelligence/shared.mjs';

const KINDS = new Set(['W3C_VC', 'VLEI', 'EIDAS_WALLET', 'WEBAUTHN', 'RATS_EAT']);

export function createProofAdapterBoundary({ kind, id, verify, qualification = null } = {}) {
  const normalizedKind = String(kind ?? '').toUpperCase();
  if (!KINDS.has(normalizedKind) || !id || typeof verify !== 'function') throw new Error('valid_proof_adapter_boundary_required');
  return Object.freeze({ schemaVersion: 'vigia.proof-adapter-boundary.v1', kind: normalizedKind, id: String(id), qualification,
    async assess(input, context = {}) {
      const result = await verify(input, context);
      if (!result || !['VALID', 'INVALID', 'UNSUPPORTED'].includes(result.state)) throw new Error('invalid_proof_adapter_result');
      return immutable({ adapterId: String(id), kind: normalizedKind, complianceClaimed: false, ...result });
    } });
}
