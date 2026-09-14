import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

const required = (value, code) => { const text = String(value ?? '').trim(); if (!text) throw new Error(code); return text; };
export function createHaCertificationTopology(input = {}) {
  const nodes = ['primary', 'synchronousStandby', 'recoveryReplica'].map((name) => ({ role: name, region: required(input[name]?.region, `ha_${name}_region_required`), zone: required(input[name]?.zone, `ha_${name}_zone_required`), stackId: required(input[name]?.stackId, `ha_${name}_stack_required`), databaseEndpointId: required(input[name]?.databaseEndpointId, `ha_${name}_database_required`) }));
  if (nodes[0].zone === nodes[1].zone || nodes[0].region !== nodes[1].region) throw new Error('ha_synchronous_standby_failure_domain_invalid');
  if (nodes[2].region === nodes[0].region) throw new Error('ha_recovery_region_not_distinct');
  if (new Set(nodes.map((item) => item.stackId)).size !== 3) throw new Error('ha_stacks_not_independently_deployable');
  const core = { schemaVersion: 'vigia.ha-certification-topology.v1', nodes, routing: { trafficDirector: required(input.routing?.trafficDirector, 'ha_traffic_director_required'), fencingProvider: required(input.routing?.fencingProvider, 'ha_fencing_provider_required'), consistencyTokenMode: 'PROJECTION_VERSION' }, replication: { zone: 'SYNCHRONOUS', region: 'ASYNCHRONOUS_MEASURED_RPO' }, certificationCyclesRequired: 100 };
  return immutable({ ...core, fingerprint: semanticHash('ha-certification-topology', core) });
}
export function certifyHaEvidence(evidence = {}) {
  const topology = createHaCertificationTopology(evidence.topology), cycles = evidence.cycles ?? [], failures = [];
  if (cycles.length < 100) failures.push('FAILOVER_CYCLES_BELOW_100');
  for (const cycle of cycles) {
    if (!(Number(cycle.zoneRtoSeconds) < 60)) failures.push(`${cycle.id}:ZONE_RTO`);
    if (Number(cycle.zoneRpoTransactions) !== 0) failures.push(`${cycle.id}:ZONE_RPO`);
    if (!(Number(cycle.regionRtoSeconds) < 300)) failures.push(`${cycle.id}:REGION_RTO`);
    if (!Number.isSafeInteger(Number(cycle.regionRpoTransactions)) || Number(cycle.regionRpoTransactions) < 0) failures.push(`${cycle.id}:REGION_RPO_UNMEASURED`);
    if (Number(cycle.splitBrainWrites) !== 0) failures.push(`${cycle.id}:SPLIT_BRAIN_WRITE`);
    if (Number(cycle.duplicateActions) !== 0) failures.push(`${cycle.id}:DUPLICATE_ACTION`);
    for (const flag of ['databasePromoted', 'writeFencingHeld', 'consistencyTokensHeld', 'controllerIdempotencyHeld', 'decisionPacketIdentityHeld', 'rollingUpgradeHeld', 'secondaryDomainBackupRestored']) if (cycle[flag] !== true) failures.push(`${cycle.id}:${flag}`);
  }
  const core = { schemaVersion: 'vigia.ha-certification-result.v1', topologyFingerprint: topology.fingerprint, cycles: cycles.length, measuredRegionRpoMaximumTransactions: cycles.length ? Math.max(...cycles.map((item) => Number(item.regionRpoTransactions))) : null, zoneRtoMaximumSeconds: cycles.length ? Math.max(...cycles.map((item) => Number(item.zoneRtoSeconds))) : null, regionRtoMaximumSeconds: cycles.length ? Math.max(...cycles.map((item) => Number(item.regionRtoSeconds))) : null, splitBrainWrites: cycles.reduce((sum, item) => sum + Number(item.splitBrainWrites ?? 0), 0), duplicateActions: cycles.reduce((sum, item) => sum + Number(item.duplicateActions ?? 0), 0), failures: uniqueSorted(failures), passed: failures.length === 0 };
  return immutable({ ...core, fingerprint: semanticHash('ha-certification-result', core) });
}
