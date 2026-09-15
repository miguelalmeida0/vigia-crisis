import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserHashAdapter} from './browser-build.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..'),out=resolve(here,'dist');
await mkdir(out,{recursive:true});
const transportBoundary={name:'no-operational-transport',setup(builder){
 builder.onResolve({filter:/vigiaApi\.js(?:\?.*)?$/},()=>({path:resolve(here,'unavailable-api.mjs')}));
 builder.onLoad({filter:/mapModel\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replaceAll('same-origin:/backend/api/v1/basemap','retained-boundary:synthetic-scenario'),loader:'js',resolveDir:dirname(args.path)}));
}};
const result=await build({entryPoints:[resolve(here,'console.mjs')],outfile:resolve(out,'demo.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,sourcemap:false,metafile:true,plugins:[browserHashAdapter(),transportBoundary]});
let html=await readFile(resolve(root,'apps/operator-console/index.html'),'utf8');
const css=[];
for(const match of html.matchAll(/href="\.\/(.*?)"/g)){
 const path=match[1].split('?')[0];
 if(!path.endsWith('.css'))throw new Error('Unexpected asset');
 css.push(await readFile(resolve(root,'apps/operator-console',path),'utf8'));
}
css.push(await readFile(resolve(here,'demo.css'),'utf8'));
await writeFile(resolve(out,'demo.css'),css.join('\n'));
html=html.replace(/  <link[^>]+>\n/g,'').replace('</head>','  <link rel="stylesheet" href="./demo.css" />\n</head>').replace('./src/app.js?v=3.1.0','./demo.js').replace('VIGIA — Operator Command','VIGIA — Synthetic Portfolio Scenario');
await writeFile(resolve(out,'index.html'),html);
for(const file of ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs'])await copyFile(resolve(root,'apps/operator-console/assets/vendor/maplibre-gl',file),resolve(out,file));
await writeFile(resolve(out,'_headers'),"/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n");
await writeFile(resolve(here,'build-inputs.json'),JSON.stringify(Object.keys(result.metafile.inputs),null,2));
console.log('Static portfolio artifact:',out);
