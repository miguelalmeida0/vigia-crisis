import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex').slice(0,16);
export function normalizePublicPhone(raw){const match=String(raw??'').match(/(?<!\d)(?:(?:\+|00)351[ -]*)?[29](?:[ -]*\d){8}(?!\d)/);if(!match)return null;const digits=match[0].replace(/\D/g,'').replace(/^00351/,'351');return '+'+(digits.length===9?'351':'')+digits;}
const email=s=>String(s??'').match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase()??null;
export function parseFacilityDirectory(text,source,plainText){
 const records=[],seen=new Set();
 if(source.adapter==='CIMAC_FIRE_CONTACT'){
  const body=plainText(text),identity='Associação Humanitária dos Bombeiros Voluntários de Évora';
  const phone=text.match(/class="fa fa-phone"[^>]*>\s*([\d ]+)</)?.[1],mail=text.match(/href="mailto:([^"]+)"/)?.[1];
  if(!body.includes(identity)||!normalizePublicPhone(phone)||mail!=='secretaria@ahbvevora.pt')throw new Error('fire_contact_passage_missing');
  const start=body.indexOf('Contactos');return [{id:'osm:way:481130645',phone:normalizePublicPhone(phone),email:mail,sourceText:body.slice(start,start+350),sourceLocator:'Entity 29 / Contactos'}];
 }
 if(source.adapter==='ULSAC_EMERGENCY_SERVICE'){
  const body=plainText(text),section=body.slice(body.indexOf('Áreas Clínicas',body.indexOf('Close Menu')));
  if(!body.includes('Hospital do Espírito Santo de Évora')||!section.includes('Urgência Polivalente'))throw new Error('health_capability_passage_missing');
  const start=section.indexOf('URGÊNCIA'),passage=section.slice(start,start+400);
  return [{id:'osm:relation:13478475',canonicalName:'Hospital do Espírito Santo de Évora',capabilities:{emergencyDepartment:true},authority:source.provider,sourceText:passage,sourceLocator:'Clinical areas / URGÊNCIA; hospital identity linked in official hospital navigation',subtype:'hospital_emergency_service'}];
 }
 if(source.adapter==='EVORA_EMERGENCY_PLAN'){
  const pages=text.split('\f'),dms=(d,m,s)=>Number(d)+Number(m)/60+Number(s)/3600;
  for(const [pageIndex,page] of pages.entries()){
   if(page.includes('Quadro 19:')&&page.includes('Desenvolver ações de combate a incêndios')){
    const start=page.indexOf('Quadro 19:');records.push({id:'osm:way:481130645',canonicalName:'Bombeiros Voluntários de Évora',subtype:'fire_corporation',capabilities:{fireResponse:true},authority:source.provider,sourceText:page.slice(start,start+1800),sourceLocator:'PDF page '+(pageIndex+1)+' / Quadro 19'});
   }
   if(!/Quadro (72|73):/.test(page)||!page.includes('N 38°'))continue;
   const section=page.slice(page.indexOf('(WGS84)')+7);
   for(const m of section.matchAll(/(?:^|\n)\s*(\d+)\s+([\s\S]*?)N\s*(\d+)°\s*(\d+)[’']([\d.]+)[”"]\s*W\s*(\d+)°\s*(\d+)[’']([\d.]+)[”"]/g)){
    const body=m[2].replace(/\s+/g,' ').trim(),split=body.search(/\b(?:Praça|Rua|Av\.|Avenida|Estrada|Caminha|Caminho|Largo)(?=\s)/),name=split>0?body.slice(0,split).trim():null;if(!name)continue;
    const address=body.slice(split).split(/\bUF\b/)[0].trim();records.push({id:source.url+'#zcap-'+m[1],canonicalName:name,canonicalType:'temporary_reception_center',subtype:/Escola/.test(name)?'school':'municipal_building',address:{street:address,municipality:'Évora'},coordinate:[-dms(m[6],m[7],m[8]),dms(m[3],m[4],m[5])],designation:{kind:'RECEPTION_CENTER',authority:source.provider},sourceText:m[0],sourceLocator:'PDF page '+(pageIndex+1)+' / ZCAP '+m[1],authority:source.provider});
   }
  }
  return records;
 }
 const add=(name,address,contact,passage,locator,type=source.facilityType??'health_center')=>{
  if(!name||!address||!(/\b\d{4}-\d{3}\b/.test(address)))return;
  const key=name+'|'+address;if(seen.has(key))return;seen.add(key);
  records.push({id:source.url+'#facility-'+digest(key),canonicalName:name,canonicalType:type,address,
   phone:normalizePublicPhone(contact),email:email(contact),website:source.url,operator:source.provider,authority:source.provider,
   municipality:source.municipality,sourceText:passage,sourceLocator:locator,rawContact:contact});
 };
 if(source.adapter==='MUNICIPAL_CONTACT_ACCORDION'){
  for(const [i,block]of text.split(/<div class="cont-002-bar\b/).slice(1).entries()){
   const name=plainText(block.match(/<div class="inner Body_2PrimaryNeutralLeft">([\s\S]*?)<\/div>/)?.[1]??'').replace(/\u200b/g,'').trim();
   const type=/^Hospital\b/i.test(name)?'hospital':/^Centro de Sa[úu]de\b/i.test(name)?'health_center':/^(?:GNR|PSP|Pol[íi]cia)\b/i.test(name)?'police_station':/^Bombeiros\b/i.test(name)?'fire_station':null;
   if(!type)continue;
   const address=plainText(block.match(/<div class="content Body_2PrimaryNeutralLeft">([\s\S]*?)<\/div>/)?.[1]??''),phone=normalizePublicPhone(block.match(/href="tel:([^"]+)"/)?.[1]),point=block.match(/google\.com\/maps\/place\/([\d.-]+),\s*([\d.-]+)/);
   if(!address||!phone)continue;
   records.push({id:source.url+'#facility-'+digest(name+'|'+address),canonicalName:name,canonicalType:type,address,phone,municipality:source.municipality,authority:source.provider,website:source.url,...(point?{coordinate:[Number(point[2]),Number(point[1])]}:{}),sourceText:plainText(block),sourceLocator:'contact-section:'+i,rawContact:block.match(/href="tel:([^"]+)"/)?.[1]});
  }
 }else if(source.adapter==='COIMBRA_RECEPTION_HISTORY'){
  const body=plainText(text),start=body.indexOf('Às 04h30'),end=body.indexOf('A retirada preventiva',start),passage=body.slice(start,end>start?end:start+1000);
  for(const [name,type] of [['Escola Básica 2/3 de Taveiro','school'],['Escola Básica 2/3 Inês de Castro','school'],['Pavilhão Municipal Multidesportos Mário Mexia','municipal_building'],['Zona de Concentração e Apoio à População (ZCAP) de Ceira','temporary_reception_center']]){
   if(!passage.includes(name))continue;records.push({id:source.url+'#facility-'+digest(name),canonicalName:name,canonicalType:type,municipality:'Coimbra',authority:source.provider,website:source.url,designation:{historicalKind:'RECEPTION_CENTER'},activation:{lastReported:'ACTIVATED',observedAt:'2026-02-11T04:30:00Z'},sourceText:passage,sourceLocator:'municipal-report-2026-02-11'});
  }
 }else if(source.adapter==='FIRE_FEDERATION_DIRECTORY'){
  const body=plainText(text);for(const [i,m] of [...body.matchAll(/((?:COMPANHIA DE BOMBEIROS|BOMBEIROS (?:SAPADORES|MUNICIPAIS)|ASSOCIAÇÃO HUMANITÁRIA)[\s\S]*?) ANO DE FUNDA(?:ÇÃO|CAO)\s*:\s*\d{4} MORADA:\s*(.*?) CONTACTO:\s*(.*?) SITE:\s*(\S+)/g)].entries()){
   add(m[1].trim(),m[2].replace(/\u200b/g,''),m[3],m[0],'federation-contact:'+i,'fire_station');const r=records.at(-1);if(r?.sourceLocator==='federation-contact:'+i){r.operator=m[1].trim();r.authority=null;r.website=m[4].startsWith('http')?m[4]:'https://'+m[4];}
  }
 }else if(source.adapter==='BVLEIRIA_CONTACTS'){
  const body=plainText(text);for(const [i,m] of [...body.matchAll(/(Quartel .*?) Morada (.*?) Telefone (.*?) Email (\S+@\S+)/g)].entries())add('Bombeiros Voluntários de Leiria · '+m[1],m[2],m[3]+' '+m[4],m[0],'brigade-contact:'+i,'fire_station');
 }else if(source.adapter==='EVORA_CIVIL_PROTECTION'){
  const body=plainText(text),m=body.match(/Aeródromo Municipal de Évora[\s\S]{0,500}?7005-210\s*ÉVORA/i),phone=body.match(/266\s*777\s*127/),mail=body.match(/smpc\.evora@cm-evora\.pt/);
  if(m&&phone&&mail)add('Serviço Municipal de Proteção Civil de Évora',m[0],phone[0]+' '+mail[0],body.slice(Math.max(0,body.indexOf(m[0])-150),Math.min(body.length,body.indexOf(m[0])+1500)),'civil-protection-contact','civil_protection');
 }else if(source.adapter==='ULS_CONTACT_TABLE'){
  for(const [i,row] of [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].entries()){
   const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plainText(c[1]));
   if(cells.length<3)continue;
   const addressIndex=cells.findIndex((c,j)=>j>0&&/\b\d{4}-\d{3}\b/.test(c));if(addressIndex<1)continue;
   add(cells[0],cells[addressIndex],cells.filter((_,j)=>j>0&&j!==addressIndex&&j!==cells.length-1).join(' '),plainText(row[0]),'table-row:'+i);
   // Coimbra hospital tables end with address; include phone and email but not fax.
   const last=records.at(-1);if(last&&last.sourceLocator==='table-row:'+i&&source.facilityType==='hospital'){last.phone=normalizePublicPhone(cells[1]);last.email=email(cells[3]);}
  }
 }else if(source.adapter==='ULSRL_CENTRE'){
  const body=plainText(text),match=body.match(/(Centro de Saúde[^:]{1,100}) Morada:\s*(.*?) Telefone:\s*(.*?) Email:\s*(\S+@\S+)/);
  if(match)add('Centro de Saúde '+match[1].split('Centro de Saúde').at(-1).trimStart(),match[2],match[3]+' '+match[4],match[0],'published-centre-contact');
 }else if(source.adapter==='ULSLO_PRIMARY_PDF'){
  const lines=text.split('\n');for(let i=0;i<lines.length;i++){
   const line=lines[i];if(!/^\s*(Cascais|Lisboa|Oeiras)\s+(USF|UCSP)\b/.test(line))continue;
   const municipality=line.trim().split(/\s+/)[0],phone=line.match(/\b2\d{8}\b/),post=line.match(/\b\d{4}-\d{3}\b/);if(!phone||!post)continue;
   const name=line.slice(line.indexOf(municipality)+municipality.length,phone.index).trim(),chunks=line.slice(0,post.index).split(/\s{2,}/).filter(Boolean),address=chunks.at(-1)+' '+line.slice(post.index).trim();
   add(name,address,line.slice(phone.index,post.index),line,'pdf-line:'+(i+1));const last=records.at(-1);if(last?.sourceLocator==='pdf-line:'+(i+1))last.municipality=municipality;
  }
 }
 return records;
}
