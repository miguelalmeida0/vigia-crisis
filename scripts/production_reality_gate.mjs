import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/api/src/config/env.mjs';

const ROOT = process.cwd();
const ENTRY = 'apps/api/src/server.mjs';
const IMPORT_PATTERN = /(?:from\s+|import\s*\()['"](\.[^'"]+)['"]/g;

async function exists(file) { try { await readFile(file); return true; } catch { return false; } }
async function imports(file) {
  const source = await readFile(path.join(ROOT, file), 'utf8'), output = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    let target = path.resolve(ROOT, path.dirname(file), match[1]);
    if (!path.extname(target)) target += path.extname(file);
    output.push(path.relative(ROOT, target));
  }
  return output;
}
async function reachable(entry) {
  const visited = new Set(), pending = [entry];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file) || !await exists(path.join(ROOT, file))) continue;
    visited.add(file); pending.push(...await imports(file));
  }
  return [...visited].sort();
}
async function json(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } }
async function walk(directory) {
  const output=[];
  for(const entry of await readdir(directory,{withFileTypes:true}).catch(()=>[])){
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())output.push(...await walk(target));else output.push(target);
  }
  return output;
}

export async function productionRealityGate(env = {}) {
  const config = loadConfig({ ...env, VIGIA_UNIVERSE: 'production' });
  const graph = await reachable(ENTRY);
  const forbiddenImports = graph.filter((file) => /(^|\/)(test|fixtures?)(\/|$)/i.test(file));
  const eventFile = path.join(path.dirname(config.stateFile), 'fire-event-observations.production.json');
  const eventState = await json(eventFile, { observations: [] });
  const observations = Array.isArray(eventState.observations) ? eventState.observations : [];
  const synthetic = observations.filter((item) => item?.provenance?.synthetic === true || item?.fixture === true || /fixture|synthetic|mock|fake/i.test(String(item?.source ?? '')));
  const operatorState = await json(config.stateFile, { actors: [] });
  const demoIdentities = (operatorState.actors ?? []).filter((item) => /^actor-(?:supervisor|analyst|field|viewer)$/.test(String(item.id)));
  const webRoot = path.join(ROOT, 'apps/web'), webAssets = await walk(path.join(webRoot, 'assets'));
  const servedSyntheticAssets = webAssets.map((file)=>path.relative(ROOT,file)).filter((file)=>/fixture|synthetic|demo/i.test(file));
  const operationalFictions=[];
  for(const file of (await walk(webRoot)).filter((item)=>/\.(?:html|js|css|json|webmanifest)$/i.test(item))){
    const source=await readFile(file,'utf8');
    if(/actor-(?:supervisor|analyst|field|viewer)|DEMO ENVIRONMENT|Save event locally|data-demo-banner|VIGIA_FIXTURES/.test(source))operationalFictions.push(path.relative(ROOT,file));
  }
  let legacySwitchRejected=false;
  try { loadConfig({ ...env, VIGIA_FIXTURES: '1' }); } catch (error) { legacySwitchRejected=error?.code==='production_integrity_violation'; }
  const checks = [
    { id:'synthetic_observations', value:synthetic.length, pass:synthetic.length===0 },
    { id:'fixture_provider_imports', value:forbiddenImports.length, pass:forbiddenImports.length===0, evidence:forbiddenImports },
    { id:'demo_identities', value:demoIdentities.length, pass:demoIdentities.length===0, evidence:demoIdentities.map((item)=>item.id) },
    { id:'served_synthetic_assets', value:servedSyntheticAssets.length, pass:servedSyntheticAssets.length===0, evidence:servedSyntheticAssets },
    { id:'served_operational_fictions', value:operationalFictions.length, pass:operationalFictions.length===0, evidence:operationalFictions },
    { id:'legacy_fixture_switch_rejected', value:legacySwitchRejected?1:0, pass:legacySwitchRejected }
  ];
  return { gate:'VIGIA_REALITY_R0', universe:'production', pass:checks.every((item)=>item.pass), checkedAt:new Date().toISOString(), productionModules:graph.length, observations:observations.length, checks };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result=await productionRealityGate(process.env);
  console.log(JSON.stringify(result,null,2));
  if(!result.pass)process.exitCode=1;
}
