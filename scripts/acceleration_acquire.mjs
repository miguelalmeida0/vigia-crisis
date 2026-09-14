import {fetchApprovedSource} from '../apps/api/src/modules/intelligence/knowledge-sources.mjs';
import {writeFile,readFile} from 'node:fs/promises';
const links=[];
for(const [file,pattern,prefix] of [["leiria-primary",/https:\/\/www\.ulsrl\.min-saude\.pt\/cuidados-saude-primarios\/centro-saude-[^\"]+/g,"lr"],["alentejo-contacts",/https:\/\/www\.ulsac\.min-saude\.pt\/2025\/10\/30\/[^\"]+/g,"ac"]]){const text=await readFile("data/reference/facility-intelligence/acceleration/"+file+".html","utf8");for(const url of new Set(text.match(pattern)??[]))links.push([prefix+"-"+url.split("/").filter(Boolean).at(-1),url]);}
for(const [id,url] of links)try{const r=await fetchApprovedSource({url,format:"HTML"});await writeFile("data/reference/facility-intelligence/acceleration/"+id+".html",r.bytes);console.log(id,url,r.status,r.bytes.length);}catch(e){console.log(id,e.message);}
