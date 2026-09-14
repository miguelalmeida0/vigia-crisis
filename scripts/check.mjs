import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const startedAt = performance.now();
const exec = promisify(execFile);
const ROOTS = ['apps', 'packages', 'scripts'];
const CODE = new Set(['.js', '.mjs']);
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules', 'dist', 'build', 'coverage', '.cache', '.vite', 'playwright-report',
  'test-results', '.tmp', '.next', 'browser-artifacts', 'generated-browser-artifacts',
]);
const EXCLUDED_PATH_PREFIXES = new Map([['apps/mission-dark', 'quarantined fixture prototype'],['apps/web','quarantined legacy frontend']]);
const VENDORED_SOURCE_BUDGET_EXEMPTIONS = new Map([[
  'apps/operator-console/assets/vendor/maplibre-gl/maplibre-gl.mjs',
  { reason: 'source-budget:vendored MapLibre GL JS v6.7.0 distribution', marker: 'github.com/maplibre/maplibre-gl-js/blob/v6.7.0/LICENSE.txt' }
]]);
const errors = [], exclusions = new Map();
function recordExclusion(reason) { exclusions.set(reason, (exclusions.get(reason) ?? 0) + 1); }
async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name), relative = target.split(path.sep).join('/');
    if (entry.isDirectory()) {
      const prefixReason = [...EXCLUDED_PATH_PREFIXES].find(([prefix]) => relative === prefix || relative.startsWith(`${prefix}/`))?.[1];
      if (prefixReason) { recordExclusion(prefixReason); continue; }
      if (EXCLUDED_DIRECTORIES.has(entry.name)) { recordExclusion(`directory:${entry.name}`); continue; }
      output.push(...await walk(target));
    } else output.push(target);
  }
  return output;
}
const files = (await Promise.all(ROOTS.map(walk))).flat(); const codeFiles = files.filter((item) => CODE.has(path.extname(item)));
const sources=new Map(),syntaxQueue=[...codeFiles];
await Promise.all(Array.from({length:Math.min(8,syntaxQueue.length)},async()=>{
  while(syntaxQueue.length){const file=syntaxQueue.pop();try{await exec(process.execPath,['--check',file],{encoding:'utf8',maxBuffer:1024*1024});}catch(error){errors.push(`${file}: syntax error\n${error.stderr??error.message}`);}}
}));
await Promise.all(codeFiles.map(async(file)=>sources.set(file,await readFile(file,'utf8'))));
for (const file of codeFiles) {
  const source = sources.get(file); const lines = source.split('\n').length;
  const vendoredBudgetExemption = VENDORED_SOURCE_BUDGET_EXEMPTIONS.get(file);
  const lineBudget = /(^|\/)postgres-[^/]+-store\.mjs$/.test(file) ? 300
    : file === 'scripts/prevention-validation/run_machine_validation_campaign.mjs' ? 560
      : 220;
  if (vendoredBudgetExemption && !source.includes(vendoredBudgetExemption.marker)) errors.push(`${file}: vendored source-budget exemption marker is missing`);
  else if (vendoredBudgetExemption) recordExclusion(vendoredBudgetExemption.reason);
  else if (lines > lineBudget) errors.push(`${file}: ${lines} lines exceeds the ${lineBudget}-line modularity budget`);
  if (file !== 'scripts/check.mjs' && /\bTODO\b|\bFIXME\b/.test(source)) errors.push(`${file}: unresolved work marker`);
}
const graph = new Map();
for (const file of codeFiles) {
  const source = sources.get(file); const deps = [];
  for (const match of source.matchAll(/(?:from\s+|import\s*\()['"](\.[^'"]+)['"]/g)) {
    const specifier=match[1].split(/[?#]/,1)[0];let target = path.resolve(path.dirname(file), specifier); if (!path.extname(target)) target += path.extname(file);
    try { if ((await stat(target)).isFile()) deps.push(path.relative('.', target)); } catch { errors.push(`${file}: missing local import ${match[1]}`); }
  }
  graph.set(file, deps);
}
const visiting = new Set(), visited = new Set();
function visit(file, stack = []) { if (visiting.has(file)) { errors.push(`Import cycle: ${[...stack, file].join(' -> ')}`); return; } if (visited.has(file)) return; visiting.add(file); for (const dep of graph.get(file) ?? []) if (graph.has(dep)) visit(dep, [...stack, file]); visiting.delete(file); visited.add(file); }
for (const file of graph.keys()) visit(file);
const productionReachable = new Set(), productionPending = ['apps/api/src/server.mjs'];
while (productionPending.length) { const file=productionPending.pop(); if(productionReachable.has(file))continue; productionReachable.add(file); productionPending.push(...(graph.get(file)??[])); }
for(const file of productionReachable)if(/(^|\/)(test|fixtures?)(\/|$)/i.test(file))errors.push(`Production import graph reaches test/fixture module: ${file}`);
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const allowedDependencies = { 'fast-check': '^4.9.0', pg: '^8.23.0', 'satellite.js': '7.1.0' };
if (JSON.stringify(packageJson.dependencies ?? {}) !== JSON.stringify(allowedDependencies)) errors.push('package.json: dependencies must remain limited to the reviewed allowlist; fast-check must remain unreachable from the production import graph');
if (packageJson.devDependencies) errors.push('package.json: development dependencies are not permitted');
const candidate = await readFile('apps/api/src/modules/prevention/candidate-engine.mjs', 'utf8'); if (!candidate.includes('not detected or confirmed')) errors.push('Prevention candidates must remain neutral before evidence');
const response = await readFile('apps/api/src/modules/response/response-service.mjs', 'utf8'); if (!response.includes('consequenceGate')) errors.push('Response service must enforce truth-stage gating');
for(const directory of EXCLUDED_DIRECTORIES)if(!exclusions.has(`directory:${directory}`))exclusions.set(`directory:${directory}`,0);
for(const reason of EXCLUDED_PATH_PREFIXES.values())if(!exclusions.has(reason))exclusions.set(reason,0);
const elapsedSeconds=((performance.now()-startedAt)/1000).toFixed(2),exclusionSummary=[...exclusions].sort(([a],[b])=>a.localeCompare(b)).map(([reason,count])=>`${reason}=${count}`).join(', ')||'none';
if (errors.length) { console.error(errors.join('\n\n')); console.error(`Architecture check failed after ${elapsedSeconds}s: ${files.length} files inspected; exclusions: ${exclusionSummary}.`); process.exit(1); }
console.log(`Architecture check passed in ${elapsedSeconds}s: ${files.length} files inspected; ${codeFiles.length} runtime/test modules are syntactically valid, acyclic and within their declared modularity budgets; exclusions: ${exclusionSummary}.`);
