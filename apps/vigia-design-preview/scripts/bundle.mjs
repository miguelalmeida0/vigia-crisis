/**
 * Export this specific, dependency-free ESM application into one review HTML file.
 * This deliberately supports only named local imports and named function/const
 * exports used in this app. It rejects unsupported module grammar, rather than
 * pretending to be a general-purpose JavaScript bundler.
 */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export async function exportSingleFile(output=path.join(root,'preview.html')){
 const modules=new Map();
 async function collect(id){
  if(modules.has(id))return;
  let source=await readFile(path.join(root,id),'utf8');modules.set(id,'');
  const imports=[...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm)];
  for(const m of imports){if(!m[2].startsWith('.'))throw new Error('Only local imports are supported.');const dep=path.posix.normalize(path.posix.join(path.posix.dirname(id),m[2]));if(!dep.startsWith('src/'))throw new Error('Import outside src/');await collect(dep);source=source.replace(m[0],`const {${m[1].replace(/\bas\b/g,':')}} = __require(${JSON.stringify(dep)});`);}
  if(/^import\s/m.test(source))throw new Error(`Unsupported import in ${id}`);
  const exports=[...source.matchAll(/\bexport\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map(m=>m[1]);
  source=source.replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
  if(/^export\s/m.test(source))throw new Error(`Unsupported export in ${id}`);
  // Dynamic image selection in map.js is substituted with a local data-URL lookup.
  if(id==='src/ui/map.js'){
   const imageData={};for(const asset of ['national-reference.webp','local-reference.webp'])imageData[asset]='data:image/webp;base64,'+(await readFile(path.join(root,'assets',asset))).toString('base64');
   source='const __images='+JSON.stringify(imageData)+';\n'+source.replace('src="./assets/${background}"','src="${__images[background]}"');
  }
  modules.set(id,`${source}\nObject.assign(exports,{${exports.join(',')}});`);
 }
 await collect('src/app.js');
 const js=`(() => { 'use strict';\nconst __modules={${[...modules].map(([id,source])=>`${JSON.stringify(id)}:(module,exports,__require)=>{\n${source}\n}`).join(',\n')}};\nconst __cache={};function __require(id){if(__cache[id])return __cache[id].exports;const module={exports:{}};__cache[id]=module;__modules[id](module,module.exports,__require);return module.exports;}\n__require('src/app.js');\n})();`;
 let html=await readFile(path.join(root,'index.html'),'utf8');
 html=html.replace(/<link rel="stylesheet"[^>]*>/g,'').replace(/<script type="module"[^>]*><\/script>/,'');
 let css='';for(const file of ['tokens','shell','components','routes','responsive'])css+=await readFile(path.join(root,'styles',file+'.css'),'utf8');
 const favicon='data:image/svg+xml;base64,'+(await readFile(path.join(root,'assets/favicon.svg'))).toString('base64');
 html=html.replace('./assets/favicon.svg',favicon).replace('</head>',`<style>${css}</style></head>`).replace('</body>',`<script>${js.replaceAll('</script','<\\/script')}</script></body>`);
 await writeFile(output,html);console.log(`Exported ${output} (${Buffer.byteLength(html)} bytes).`);return output;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await exportSingleFile();
