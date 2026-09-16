import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Governed reference archives are nationwide static extracts (the OSM
// response-facility archive alone is ~5MB; GovernedReferenceInventory reads
// 15 of them, ~46MB total) that more than one consumer needs to check and
// parse. GovernedResponseFacilityRepository and GovernedReferenceInventory
// both resolve their archive selection through the same
// governed-incident-context.json, and both need the response-facilities
// archive specifically — reading and JSON.parse-ing either file twice wastes
// I/O and doubles a multi-MB allocation for identical content. This cache
// makes "load this absolute path" idempotent for the process lifetime: every
// caller sharing one instance gets back the exact same parsed object rather
// than building its own copy. It is intentionally just a Map keyed by path,
// owned and constructed by whoever wires the consumers together (see
// createServices) — not a module-level singleton — so its lifetime is tied
// to that owner's, with nothing else to shut down (readFile holds no
// resource open past its own call).
//
// The returned `parsed` value is shared, read-only reference content: no
// caller may mutate it in place.
export class GovernedArchiveCache {
  #entries = new Map();

  // Returns { bytes, sha256, parsed } for an absolute file path, loading and
  // parsing it at most once no matter how many callers ask for it. A failed
  // load (e.g. ENOENT, used by callers to detect an archive that was never
  // deployed) is not cached, so a later retry with a corrected path can still
  // succeed and the original rejection reason is preserved unchanged.
  load(absolutePath) {
    if (!this.#entries.has(absolutePath)) {
      const promise = (async () => {
        const bytes = await readFile(absolutePath);
        const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        const parsed = JSON.parse(bytes.toString('utf8'));
        return { bytes, sha256, parsed };
      })();
      promise.catch(() => this.#entries.delete(absolutePath));
      this.#entries.set(absolutePath, promise);
    }
    return this.#entries.get(absolutePath);
  }


  // Drops every cached entry. The cache exists only to bridge the narrow
  // startup window where GovernedResponseFacilityRepository and
  // GovernedReferenceInventory both need the same file — once both have
  // finished initialize() and extracted their own derived indexes, the
  // shared raw parsed JSON (the response-facilities archive is ~5MB on disk,
  // several times that as parsed JS objects) serves no one and should not
  // sit in memory for the rest of the process. The owner (createServices)
  // calls this once every known consumer's initialize() has settled.
  clear() {
    this.#entries.clear();
  }
}
