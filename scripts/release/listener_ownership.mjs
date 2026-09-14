import path from 'node:path';

export function resolveReleasePorts(env={}){
  const resolve=(name,fallback)=>{const value=Number(env[name]??fallback);if(!Number.isInteger(value)||value<1024||value>65535)throw new Error(`invalid_release_port:${name}`);return value;};
  const central=resolve('VIGIA_RELEASE_API_PORT',4177),fieldNode=resolve('VIGIA_RELEASE_FIELD_PORT',4188);
  if(central===fieldNode)throw new Error('release_ports_must_be_distinct');
  return{central,fieldNode};
}

export function releaseIdentityFailures(actual, manifest) {
  const failures = [];
  if (actual?.releaseId !== manifest.releaseId) failures.push('release_id_mismatch');
  if (actual?.codeStateHash !== manifest.codeStateHash) failures.push('code_state_hash_mismatch');
  if (actual?.operationalDataHash !== manifest.operationalDataHash) failures.push('operational_data_hash_mismatch');
  if (actual?.releaseStatementHash !== manifest.releaseStatementHash) failures.push('release_statement_hash_mismatch');
  for (const [name, value] of Object.entries(manifest.contracts ?? {})) {
    if (actual?.contracts?.[name] !== value) failures.push(`contract_mismatch:${name}`);
  }
  return failures;
}

export function releaseFieldNodeId(releaseId, runId) {
  const release = String(releaseId ?? '').trim();
  const run = String(runId ?? '').trim();
  if (!release || !run) throw new Error('release_fieldnode_identity_components_required');
  return `field-node:release:${release}:${run}`;
}

export function releaseControlSocketPath(runtimeDir,runId){
  const run=String(runId??'').trim();if(!run)throw new Error('release_control_socket_run_id_required');
  const socketPath=path.join(runtimeDir,`fn-${run}.sock`);
  if(Buffer.byteLength(socketPath)>103)throw new Error('release_control_socket_path_too_long');
  return socketPath;
}

export function canonicalListenerDecision({ root, manifest, central, field }) {
  const centralPids = central?.pids ?? [];
  const fieldPids = field?.pids ?? [];
  if (!centralPids.length && !fieldPids.length) return { action: 'START', reason: 'ports_free' };

  for (const listener of [central, field]) {
    for (const item of listener?.processes ?? []) {
      if (path.resolve(item.cwd ?? '/') !== path.resolve(root)) {
        const error = new Error(`refusing_to_replace_non_project_process:${listener.port}:${item.pid}`);
        error.details = { port: listener.port, pid: item.pid, cwd: item.cwd ?? null };
        throw error;
      }
    }
  }

  if (centralPids.length !== 1 || fieldPids.length !== 1) {
    return { action: 'RESTART', reason: 'canonical_listener_pair_incomplete_or_ambiguous' };
  }
  const failures = [
    ...releaseIdentityFailures(central?.identity, manifest).map((item) => `central:${item}`),
    ...releaseIdentityFailures(field?.identity, manifest).map((item) => `fieldNode:${item}`),
  ];
  if (failures.length) return { action: 'RESTART', reason: 'release_identity_mismatch', failures };
  return { action: 'RESTART', reason: 'listener_reuse_disabled_without_authenticated_launch_provenance' };
}
