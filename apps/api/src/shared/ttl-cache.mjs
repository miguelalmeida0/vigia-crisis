export class TtlCache {
  #entries = new Map();
  #clock;
  #maxEntries;

  constructor({ clock = () => Date.now(), maxEntries = 250 } = {}) {
    this.#clock = clock;
    this.#maxEntries = maxEntries;
  }

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#clock()) {
      this.#entries.delete(key);
      return undefined;
    }
    return structuredClone(entry.value);
  }

  set(key, value, ttlMs) {
    this.#entries.set(key, { value: structuredClone(value), expiresAt: this.#clock() + ttlMs });
    while (this.#entries.size > this.#maxEntries) {
      this.#entries.delete(this.#entries.keys().next().value);
    }
  }

  delete(key) {
    this.#entries.delete(key);
  }

  clear() {
    this.#entries.clear();
  }
}
