import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,rm,symlink,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteNoFollow,readFileNoFollow } from '../../../scripts/release/safe_artifact.mjs';

const projectRoot=fileURLToPath(new URL('../../..',import.meta.url)),scratchRoot=path.join(projectRoot,'.tmp/tests');
test('release artifact publication replaces final symlinks without following them and rejects linked parents',async()=>{await mkdir(scratchRoot,{recursive:true});const root=await mkdtemp(path.join(scratchRoot,'safe-artifact-')),outside=path.join(root,'outside.txt'),artifact=path.join(root,'evidence.json');try{await writeFile(outside,'do-not-overwrite');await symlink(outside,artifact);await atomicWriteNoFollow(artifact,'certified',{root});assert.equal(await readFile(outside,'utf8'),'do-not-overwrite');assert.equal(await readFileNoFollow(artifact,{root,encoding:'utf8'}),'certified');const real=path.join(root,'real');await mkdir(real);await symlink(real,path.join(root,'linked-parent'));await assert.rejects(()=>atomicWriteNoFollow(path.join(root,'linked-parent','escape.txt'),'blocked',{root}),/directory_invalid/);}finally{await rm(root,{recursive:true,force:true});}});
