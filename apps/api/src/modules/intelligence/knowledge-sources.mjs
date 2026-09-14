import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import path from 'node:path';
import { hash } from '../../../../../packages/domain/src/intelligence/world-knowledge.mjs';
import {parseFacilityDirectory} from './facility-directory-adapters.mjs';

export const APPROVED_DOMAINS=Object.freeze(['centraldecompras.cimac.pt','www.openstreetmap.org','www.ministeriopublico.pt','diap-evora.ministeriopublico.pt','prociv.gov.pt','www.ipma.pt','api.ipma.pt','api.ptdata.org','fogos.pt','firms.modaps.eosdis.nasa.gov','www.psp.pt','www.cm-evora.pt','www.cm-coimbra.pt','www.cm-leiria.pt','www.sns.gov.pt','transparencia.sns.gov.pt','dados.gov.pt','www.ulscoimbra.min-saude.pt','www.ulsrl.min-saude.pt','www.ulsac.min-saude.pt','www.ulslo.min-saude.pt','www.arsalentejo.min-saude.pt','www.bombeiroscoimbra.pt','www.gnr.pt','www.cm-castanheiradepera.pt','www.cm-viladerei.pt','bvleiria.pt','www.coimbra.pt']);
export function approvedURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.port&&u.port!=='443'||u.username||u.password||!APPROVED_DOMAINS.includes(u.hostname)||isIP(u.hostname))throw new Error('source_url_not_approved');return u;}
const publicIPv4=ip=>{const p=ip.split('.').map(Number);return isIP(ip)===4&&![0,10,127].includes(p[0])&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&p[1]===168)&&!(p[0]===100&&p[1]>=64&&p[1]<=127)&&p[0]<224;};
async function download(url,{maxBytes=2000000,timeoutMs=15000}={}){
 const u=approvedURL(url),addresses=await lookup(u.hostname,{all:true,family:4});if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw new Error('source_private_address');
 return new Promise((resolve,reject)=>{const req=https.get(u,{headers:{'user-agent':'VigiaSourceReader/1.0 (bounded public-information ingestion)','accept':'text/html,application/json,text/csv,application/geo+json,application/pdf,text/plain'},lookup:(host,options,callback)=>options?.all?callback(null,[addresses[0]]):callback(null,addresses[0].address,4)},res=>{if(res.statusCode>=300&&res.statusCode<400){res.resume();reject(new Error('source_redirect_requires_registration'));return;}let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('source_size_limit'));return;}chunks.push(chunk);});res.on('end',()=>resolve({status:res.statusCode,contentType:String(res.headers['content-type']??'').split(';')[0],bytes:Buffer.concat(chunks)}));res.on('error',reject);});req.setTimeout(timeoutMs,()=>req.destroy(new Error('source_timeout')));req.on('error',reject);});
}
export function robotsAllowed(text,url){
 const groups=[];let group={agents:[],rules:[]};for(const raw of text.split(/\r?\n/)){const line=raw.split('#')[0].trim(),colon=line.indexOf(':');if(colon<0)continue;const key=line.slice(0,colon).toLowerCase(),value=line.slice(colon+1).trim();if(key==='user-agent'){if(group.rules.length){groups.push(group);group={agents:[],rules:[]};}group.agents.push(value.toLowerCase());}else if(['allow','disallow'].includes(key)&&value)group.rules.push({allow:key==='allow',pattern:value});}groups.push(group);
 const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'vigiasourcereader'.includes(a))),active=specific.length?specific:groups.filter(g=>g.agents.includes('*')),pathname=new URL(url).pathname;
 const rules=active.flatMap(g=>g.rules).filter(r=>{const pattern=r.pattern.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');return new RegExp('^'+pattern).test(pathname);}).sort((a,b)=>b.pattern.length-a.pattern.length||Number(b.allow)-Number(a.allow));return rules[0]?.allow??true;
}
export async function fetchApprovedSource(source){
 const url=approvedURL(source.url),robots=await download(url.origin+'/robots.txt',{maxBytes:100000});
 if(robots.status!==404&&(robots.status!==200||!robots.contentType.startsWith('text/plain')||!robotsAllowed(robots.bytes.toString('utf8'),url.href)))throw new Error('source_robots_denied_or_unavailable');
 const result=await download(url.href,{maxBytes:source.adapter==='EVORA_EMERGENCY_PLAN'?20000000:source.format==='PDF'?5000000:2000000});if(result.status!==200)throw new Error('source_http_'+result.status);
 const types={HTML:['text/html'],JSON:['application/json'],CSV:['text/csv','text/plain'],GeoJSON:['application/geo+json','application/json'],PDF:['application/pdf']};
 if(!types[source.format]?.includes(result.contentType))throw new Error('source_content_type_mismatch');return{...result,retrievedAt:new Date().toISOString(),contentHash:hash(result.bytes)};
}
const htmlEntities={aacute:'á',agrave:'à',acirc:'â',atilde:'ã',eacute:'é',ecirc:'ê',iacute:'í',oacute:'ó',ocirc:'ô',otilde:'õ',uacute:'ú',uuml:'ü',ccedil:'ç',ordf:'ª',ordm:'º',ndash:'–',mdash:'—',nbsp:' ',amp:'&',quot:'"',apos:"'"};
export const plainText=value=>String(value).replace(/<(script|style)[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' ').replace(/&([a-z]+);/gi,(raw,key)=>{const v=htmlEntities[key.toLowerCase()];return v?key[0]===key[0].toUpperCase()?v.toUpperCase():v:raw;}).replace(/&#x([a-f\d]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
function csvRows(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}if(quoted)throw new Error('csv_unclosed_quote');if(cell||row.length)rows.push([...row,cell]);const header=rows.shift();if(!header||new Set(header).size!==header.length)throw new Error('csv_header_invalid');return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));}
export async function parseDocument(bytes,source,{scratchRoot=path.resolve('.tmp')}={}){
 if(bytes.length>(source.adapter==='EVORA_EMERGENCY_PLAN'?20000000:source.format==='PDF'?5000000:2000000))throw new Error('source_size_limit');let text;
 if(source.format==='PDF'){const dir=await mkdtemp(path.join(scratchRoot,'knowledge-pdf-'));try{const input=path.join(dir,'source.pdf'),output=path.join(dir,'source.txt');await writeFile(input,bytes);try{await promisify(execFile)(process.env.VIGIA_PDFTOTEXT??'pdftotext',['-layout',input,output,...(source.adapter==='EVORA_EMERGENCY_PLAN'?['registered-municipal-plan']:[])],{timeout:30000,maxBuffer:2000000});}catch(error){if(error.code!=='ENOENT'||!process.env.VIGIA_PDF_PYTHON)throw error;await promisify(execFile)(process.env.VIGIA_PDF_PYTHON,[decodeURIComponent(new URL('./pdf-text.py',import.meta.url).pathname),input,output,...(source.adapter==='EVORA_EMERGENCY_PLAN'?['registered-municipal-plan']:[])],{timeout:30000,maxBuffer:2000000});}text=await readFile(output,'utf8');}finally{await rm(dir,{recursive:true,force:true});}}
 else text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(text.length>2000000)throw new Error('document_text_limit');
 const records=[];
 if(source.adapter==='MP_CONTACT_DIRECTORY'){
  const chunks=[...text.matchAll(/<h3>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>([\s\S]*?)(?=<h3>|$)/g)];
  for(const match of chunks){const body=match[3].split('</li>')[0],name=plainText(match[2]),address=plainText(body.match(/^\s*<div>([\s\S]*?)<\/div>/)?.[1]??''),phone=plainText(body.match(/Telefone:\s*<\/span>([^<]+)/)?.[1]??''),email=plainText(body.match(/Email:\s*<\/span>([^<]+)/)?.[1]??''),coord=body.match(/[?&]q=([\d.-]+),([\d.-]+)/);if(!address)continue;records.push({id:new URL(match[1],source.url).href,canonicalName:name,canonicalType:/diap|procuradoria|ministério público|investigação.*penal/i.test(name)?'public_prosecutor':'other_public_facility',address,phone,email,website:new URL(match[1],source.url).href,coordinate:coord?[Number(coord[2]),Number(coord[1])]:null,sourceText:plainText(match[0]),sourceLocator:match[1]});}
 }else if(['CIMAC_FIRE_CONTACT','ULSAC_EMERGENCY_SERVICE','EVORA_EMERGENCY_PLAN','MUNICIPAL_CONTACT_ACCORDION','ULS_CONTACT_TABLE','ULSRL_CENTRE','ULSLO_PRIMARY_PDF','FIRE_FEDERATION_DIRECTORY','BVLEIRIA_CONTACTS','EVORA_CIVIL_PROTECTION','COIMBRA_RECEPTION_HISTORY'].includes(source.adapter)){
  records.push(...parseFacilityDirectory(text,source,plainText));if(!records.length)throw new Error('source_shape_changed');
 }else if(['JSON','CSV','GeoJSON'].includes(source.format)){
  const data=source.format==='CSV'?csvRows(text):JSON.parse(text),items=Array.isArray(data)?data:data.features??data.records??[];if(items.length>5000)throw new Error('document_record_limit');
  for(const item of items){const props=item.properties??item;records.push({...props,coordinate:item.geometry?.type==='Point'?item.geometry.coordinates:props.coordinate,sourceText:JSON.stringify(item),sourceLocator:props.id??String(records.length)});}
 }
 // Structured data retains its exact serialized passages for candidate validation.
 const normalizedText=records.length?records.map(r=>r.sourceText).join('\n\n'):source.format==='HTML'?plainText(text):text;
 return{text:normalizedText,records,rawText:text};
}
export function recordCandidates(record,source){
 const base={subjectCandidate:record.id??record.canonicalName,sourceText:record.sourceText,sourceLocator:record.sourceLocator,extractionMethod:'DETERMINISTIC_ADAPTER',validFrom:record.validFrom??null,validUntil:record.validUntil??null},out=[];
 const add=(predicate,value)=>{if(value!==null&&value!==undefined&&value!=='')out.push({...base,predicate,value});};
 add('subtype',record.subtype);
 add('canonicalName',/^Unnamed /i.test(record.canonicalName??record.name??'')?null:record.canonicalName??record.name);add('canonicalType',record.canonicalType);add('operator',record.operator);add('authority',record.authority);
 add('contact.phone',record.phone??record.contact?.phone);add('contact.email',record.email??record.contact?.email);add('contact.website',record.website??record.contact?.website);
 if(record.coordinate){add('location.geometry',{type:'Point',coordinates:record.coordinate});add('location.locationQuality',({OWNER:'VERIFIED_FACILITY_LOCATION',GOVERNMENT:'VERIFIED_FACILITY_LOCATION',MUNICIPAL:'VERIFIED_FACILITY_LOCATION',OSM:'MAP_POINT',PLACE_PROVIDER:'MAP_POINT',REVERSE_GEOCODER:'REVERSE_GEOCODED_LOCATION',GEOMETRY:'APPROXIMATE'})[source.authority]??'UNKNOWN');}
 if(typeof record.address==='string'){const postcode=record.address.match(/\b\d{4}-\d{3}\b/),street=postcode?record.address.slice(0,postcode.index).replace(/[, -]+$/,''):record.address;add('address.street',street);add('address.postcode',postcode?.[0]);add('address.locality',postcode?record.address.slice(postcode.index+8).trim():null);}
 else for(const [key,value]of Object.entries(record.address??{}))add('address.'+key,value);
 add('address.municipality',record.municipality);add('address.district',record.district);
 for(const [key,value]of Object.entries(record.capabilities??{}))add('capabilities.'+key,value);
 for(const key of ['kind','authority','historicalKind'])add('designation.'+key,record.designation?.[key]);
 for(const key of ['lastReported','observedAt'])add('activation.'+key,record.activation?.[key]);
 if(record.activation?.state)out.push({...base,predicate:'activation.state',value:record.activation.state,validFrom:record.activation.validFrom,validUntil:record.activation.validUntil});
 return out;
}
