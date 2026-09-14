import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { readFileNoFollow } from './release/safe_artifact.mjs';

export const EVENT_PROJECTION_MAX_BYTES = 64 * 1024 * 1024;
export const CANONICAL_INCIDENT_INDEX_MAX_BYTES = 2 * 1024 * 1024;
export const CANONICAL_STARTUP_SUMMARY_MAX_BYTES = 2 * 1024 * 1024;
export const LOCAL_RUNTIME_DESCRIPTOR_MAX_BYTES = 256 * 1024;
export const RETAINED_FIELDNET_SCOPE_MAX_BYTES = 16 * 1024;

const slug = (label) => String(label ?? 'runtime_artifact').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export class RequiredJsonArtifactError extends Error {
  constructor(code, { file, label, maxBytes = null, actualBytes = null, cause = null } = {}) {
    super(`${slug(label)}_${String(code).toLowerCase()}`);
    this.name = 'RequiredJsonArtifactError';
    this.code = code;
    this.file = file;
    this.label = label;
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes;
    this.cause = cause;
    this.terminal = true;
  }
}

async function metadata(file, { label, optional = false } = {}) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error?.code === 'ENOENT' && optional) return null;
    if (error?.code === 'ENOENT') throw new RequiredJsonArtifactError('FILE_NOT_FOUND', { file, label, cause: error });
    throw new RequiredJsonArtifactError('READ_FAILED', { file, label, cause: error });
  }
}

export async function readRequiredJson(file, { root, maxBytes, label, validate = null } = {}) {
  if (!root || !Number.isInteger(maxBytes) || maxBytes <= 0 || !label) throw new Error('required_json_reader_configuration_invalid');
  const info = await metadata(file, { label });
  if (!info.isFile() || info.isSymbolicLink()) throw new RequiredJsonArtifactError('READ_FAILED', { file, label, maxBytes, actualBytes: info.size });
  if (info.size > maxBytes) throw new RequiredJsonArtifactError('FILE_TOO_LARGE', { file, label, maxBytes, actualBytes: info.size });
  let source;
  try {
    source = await readFileNoFollow(file, { root, maxBytes, encoding: 'utf8' });
  } catch (error) {
    throw new RequiredJsonArtifactError('READ_FAILED', { file, label, maxBytes, actualBytes: info.size, cause: error });
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new RequiredJsonArtifactError('INVALID_JSON', { file, label, maxBytes, actualBytes: info.size, cause: error });
  }
  if (validate) {
    try {
      const validated = validate(value);
      if (validated === false) throw new Error('validator_returned_false');
      if (validated !== undefined && validated !== true) value = validated;
    } catch (error) {
      throw new RequiredJsonArtifactError('SCHEMA_INVALID', { file, label, maxBytes, actualBytes: info.size, cause: error });
    }
  }
  return value;
}

export async function readOptionalJson(file, { root, maxBytes = LOCAL_RUNTIME_DESCRIPTOR_MAX_BYTES, label, fallback = null, validate = null } = {}) {
  const info = await metadata(file, { label, optional: true });
  if (!info) return structuredClone(fallback);
  return readRequiredJson(file, { root, maxBytes, label, validate });
}

export function artifactHeadroom(actualBytes, maxBytes) {
  return Number((((maxBytes - actualBytes) / maxBytes) * 100).toFixed(2));
}
