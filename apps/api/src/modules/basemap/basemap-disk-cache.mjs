import {mkdir,readFile,writeFile,rename,stat,readdir,unlink} from 'node:fs/promises';
import path from 'node:path';
export class BasemapDiskCache {
 constructor(directory,{maxEntries=1600}={}){this.directory=directory;this.maxEntries=maxEntries;this.lastPruned=0;}
 file(key){if(!/^(imagery|labels):\d+:\d+:\d+$/.test(key))throw new Error('invalid_tile_cache_key');return path.join(this.directory,key.replaceAll(':','-')+'.json');}
 async get(key){try{const file=this.file(key),info=await stat(file);if(info.size>4500000)return null;const value=JSON.parse(await readFile(file,'utf8'));if(!value.acquiredAt||!value.provider||!value.contentType)return null;return{...value,buffer:Buffer.from(value.buffer,'base64')};}catch{return null;}}
 async set(key,value){await mkdir(this.directory,{recursive:true});const file=this.file(key),temp=file+'.'+process.pid+'.tmp';await writeFile(temp,JSON.stringify({...value,buffer:value.buffer.toString('base64')}));await rename(temp,file);if(Date.now()-this.lastPruned<3600000)return;this.lastPruned=Date.now();const files=(await readdir(this.directory)).filter(f=>f.endsWith('.json'));if(files.length>this.maxEntries){const entries=await Promise.all(files.map(async name=>({name,at:(await stat(path.join(this.directory,name))).mtimeMs})));for(const entry of entries.sort((a,b)=>a.at-b.at).slice(0,files.length-this.maxEntries))await unlink(path.join(this.directory,entry.name));}}
}
