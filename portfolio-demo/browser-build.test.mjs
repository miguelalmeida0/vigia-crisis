import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {hash} from './browser-hash.mjs';
import {compileScenario} from './browser-build.mjs';
import {createDemoSession, DEMO_ACTIONS} from './scenario.mjs';

const decisions = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'generationMs' ? undefined : item));

test('browser SHA-256 matches canonical Node identifiers for admitted values', () => {
  for (const value of ['', 'EM527', 'Évora · ação 🔥', null, false, 0,
    ['route', {at: '2026-09-15', coordinates: [-7.91, 38.57]}], {a: 1, b: null}]) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    assert.equal(hash(value), createHash('sha256').update(text).digest('hex'));
  }
  assert.throws(() => hash(new Uint8Array([1])), /outside/);
});

test('bundle executes all scenario transitions with no Node globals or network', async () => {
  const result = await compileScenario();
  assert.ok(Object.values(result.metafile.outputs).every(output => output.imports.length === 0));
  const code = result.outputFiles[0].text;
  assert.doesNotMatch(code, /node:crypto|\/Users\/|sourceMappingURL/);
  assert.ok(result.outputFiles[0].contents.byteLength < 250_000, 'scenario engine bundle budget');

  // Execute in an isolated JS realm. Deliberately provide neither Buffer nor
  // process, require, fetch, WebSocket, localStorage, document or browser APIs.
  // This is an engine execution check; it is not a rendered browser test.
  const exports = code.match(/export\{([^}]+)\};?\s*$/);
  assert.ok(exports, 'esbuild emitted named ESM exports');
  const bindings = exports[1].split(',').map(binding => {
    const [local, name = local] = binding.trim().split(/\s+as\s+/);
    return `${JSON.stringify(name)}:${local}`;
  });
  const executable = code.slice(0, exports.index) + `;globalThis.bundle={${bindings.join(',')}};`;
  const context = vm.createContext({TextEncoder, performance, structuredClone});
  vm.runInContext(executable, context, {timeout: 5000});
  for (const first of DEMO_ACTIONS) for (const second of DEMO_ACTIONS) {
    const browser = context.bundle.createDemoSession();
    const node = createDemoSession();
    browser.apply(first);
    node.apply(first);
    assert.deepEqual(decisions(browser.apply(second)), decisions(node.apply(second)));
  }
});
