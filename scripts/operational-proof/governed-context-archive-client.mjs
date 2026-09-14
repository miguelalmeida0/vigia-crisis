import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createGovernedContextArchiveClient({ root, rawRoot, pinnedFetch, sha256, sleep }) {
  async function writeRaw(name, text) {
    await mkdir(rawRoot, { recursive: true });
    const target = path.join(rawRoot, name);
    await writeFile(target, text);
    return {
      path: path.relative(root, target).replaceAll(path.sep, '/'),
      bytes: Buffer.byteLength(text),
      sha256: sha256(text),
    };
  }

  async function readExisting(name) {
    try {
      const target = path.join(rawRoot, name);
      const text = await readFile(target, 'utf8');
      return {
        text,
        record: {
          path: path.relative(root, target).replaceAll(path.sep, '/'),
          bytes: (await stat(target)).size,
          sha256: sha256(text),
        },
      };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function overpass(name, query, seed = null) {
    const existing = await readExisting(name);
    if (existing) return { payload: JSON.parse(existing.text), archive: existing.record };
    let text;
    if (seed) {
      text = await readFile(seed, 'utf8');
    } else {
      const endpoints = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter'];
      let lastFailure = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const endpoint = endpoints[attempt % endpoints.length];
        try {
          const response = await pinnedFetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
            headers: { accept: 'application/json', 'user-agent': 'VIGIA-operational-proof/1.0' },
            signal: AbortSignal.timeout(180_000),
          });
          text = await response.text();
          if (response.ok) break;
          lastFailure = `${response.status}:${text.slice(0, 160)}`;
          text = null;
        } catch (error) {
          lastFailure = `${error?.name ?? 'Error'}:${error?.message ?? String(error)}`;
          text = null;
        }
        await sleep(5_000 * (attempt + 1));
      }
      if (!text) throw new Error(`overpass_failed:${name}:${lastFailure}`);
    }
    const archive = await writeRaw(name, text);
    return { payload: JSON.parse(text), archive };
  }

  return { overpass, readExisting, writeRaw };
}
