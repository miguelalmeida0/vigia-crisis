import {readFile,readdir,writeFile} from 'node:fs/promises';
import {parseDocument} from '../apps/api/src/modules/intelligence/knowledge-sources.mjs';
const dir='data/reference/facility-intelligence/acceleration/',sources=[];
const register=(file,url,provider,adapter,extra={})=>sources.push({file,url,provider,authority:'OWNER',format:file.endsWith('.pdf')?'PDF':'HTML',adapter,category:'FACILITY_DIRECTORY',pollIntervalMs:7*86400000,watch:true,...extra});
register('evora-public-contacts.html','https://www.cm-evora.pt/municipe/agenda-e-noticias/contactos-uteis/','Câmara Municipal de Évora','MUNICIPAL_CONTACT_ACCORDION',{municipality:'Évora',authority:'MUNICIPAL'});
register('coimbra-hospitals.html','https://www.ulscoimbra.min-saude.pt/contactos/contactos-gerais-do-chuc/','ULS de Coimbra','ULS_CONTACT_TABLE',{municipality:'Coimbra',facilityType:'hospital'});
register('lisboa-health.pdf','https://www.ulslo.min-saude.pt/attachments/article/461/Contactos%20Cuidados%20de%20Sa%C3%BAde%20Prim%C3%A1rios.pdf','ULS Lisboa Ocidental','ULSLO_PRIMARY_PDF');
register('coimbra-fire.html','https://www.bombeiroscoimbra.pt/federadas','Federação de Bombeiros do Distrito de Coimbra','FIRE_FEDERATION_DIRECTORY',{authority:'PLACE_PROVIDER',category:'SECTOR_MEMBERSHIP_DIRECTORY',facilityType:'fire_station'});
register('leiria-fire.html','https://bvleiria.pt/contactos/','Bombeiros Voluntários de Leiria','BVLEIRIA_CONTACTS',{municipality:'Leiria',facilityType:'fire_station'});
register('evora-civil.html','https://www.cm-evora.pt/municipe/areas-de-acao/protecao-civil/a-protecao-civil/','Câmara Municipal de Évora','EVORA_CIVIL_PROTECTION',{municipality:'Évora',category:'CIVIL_PROTECTION_CONTACT',facilityType:'civil_protection'});
register('coimbra-reception.html','https://www.coimbra.pt/2026/02/160-pessoas-acolhidas-durante-a-noite-nas-zonas-de-apoio-ativadas-em-coimbra/','Câmara Municipal de Coimbra','COIMBRA_RECEPTION_HISTORY',{authority:'MUNICIPAL',municipality:'Coimbra',category:'HISTORICAL_RECEPTION_NOTICE',publishedAt:'2026-02-11T00:00:00Z',watch:false,reviewed:true});
const log=await readFile('.tmp/acceleration/unit-acquisition.log','utf8');
for(const line of log.split('\n')){const match=line.match(/^(unit-\S+) (https:\/\/\S+) 200/);if(match)register(match[1]+'.html',match[2],'ULS do Alentejo Central','ULS_CONTACT_TABLE');}
for(const file of (await readdir(dir)).filter(f=>f.startsWith('lr-'))){const slug=file.slice(3,-5);register(file,'https://www.ulsrl.min-saude.pt/cuidados-saude-primarios/'+slug+'/','ULS da Região de Leiria','ULSRL_CENTRE');}
const reviews=[];
for(const source of sources){try{const bytes=await readFile(dir+source.file),parsed=await parseDocument(bytes,source);reviews.push({source,records:parsed.records});console.log(source.file,parsed.records.length);}catch(e){reviews.push({source,error:e.message,records:[]});console.log(source.file,e.message);}}
await writeFile(dir+'directory-review.json',JSON.stringify({sources:reviews,total:reviews.reduce((n,r)=>n+r.records.length,0)},null,2));
