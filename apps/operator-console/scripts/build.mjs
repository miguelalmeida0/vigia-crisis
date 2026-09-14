import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_OPERATOR_RUNTIME_FILES,classifyReleasePath,operatorSourceHashFromEntries } from '../../../scripts/release/build_release_manifest.mjs';
import { atomicWriteNoFollow } from '../../../scripts/release/safe_artifact.mjs';
import { sha256,verifyReleaseBundle } from '../../../scripts/release/release_statement.mjs';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot=path.resolve(root,'../..');
const dist = path.join(root, 'dist');
const hash=(value)=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
async function files(directory,{excludeDist=false}={}){const output=[];for(const entry of await readdir(directory,{withFileTypes:true})){if(excludeDist&&entry.name==='dist')continue;const absolute=path.join(directory,entry.name);if(entry.isDirectory())output.push(...await files(absolute,{excludeDist:false}));else if(entry.isFile())output.push(absolute);}return output;}
async function hashedEntries(filePaths,base=projectRoot){const entries=[];for(const file of filePaths.sort()){const relative=path.relative(base,file).replaceAll(path.sep,'/'),metadata=await lstat(file);if(metadata.isSymbolicLink()||!metadata.isFile())throw new Error(`operator_source_not_regular_file:${relative}`);entries.push({path:relative,mode:(metadata.mode&0o111)?'0755':'0644',sha256:hash(await readFile(file))});}return entries;}
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const operatorFiles=(await files(root,{excludeDist:true})).filter((file)=>['SOURCE — release code','TEST'].includes(classifyReleasePath(path.relative(projectRoot,file).replaceAll(path.sep,'/'))));
const sourceEntries=await hashedEntries([...operatorFiles,...CANONICAL_OPERATOR_RUNTIME_FILES.map((file)=>path.join(projectRoot,file))]);
const currentRelease=await readFile(path.join(projectRoot,'data/validation/release/current-release-manifest.json'),'utf8').then(JSON.parse).catch(()=>({}));
const releaseSource=await readFile(path.join(projectRoot,'data/validation/release/release-source-manifest.json'),'utf8').then(JSON.parse),releaseStatement=await readFile(path.join(projectRoot,'data/validation/release/release-statement.json'),'utf8').then(JSON.parse),bundle=verifyReleaseBundle({releaseSource,manifest:currentRelease,statement:releaseStatement,expectedStatementHash:process.env.VIGIA_APPROVED_RELEASE_STATEMENT_SHA256,requireExternal:Boolean(process.env.VIGIA_APPROVED_RELEASE_STATEMENT_SHA256)});
const operatorSourceHash=operatorSourceHashFromEntries(sourceEntries);
if(!currentRelease.releaseId||!currentRelease.codeStateHash||operatorSourceHash!==currentRelease.canonicalOperatorConsole?.sourceHash)throw new Error('operator_build_release_source_mismatch');
const boundaryPath='data/replay/raw/openstreetmap/portugal-thermal-context-v1/portugal-boundary.json',boundaryBytes=await readFile(path.join(projectRoot,boundaryPath)),boundaryEntry=releaseSource.entries?.find((item)=>item.path===boundaryPath);if(!boundaryEntry||boundaryBytes.length>8*1024*1024||boundaryEntry.sha256!==sha256(boundaryBytes))throw new Error('operator_boundary_release_identity_mismatch');
if (path.dirname(dist) !== root || path.basename(dist) !== 'dist') throw new Error('unsafe_operator_console_dist_path');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all([
  cp(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true }),
  cp(path.join(root, 'styles'), path.join(dist, 'styles'), { recursive: true }),
  cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true }),
  cp(path.join(root, 'index.html'), path.join(dist, 'index.html')),
]);
// Collapse the cold module waterfall while retaining content-addressed assets.
// MapLibre's module-relative worker assets stay at their vendor paths.
const bundled=await build({entryPoints:[path.join(root,'src/app.js')],outdir:path.join(dist,'bundle'),bundle:true,format:'esm',splitting:true,minify:true,target:'es2022',entryNames:'[name]-[hash]',chunkNames:'chunk-[hash]',metafile:true,plugins:[{name:'maplibre-vendor',setup(b){b.onResolve({filter:/assets\/vendor\/maplibre-gl\/maplibre-gl\.mjs$/},()=>({path:'../assets/vendor/maplibre-gl/maplibre-gl.mjs',external:true}));}}]});
const entry=Object.entries(bundled.metafile.outputs).find(([,value])=>value.entryPoint?.endsWith('src/app.js'))?.[0];
if(!entry)throw new Error('operator_bundle_entry_missing');
await atomicWriteNoFollow(path.join(dist,'index.html'),(await readFile(path.join(root,'index.html'),'utf8')).replace('./src/app.js?v=3.1.0','./'+path.relative(dist,path.resolve(entry)).replaceAll(path.sep,'/')),{root:projectRoot});
const assetEntries=await hashedEntries((await files(dist)).filter((file)=>path.basename(file)!=='build-manifest.json'),dist);
assetEntries.sort((left,right)=>left.path.localeCompare(right.path));
await atomicWriteNoFollow(path.join(dist, 'build-manifest.json'), `${JSON.stringify({
  schemaVersion: 'vigia.operator-console-build.v2',
  product: 'apps/operator-console',
  version: packageJson.version,
  entrypoint: 'index.html',
  backendContract: 'http://127.0.0.1:4177',
  syntheticRuntimeData: false,
  releaseId:currentRelease.releaseId??null,
  codeStateHash:currentRelease.codeStateHash??null,
  operationalDataHash:bundle.operationalDataHash,
  releaseStatementHash:bundle.releaseStatementHash,
  operatorSourceHash,
  assetDigest:hash(assetEntries.map((item)=>`${item.path}\0${item.sha256}`).join('\n')),
  boundary:{path:boundaryPath,sha256:boundaryEntry.sha256,bytes:boundaryBytes.length},
}, null, 2)}\n`,{root:projectRoot});
console.log(`Operator Console production build complete: ${path.relative(process.cwd(), dist)}`);
