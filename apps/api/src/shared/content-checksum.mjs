import { createHash, timingSafeEqual } from 'node:crypto';

const SHA256_HEX=/^[a-f0-9]{64}$/i;
const MD5_HEX=/^[a-f0-9]{32}$/i;

export function normalizeContentChecksum(value,{allowMissing=true}={}){
  const input=String(value??'').trim();
  if(!input){if(allowMissing)return null;throw new Error('upstream_checksum_required');}
  const lowered=input.toLowerCase();
  if(/^d50110[a-f0-9]{32}$/.test(lowered))return{algorithm:'md5',digest:lowered.slice(6),encoding:'multihash',strength:'legacy_provider_integrity'};
  if(/^md5:[a-f0-9]{32}$/.test(lowered))return{algorithm:'md5',digest:lowered.slice(4),encoding:'labelled_hex',strength:'legacy_provider_integrity'};
  const candidates=[lowered,lowered.replace(/^sha-?256:/,''),lowered.replace(/^urn:sha-?256:/,''),lowered.startsWith('1220')?lowered.slice(4):''];
  const digest=candidates.find((candidate)=>SHA256_HEX.test(candidate));
  if(digest)return{algorithm:'sha256',digest,encoding:lowered.startsWith('1220')?'multihash':'hex',strength:'cryptographic'};
  throw new Error('upstream_checksum_unsupported');
}

export function normalizeSha256Checksum(value,{allowMissing=true}={}){
  const input=String(value??'').trim();
  if(!input){if(allowMissing)return null;throw new Error('upstream_checksum_required');}
  const checksum=normalizeContentChecksum(input,{allowMissing:false});
  if(checksum.algorithm!=='sha256')throw new Error('upstream_checksum_unsupported');
  return checksum.digest;
}

export function sha256Hex(value){return createHash('sha256').update(value).digest('hex');}

export function assertSha256(value,expected){
  const normalized=normalizeSha256Checksum(expected,{allowMissing:false});
  const actual=sha256Hex(value),left=Buffer.from(actual,'hex'),right=Buffer.from(normalized,'hex');
  if(left.length!==right.length||!timingSafeEqual(left,right))throw new Error('upstream_checksum_mismatch');
  return actual;
}

export function assertContentChecksum(value,expected){
  const normalized=typeof expected==='string'?normalizeContentChecksum(expected,{allowMissing:false}):expected;
  if(!normalized||!['sha256','md5'].includes(normalized.algorithm)||normalized.algorithm==='sha256'&&!SHA256_HEX.test(normalized.digest)||normalized.algorithm==='md5'&&!MD5_HEX.test(normalized.digest))throw new Error('upstream_checksum_unsupported');
  const actual=createHash(normalized.algorithm).update(value).digest(),declared=Buffer.from(normalized.digest,'hex');
  if(actual.length!==declared.length||!timingSafeEqual(actual,declared))throw new Error('upstream_checksum_mismatch');
  return normalized;
}
