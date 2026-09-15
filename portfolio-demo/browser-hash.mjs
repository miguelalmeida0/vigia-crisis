import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';

// The public adapter admits canonical JSON values and strings only. No binary
// files, uploads or cryptographic credentials enter the controlled scenario.
export function hash(value) {
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw new TypeError('Binary values are outside the portfolio scenario contract');
  }
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof serialized !== 'string') throw new TypeError('A JSON value or string is required');
  return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}
