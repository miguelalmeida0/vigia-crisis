import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJson } from '../../../shared/fetch.mjs';
import { runBoundedJsonProcess } from '../../../shared/bounded-json-process.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const PARSER=path.join(HERE,'parse_mtg_frp.py');
const FILE_PATTERN=/MTFRPPIXEL|MTG.*FRP/i;

function isoFromName(name){const match=String(name).match(/(20\d{10})/);if(!match)return null;const s=match[1];return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:00Z`;}
function normalize(row,index,observedAt,file){const lat=Number(row.latitude),lon=Number(row.longitude),frp=Number(row.frpMw);if(![lat,lon,frp].every(Number.isFinite))return null;return{id:`mtg:${file}:${index}`,coordinate:[lon,lat],observedAt:observedAt??null,frpMw:frp,frpUncertaintyMw:Number.isFinite(Number(row.uncertaintyMw))?Number(row.uncertaintyMw):null,confidence:Number.isFinite(Number(row.confidence))?Number(row.confidence):null,satellite:'MTG',instrument:'FCI',source:'LSA SAF MTG FRP Pixel',sourceKey:'MTG_FCI_FRP',nominalResolutionKm:1,sourceFamily:'mtg_fci',independenceGroup:'mtg_fci',hotspotType:0,hotspotClass:'active_fire_pixel'};}
async function newestFile(directory){if(!directory)return null;let names;try{names=await readdir(directory);}catch{return null;}const candidates=[];for(const name of names.filter((item)=>FILE_PATTERN.test(item)&&/\.nc$/i.test(item))){const full=path.join(directory,name);try{const info=await stat(full);candidates.push({full,name,mtime:info.mtimeMs});}catch{}}return candidates.sort((a,b)=>b.mtime-a.mtime)[0]??null;}
function parseFile(file){return runBoundedJsonProcess({command:'python3',args:[PARSER,file],filePath:file,timeoutMs:30_000});}
export class MtgFrpGateway{
  constructor({directory='',jsonUrl='',fetchImpl=globalThis.fetch,timeoutMs=12_000,userAgent='VIGIA/10.0',clock=()=>new Date()}={}){Object.assign(this,{directory,jsonUrl,fetchImpl,timeoutMs,userAgent,clock});}
  async snapshot(){const fetchedAt=this.clock().toISOString();if(this.jsonUrl){try{const payload=await fetchJson(this.jsonUrl,{fetchImpl:this.fetchImpl,timeoutMs:this.timeoutMs,userAgent:this.userAgent});const observedAt=payload.observedAt??payload.generatedAt??null;const rows=payload.detections??payload.features??[];const data=rows.map((row,index)=>normalize(row,index,observedAt,'remote')).filter(Boolean);return this.#result(data,fetchedAt,observedAt,'current',null,'json_gateway');}catch(error){return this.#result([],fetchedAt,null,'unavailable',String(error.message??error),'json_gateway');}}
    const file=await newestFile(this.directory);if(!file)return this.#result([],fetchedAt,null,'not_configured',this.directory?'No MTG FRP NetCDF files found.':'Set VIGIA_MTG_FRP_DIR to an EUMETCast/LSA SAF MTFRPPIXEL directory, or VIGIA_MTG_FRP_JSON_URL.','netcdf_drop');
    const parsed=await parseFile(file.full);if(!parsed.ok)return this.#result([],fetchedAt,null,'unavailable',parsed.error,'netcdf_drop');const observedAt=parsed.observedAt??isoFromName(file.name);const data=(parsed.detections??[]).map((row,index)=>normalize(row,index,observedAt,file.name)).filter(Boolean);return this.#result(data,fetchedAt,observedAt,'current',null,'netcdf_drop');}
  #result(data,fetchedAt,upstreamAt,state,error,mode){const configured=Boolean(this.directory||this.jsonUrl);return{data,state:{id:'mtgPixels',label:'MTG FCI FRP Pixel',provider:'EUMETSAT / LSA SAF',state,fetchedAt,upstreamAt,error,origin:'EUMETSAT / LSA SAF MTFRPPIXEL',mode,pointLevel:true,evidenceRole:'independent physical point evidence',cadenceMinutes:10,nominalResolutionKm:1,productStatus:'demonstration_nrt',configurationState:configured?'configured':'registered_data_drop_or_gateway_required',accessClassification:state==='current'?'LIVE_ACCESSIBLE':'CREDENTIAL_BLOCKED',parserState:'ready',accepted:data.length,rejected:0,nextExpectedOpportunity:state==='current'&&upstreamAt?new Date(Date.parse(upstreamAt)+10*60_000).toISOString():null}};}
}
