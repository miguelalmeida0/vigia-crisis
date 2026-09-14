import { canonical, sha256 } from '../../../../../packages/domain/src/fieldnet/contracts.mjs';

export function authorizeFieldNetSync({ requestVerifier, proofPlane, clock, nodeRegistry, req, input }) {
  const principal = requestVerifier.verify({ method: req.method, path: new URL(req.url, 'http://localhost').pathname, headers: req.headers, body: input });
  return authorizeFieldNetProof({ proofPlane, clock, nodeRegistry, principal, input });
}

export function authorizeFieldNetProof({ proofPlane, clock, nodeRegistry, principal, input }) {
  if (principal.keyId !== String(input.nodeId ?? '')) throw Object.assign(new Error('fieldnet_node_identity_mismatch'), { statusCode: 403 });
  const registration = nodeRegistry[principal.keyId], mutations = Array.isArray(input.mutations) ? input.mutations : [];
  const incidentIds = [...new Set(mutations.map((item) => String(item?.incidentId ?? '')).filter(Boolean))];
  if (!registration?.capabilities?.includes('fieldnet:sync')) throw Object.assign(new Error('fieldnet_node_capability_forbidden'), { statusCode: 403 });
  if (mutations.some((item) => item?.type === 'COMMAND_SURVIVAL_EVENT') && !registration.capabilities.includes('fieldnet:command-survival')) throw Object.assign(new Error('fieldnet_node_command_capability_forbidden'), { statusCode: 403 });
  if (incidentIds.some((incidentId) => !registration.incidentIds?.includes(incidentId))) throw Object.assign(new Error('fieldnet_node_incident_scope_forbidden'), { statusCode: 403, details: { nodeId: principal.keyId, incidentIds } });
  if (!proofPlane) return principal;
  const authorities = [];
  for (const incidentId of incidentIds) {
    const requestFingerprint = sha256(canonical({ nodeId: principal.keyId, incidentId, mutations: mutations.filter((item) => item.incidentId === incidentId)
      .map((item) => ({ id: item.id, type: item.type, payloadHash: item.payloadHash, localSequence: item.localSequence })) }));
    const bundle = input.proofBundles?.[incidentId], base = { organizationId: registration.organizationId, incidentId, resourceType: 'fieldnet-sync', resourceId: principal.keyId,
      actionClass: 'FIELD_SYNC', sensitivity: 'MEDIUM', requestFingerprint };
    const sync = proofPlane.authorize(bundle, { ...base, capability: 'fieldnet:sync' }, { at: clock(), consume: true });
    if (sync.decision !== 'AUTHORIZED' || sync.principalId !== (registration.principalId ?? principal.keyId)) throw Object.assign(new Error('fieldnet_proof_authority_forbidden'), { statusCode: 403, details: { incidentId, decision: sync.decision } });
    if (mutations.some((item) => item.incidentId === incidentId && item.type === 'COMMAND_SURVIVAL_EVENT')) {
      const command = proofPlane.authorize(bundle, { ...base, capability: 'fieldnet:command-survival' }, { at: clock(), consume: false });
      if (command.decision !== 'AUTHORIZED') throw Object.assign(new Error('fieldnet_command_proof_authority_forbidden'), { statusCode: 403, details: { incidentId, decision: command.decision } });
    }
    authorities.push(sync.decisionId);
  }
  return { ...principal, proofAuthorityDecisionIds: authorities };
}
