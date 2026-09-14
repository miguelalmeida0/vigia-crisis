import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const exec=promisify(execFile);

test('MTG parser rejects variable-length HDF5 datasets before decoding and pins address space',async(t)=>{
  const root=path.resolve('.tmp/test');await mkdir(root,{recursive:true});const directory=await mkdtemp(path.join(root,'vigia-mtg-parser-'));t.after(()=>rm(directory,{recursive:true,force:true}));const product=path.join(directory,'MTFRPPIXEL-hostile.nc'),python=path.resolve('.venv/bin/python'),parser=path.resolve('apps/api/src/modules/world/mtg/parse_mtg_frp.py'),make=`import h5py,sys\nwith h5py.File(sys.argv[1],'w') as f:\n d=h5py.string_dtype(encoding='utf-8')\n f.create_dataset('latitude',data=['40'],dtype=d)\n f.create_dataset('longitude',data=['-8'],dtype=d)\n f.create_dataset('fire_radiative_power',data=['25'],dtype=d)`;
  await exec(python,['-c',make,product]);const {stdout}=await exec(python,[parser,product]),parsed=JSON.parse(stdout);assert.equal(parsed.ok,false);assert.equal(parsed.error,'unsafe_dataset_dtype');const source=await readFile(parser,'utf8');assert.match(source,/RLIMIT_AS/);assert.match(source,/MAX_DECODED_BYTES/);
});
