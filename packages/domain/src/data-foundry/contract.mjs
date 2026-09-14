import { immutable, requiredText, semanticHash } from '../intelligence/shared.mjs';
import { CONTRACT_STATES } from './constants.mjs';

export function createDataContract(input = {}) {
  const core = {
    schemaVersion: 'vigia.data-contract.v1',
    id: requiredText(input.id, 'data_contract_id_required'),
    version: requiredText(input.version, 'data_contract_version_required'),
    productId: requiredText(input.productId, 'data_contract_product_required'),
    requiredFields: [...new Set(input.requiredFields ?? [])].sort(),
    fieldSemantics: structuredClone(input.fieldSemantics ?? {}),
    units: structuredClone(input.units ?? {}),
    coordinateSystems: [...new Set(input.coordinateSystems ?? [])].sort(),
    maximumBytes: Number(input.maximumBytes ?? 16 * 1024 * 1024),
    missingValuePolicy: input.missingValuePolicy ?? 'REJECT_NON_FINITE',
    requireKnowledgeTime: input.requireKnowledgeTime !== false,
    requireLineage: input.requireLineage !== false,
    allowedMaturity: [...new Set(input.allowedMaturity ?? ['OPERATIONAL', 'PROVISIONAL'])].sort(),
    requiredLicenceIds: [...new Set(input.requiredLicenceIds ?? [])].sort(),
  };
  if (!Number.isSafeInteger(core.maximumBytes) || core.maximumBytes < 1) throw new Error('data_contract_maximum_bytes_invalid');
  return immutable({ ...core, fingerprint: semanticHash('data-contract', core) });
}

function getPath(value, field) { return field.split('.').reduce((item, key) => item?.[key], value); }

export function evaluateDataContract(contract, value, context = {}) {
  const failures = [], warnings = [];
  const bytes = Number(context.bytes ?? Buffer.byteLength(JSON.stringify(value ?? null)));
  if (bytes > contract.maximumBytes) failures.push({ code: 'MAXIMUM_SIZE_EXCEEDED', expected: contract.maximumBytes, actual: bytes });
  for (const field of contract.requiredFields) if (getPath(value, field) == null) failures.push({ code: 'REQUIRED_FIELD_MISSING', field });
  for (const [field, units] of Object.entries(contract.units)) if (getPath(value, field) != null && !units.includes(getPath(value, field))) failures.push({ code: 'UNIT_INVALID', field, actual: getPath(value, field), expected: units });
  if (contract.requireKnowledgeTime && !context.availableToVigiaAt) failures.push({ code: 'KNOWLEDGE_TIME_MISSING' });
  if (context.availableToVigiaAt && context.cutoff && Date.parse(context.availableToVigiaAt) > Date.parse(context.cutoff)) failures.push({ code: 'KNOWLEDGE_TIME_AFTER_CUTOFF' });
  if (contract.requireLineage && !(context.lineageRoot || value?.lineageRoot)) failures.push({ code: 'CAUSAL_LINEAGE_MISSING' });
  if (context.maturity && !contract.allowedMaturity.includes(context.maturity)) failures.push({ code: 'MATURITY_NOT_ALLOWED', actual: context.maturity });
  const licences = new Set(context.licenceIds ?? []);
  for (const id of contract.requiredLicenceIds) if (!licences.has(id)) failures.push({ code: 'LICENCE_MISSING', licenceId: id });
  if (context.schemaVersion && context.schemaVersion !== context.expectedSchemaVersion) failures.push({ code: 'SCHEMA_DRIFT', actual: context.schemaVersion, expected: context.expectedSchemaVersion });
  if (context.rightsAllowed === false) failures.push({ code: 'RIGHTS_BLOCKED' });
  let state = 'ACCEPTED';
  if (failures.some((item) => item.code === 'RIGHTS_BLOCKED')) state = 'RIGHTS_BLOCKED';
  else if (failures.some((item) => item.code.startsWith('KNOWLEDGE_TIME'))) state = 'KNOWLEDGE_TIME_INVALID';
  else if (failures.some((item) => item.code === 'SCHEMA_DRIFT')) state = 'SCHEMA_DRIFT';
  else if (failures.length) state = context.quarantineOnFailure === false ? 'REJECTED' : 'QUARANTINED';
  else if (warnings.length) state = 'ACCEPTED_WITH_WARNINGS';
  if (!CONTRACT_STATES.includes(state)) throw new Error('data_contract_state_invalid');
  const core = { schemaVersion: 'vigia.data-contract-result.v1', contractId: contract.id, contractVersion: contract.version, state, failures, warnings };
  return immutable({ ...core, passed: ['ACCEPTED', 'ACCEPTED_WITH_WARNINGS'].includes(state), fingerprint: semanticHash('data-contract-result', core) });
}

export function upcastDataContractValue(value, { fromVersion, toVersion, upcasters = [] } = {}) {
  const source = requiredText(fromVersion, 'data_contract_upcast_source_required'), target = requiredText(toVersion, 'data_contract_upcast_target_required'), bySource = new Map();
  for (const item of upcasters) {
    const from = requiredText(item.fromVersion, 'data_contract_upcaster_source_required'), to = requiredText(item.toVersion, 'data_contract_upcaster_target_required');
    if (bySource.has(from)) throw new Error('data_contract_upcaster_ambiguous');
    if (typeof item.upcast !== 'function') throw new Error('data_contract_upcaster_function_required');
    bySource.set(from, { from, to, upcast: item.upcast });
  }
  let currentVersion = source, currentValue = structuredClone(value); const applied = [], visited = new Set();
  while (currentVersion !== target) {
    if (visited.has(currentVersion)) throw new Error('data_contract_upcaster_cycle');
    visited.add(currentVersion); const step = bySource.get(currentVersion);
    if (!step) throw new Error(`data_contract_upcaster_missing:${currentVersion}->${target}`);
    currentValue = structuredClone(step.upcast(structuredClone(currentValue))); currentVersion = step.to; applied.push(`${step.from}->${step.to}`);
  }
  const core = { schemaVersion: 'vigia.data-contract-upcast-result.v1', fromVersion: source, toVersion: target, applied, value: currentValue };
  return immutable({ ...core, fingerprint: semanticHash('data-contract-upcast-result', core) });
}
