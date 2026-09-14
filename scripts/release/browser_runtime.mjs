import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { chmod,cp,lstat,mkdir,mkdtemp,open,readdir,rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileNoFollow } from './safe_artifact.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const digest=(value)=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
export function publicBrowserRuntime(runtime){return{schemaVersion:runtime.schemaVersion,platform:runtime.platform,architecture:runtime.architecture,product:runtime.product,version:runtime.version,bytes:runtime.bytes,sha256:runtime.sha256,assets:runtime.assets};}
async function verifyLockedFile(file,{bytes,sha256}){const metadata=await lstat(file);if(metadata.isSymbolicLink()||!metadata.isFile()||metadata.size!==bytes)throw new Error('browser_certification_browser_file_invalid');const descriptor=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW),hash=createHash('sha256');try{const current=await descriptor.stat();if(!current.isFile()||current.size!==bytes)throw new Error('browser_certification_browser_file_changed');for await(const chunk of descriptor.createReadStream({autoClose:false}))hash.update(chunk);}finally{await descriptor.close();}if(`sha256:${hash.digest('hex')}`!==sha256)throw new Error('browser_certification_browser_lock_mismatch');}

export async function verifyBrowserRuntime({projectRoot=root,lockOverride=null}={}){
  const lockFile=path.join(projectRoot,'scripts/release/browser-certification-browser-lock.json'),lock=lockOverride??JSON.parse(await readFileNoFollow(lockFile,{root:projectRoot,encoding:'utf8',maxBytes:64*1024}));
  if(lock.schemaVersion!=='vigia.browser-certification-browser.v1'||lock.platform!==process.platform||lock.architecture!==process.arch||!path.isAbsolute(lock.executable))throw new Error('browser_certification_browser_lock_invalid');
  if(!Array.isArray(lock.assets)||!lock.assets.length||lock.assets.some((item)=>!item?.name||path.posix.normalize(item.name)!==item.name||path.isAbsolute(item.name)||item.name.split('/').includes('..')||item.name.includes('\\')))throw new Error('browser_certification_browser_assets_invalid');
  await verifyLockedFile(lock.executable,lock);for(const asset of lock.assets)await verifyLockedFile(path.join(path.dirname(lock.executable),asset.name),asset);
  return{...lock,lockFile,runtimeDigest:digest(JSON.stringify(publicBrowserRuntime(lock)))};
}

export async function materializeBrowserRuntime({projectRoot=root}={}){
  const source=await verifyBrowserRuntime({projectRoot}),temporaryRoot=path.join(projectRoot,'.tmp/browser');await mkdir(temporaryRoot,{recursive:true,mode:0o700});const snapshotRoot=await mkdtemp(path.join(temporaryRoot,'browser-runtime-')),snapshotExecutable=path.join(snapshotRoot,path.basename(source.executable));
  try{await cp(source.executable,snapshotExecutable,{force:false,errorOnExist:true,preserveTimestamps:true});for(const asset of source.assets){const destination=path.join(snapshotRoot,asset.name);await mkdir(path.dirname(destination),{recursive:true,mode:0o700});await cp(path.join(path.dirname(source.executable),asset.name),destination,{force:false,errorOnExist:true,preserveTimestamps:true});}const snapshot=await verifyBrowserRuntime({projectRoot,lockOverride:{...source,executable:snapshotExecutable}});await chmod(snapshotExecutable,0o500);for(const asset of source.assets)await chmod(path.join(snapshotRoot,asset.name),0o400);await sealDirectories(snapshotRoot);return{...snapshot,snapshotRoot,sourceRuntimeDigest:source.runtimeDigest};}catch(error){await makeDirectoriesWritable(snapshotRoot);await rm(snapshotRoot,{recursive:true,force:true});throw error;}
}

async function sealDirectories(directory){for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isDirectory())await sealDirectories(path.join(directory,entry.name));await chmod(directory,0o500);}
async function makeDirectoriesWritable(directory){const metadata=await lstat(directory).catch((error)=>error?.code==='ENOENT'?null:Promise.reject(error));if(!metadata)return;await chmod(directory,0o700);for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isDirectory())await makeDirectoriesWritable(path.join(directory,entry.name));}
export async function destroyBrowserRuntimeSnapshot(runtime){if(!runtime?.snapshotRoot)return;await makeDirectoriesWritable(runtime.snapshotRoot);await rm(runtime.snapshotRoot,{recursive:true,force:true});}
