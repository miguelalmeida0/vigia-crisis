import {readFile,readdir,writeFile} from 'node:fs/promises';
import {fetchApprovedSource} from '../apps/api/src/modules/intelligence/knowledge-sources.mjs';
const dir='data/reference/facility-intelligence/acceleration/',urls=new Set();
for(const file of (await readdir(dir)).filter(f=>f.startsWith('ac-')&&f.endsWith('.html'))){const html=await readFile(dir+file,'utf8');for(const url of html.match(/https:\/\/www\.ulsac\.min-saude\.pt\/2025\/10\/\d+\/unidade-[^"\s]+/g)??[])urls.add(url);}
for(const url of urls){const id='unit-'+url.split('/').filter(Boolean).at(-1);try{const result=await fetchApprovedSource({url,format:'HTML'});await writeFile(dir+id+'.html',result.bytes);console.log(id,url,result.status,result.bytes.length);}catch(e){console.log(id,e.message);}}
