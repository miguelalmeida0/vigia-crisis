import {exportSingleFile} from './bundle.mjs';
import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),dist=path.join(root,'dist');
// This command only replaces this isolated app's own generated dist directory.
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const item of ['index.html','assets','src','styles'])await cp(path.join(root,item),path.join(dist,item),{recursive:true});
await writeFile(path.join(dist,'BUILD_INFO.json'),JSON.stringify({name:'vigia-design-preview',version:'1.0.0',mode:'demo',liveEmergencyData:false},null,2));
console.log('Built static frontend into apps/vigia-design-preview/dist. No compilation or runtime dependencies.');

await exportSingleFile();
