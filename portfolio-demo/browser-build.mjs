import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const worldKnowledge = resolve(here, '../packages/domain/src/intelligence/world-knowledge.mjs');
const originalImport = "import { createHash } from 'node:crypto';";
const originalHash = "export const hash = value => createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');";

/** Build-time adapter, scoped to the verified world-knowledge hash boundary.
 * No domain source file or canonical release verifier is modified on disk.
 * Fail closed when the expected source changes. Never alias all node:crypto.
 */
export function browserHashAdapter() {
  return {name: 'portfolio-canonical-json-hash', setup(builder) {
    builder.onLoad({filter: /world-knowledge\.mjs$/}, async args => {
      if (args.path !== worldKnowledge) return;
      const source = await readFile(args.path, 'utf8');
      if (!source.includes(originalImport) || !source.includes(originalHash)) {
        throw new Error('Verified hash boundary changed; review the portfolio adapter');
      }
      const contents = source.replace(originalImport,
        `import {hash} from ${JSON.stringify(resolve(here, 'browser-hash.mjs'))};`)
        .replace(originalHash, 'export {hash};');
      return {contents, loader: 'js', resolveDir: dirname(args.path)};
    });
  }};
}

// A compilation probe, not a deployable console artifact.
export function compileScenario() {
  return build({entryPoints: [resolve(here, 'scenario.mjs')], bundle: true,
    platform: 'browser', format: 'esm', target: 'es2022', minify: true,
    sourcemap: false, write: false, metafile: true, logLevel: 'silent',
    plugins: [browserHashAdapter()]});
}
