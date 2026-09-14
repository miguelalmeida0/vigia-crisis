import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
async function walk(dir){const out=[];for(const item of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const files=(await Promise.all(['src','scripts','tests'].map(x=>walk(path.join(root,x))))).flat().filter(x=>/\.(mjs|js)$/.test(x));
let fail=0;for(const f of files){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr);fail++;}}
for(const f of files.filter(x=>x.includes('/src/'))){const t=await readFile(f,'utf8');for(const m of t.matchAll(/from\s+['"]([^'"]+)['"]/g)){if(m[1].startsWith('.'))try{await readFile(path.resolve(path.dirname(f),m[1]));}catch{console.error(`Missing import ${m[1]} in ${f}`);fail++;}}}
console.log(`${files.length} JavaScript modules checked; ${fail} failures.`);process.exitCode=fail?1:0;
