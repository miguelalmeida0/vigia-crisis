import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp,mkdir,rm,symlink,writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createEvidenceSourceManifest,restoreEvidenceArchive } from '../../../scripts/operations/archive-integrity.mjs';

const run=promisify(execFile);
async function fixture(t,name){const root=await mkdtemp(path.join(os.tmpdir(),`vigia-archive-${name}-`));t.after(()=>rm(root,{recursive:true,force:true}));const source=path.join(root,'data/source');await mkdir(path.join(source,'nested'),{recursive:true});await writeFile(path.join(source,'nested/evidence.json'),'exact evidence\n',{mode:0o640});return{root,source,archive:path.join(root,'evidence.tar')};}
async function createTar(root,archive,input){await run('tar',['-cf',archive,'-C',root,input],{env:{...process.env,COPYFILE_DISABLE:'1'}});}

test('evidence archive restore requires exact path, mode, byte length and digest fidelity',async(t)=>{
  const{root,archive}=await fixture(t,'exact'),expected=await createEvidenceSourceManifest({root,inputPaths:['data/source']});await createTar(root,archive,'data/source');const destination=path.join(root,'restored');await mkdir(destination,{mode:0o700});const result=await restoreEvidenceArchive({archivePath:archive,destination,expectedManifest:expected});assert.equal(result.state,'PASS');assert.equal(result.restoredFiles,expected.files);assert.equal(result.restoredBytes,expected.bytes);assert.equal(result.sourceManifestDigest,expected.manifestDigest);assert.equal(result.restoredManifestDigest,expected.manifestDigest);
});

test('a different nonempty tar cannot satisfy the evidence restore gate',async(t)=>{
  const{root,archive}=await fixture(t,'substitute'),expected=await createEvidenceSourceManifest({root,inputPaths:['data/source']});await mkdir(path.join(root,'substitute'),{recursive:true});await writeFile(path.join(root,'substitute/not-evidence.txt'),'different\n');await createTar(root,archive,'substitute');const destination=path.join(root,'restored');await mkdir(destination,{mode:0o700});await assert.rejects(()=>restoreEvidenceArchive({archivePath:archive,destination,expectedManifest:expected}),/archive_restore_unexpected_(directory|file)/);
});

test('links and other non-regular archive entries are rejected before recovery can pass',async(t)=>{
  const{root,source,archive}=await fixture(t,'link'),expected=await createEvidenceSourceManifest({root,inputPaths:['data/source']});await symlink('nested/evidence.json',path.join(source,'linked-evidence'));await createTar(root,archive,'data/source');const destination=path.join(root,'restored');await mkdir(destination,{mode:0o700});await assert.rejects(()=>restoreEvidenceArchive({archivePath:archive,destination,expectedManifest:expected}),/archive_restore_unsafe_entry_type/);
});
