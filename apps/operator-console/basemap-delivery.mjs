import {BasemapService} from '../api/src/modules/basemap/basemap-service.mjs';
import {createPinnedHttpsFetch} from '../api/src/shared/pinned-https-fetch.mjs';
import {fileURLToPath} from 'node:url';

// Imagery has no incident authority. Serve the same governed provider/cache in
// the admitted console process so intelligence projection CPU cannot queue tiles.
export function createBasemapDelivery({service=new BasemapService({cacheDirectory:fileURLToPath(new URL('../../.tmp/basemap-cache',import.meta.url)),fetchImpl:createPinnedHttpsFetch({timeoutMs:4500})})}={}){
 return async(req,res,pathname)=>{
  const match=pathname.match(/^\/backend\/api\/v1\/basemap\/(imagery|labels)\/(\d+)\/(\d+)\/(\d+)$/);
  if(!match||req.method!=='GET')return false;
  const started=performance.now();
  try{const [,kind,z,x,y]=match,tile=await service.tile({kind,z,x,y,clientKey:req.socket.remoteAddress??'console'});
   res.writeHead(200,{'content-type':tile.contentType,'content-length':tile.buffer.length,'cache-control':tile.state==='current'?'private, max-age=43200':'private, max-age=60','x-vigia-source-state':tile.state,'x-vigia-provider':tile.provider,'x-vigia-acquired-at':tile.acquiredAt,'x-vigia-last-good-at':tile.lastGoodAt,'x-vigia-provenance':tile.provenance,'x-content-type-options':'nosniff','server-timing':`basemap;dur=${(performance.now()-started).toFixed(1)}`});res.end(tile.buffer);
  }catch(error){res.writeHead(Number(error.statusCode)||400,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'basemap_unavailable',message:String(error.message)}));}
  return true;
 };
}
