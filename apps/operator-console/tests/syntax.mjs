import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const files=[];
function walk(dir){for(const name of readdirSync(dir)){const p=join(dir,name);const s=statSync(p);if(s.isDirectory()){if(name!=='node_modules')walk(p);}else if(/\.(m?js)$/.test(name))files.push(p)}}
walk(join(root,'src')); walk(join(root,'tests')); files.push(join(root,'server.mjs'));
for(const file of files) execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
console.log(`Syntax verification passed: ${files.length} JavaScript modules.`);
