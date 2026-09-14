import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { BlockList,isIP } from 'node:net';
import { Readable } from 'node:stream';

const blocked=new BlockList();
for(const[address,prefix]of[['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(address,prefix,'ipv4');
for(const[address,prefix]of[['::',128],['::1',128],['64:ff9b:1::',48],['100::',64],['2001:db8::',32],['fc00::',7],['fe80::',10],['ff00::',8]])blocked.addSubnet(address,prefix,'ipv6');

const isPublic=(address)=>{const value=String(address).replace(/^\[|\]$/g,''),family=isIP(value);return [4,6].includes(family)&&!value.toLowerCase().startsWith('::ffff:')&&!blocked.check(value,family===4?'ipv4':'ipv6');};
const encodedBody=(body)=>{if(body===undefined||body===null)return null;if(Buffer.isBuffer(body))return body;if(body instanceof Uint8Array)return Buffer.from(body);if(typeof body==='string'||body instanceof URLSearchParams)return Buffer.from(String(body));throw new TypeError('pinned_https_body_type_unsupported');};
const responseHeaders=(values)=>{const headers=new Headers();for(const[name,value]of Object.entries(values??{})){if(value===undefined)continue;for(const item of Array.isArray(value)?value:[value])headers.append(name,String(item));}return headers;};
export const pinnedAddressLookup=(address)=>{const pinned={address:String(address?.address??address),family:Number(address?.family??isIP(address?.address??address))};return(_hostname,options,callback)=>options?.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family);};

export function createPinnedHttpsFetch({resolveHost=(hostname)=>lookup(hostname,{all:true,verbatim:true}),requestImpl=https.request,timeoutMs=20_000,dnsCacheTtlMs=60_000,maxCachedHosts=64,clock=()=>Date.now()}={}){
  if(typeof resolveHost!=='function'||typeof requestImpl!=='function')throw new TypeError('pinned_https_transport_configuration_invalid');
  const resolvedHosts=new Map();
  const validateAddresses=(resolved)=>{const addresses=(Array.isArray(resolved)?resolved:[resolved]).map((item)=>({address:String(item?.address??item),family:Number(item?.family??isIP(item?.address??item))}));if(!addresses.length||addresses.some((item)=>![4,6].includes(item.family)||!isPublic(item.address)))throw new Error('pinned_https_destination_not_public');return addresses;};
  const pruneResolvedHosts=(now)=>{for(const[hostname,value]of resolvedHosts){if(value.expiresAt<=now&&!value.pending)resolvedHosts.delete(hostname);}while(resolvedHosts.size>Math.max(1,Number(maxCachedHosts)||64))resolvedHosts.delete(resolvedHosts.keys().next().value);};
  const addressesFor=async(hostname)=>{const now=clock(),cached=resolvedHosts.get(hostname);if(cached?.addresses&&cached.expiresAt>now)return cached.addresses;if(cached?.pending)return cached.pending;const pending=Promise.resolve().then(()=>resolveHost(hostname)).then(validateAddresses).then((addresses)=>{resolvedHosts.set(hostname,{addresses,expiresAt:clock()+Math.max(1,Number(dnsCacheTtlMs)||60_000),pending:null});pruneResolvedHosts(clock());return addresses;}).catch((error)=>{if(resolvedHosts.get(hostname)?.pending===pending)resolvedHosts.delete(hostname);throw error;});resolvedHosts.set(hostname,{addresses:null,expiresAt:now+Math.max(1,Number(dnsCacheTtlMs)||60_000),pending});pruneResolvedHosts(now);return pending;};
  const withinDeadline=(promise,signal,remainingMs)=>new Promise((resolve,reject)=>{let settled=false,timer;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener?.('abort',abort);error?reject(error):resolve(value);},abort=()=>finish(signal?.reason??new Error('pinned_https_aborted'));if(signal?.aborted)return abort();signal?.addEventListener?.('abort',abort,{once:true});timer=setTimeout(()=>finish(new Error('pinned_https_timeout')),Math.max(1,remainingMs));timer.unref?.();Promise.resolve(promise).then((value)=>finish(null,value),finish);});
  return async function pinnedHttpsFetch(input,init={}){
    const startedAt=clock();
    const target=input instanceof URL?new URL(input):new URL(String(input));
    if(target.protocol!=='https:'||target.port&&target.port!=='443'||target.username||target.password||target.hash||target.href.length>4096||target.pathname.length>3072||isIP(target.hostname))throw new Error('pinned_https_url_rejected');
    const addresses=await withinDeadline(addressesFor(target.hostname),init.signal,timeoutMs);
    const address=addresses[0],headers=Object.fromEntries(new Headers(init.headers??{}).entries()),body=encodedBody(init.body),method=String(init.method??'GET').toUpperCase();
    if(body&&!Object.hasOwn(headers,'content-length'))headers['content-length']=String(body.length);
    headers.host=target.host;
    return new Promise((resolve,reject)=>{
      let settled=false,abortRetained=false;const signal=init.signal??null,releaseAbort=()=>{if(!abortRetained)return;abortRetained=false;signal?.removeEventListener?.('abort',abort);},finish=(error,value,{retainAbort=false}={})=>{if(settled)return;settled=true;abortRetained=retainAbort;if(!retainAbort)signal?.removeEventListener?.('abort',abort);error?reject(error):resolve(value);};
      const request=requestImpl({protocol:'https:',hostname:target.hostname,port:443,path:`${target.pathname}${target.search}`,method,headers,servername:target.hostname,rejectUnauthorized:true,lookup:pinnedAddressLookup(address)},(response)=>{
        const status=Number(response.statusCode??0),stream=['HEAD'].includes(method)||[204,205,304].includes(status)?null:Readable.toWeb(response);
        response.once?.('end',releaseAbort);response.once?.('close',releaseAbort);response.once?.('error',releaseAbort);
        try{finish(null,new Response(stream,{status,statusText:String(response.statusMessage??''),headers:responseHeaders(response.headers)}),{retainAbort:true});}catch(error){response.destroy?.();finish(error);}
      });
      const abort=()=>request.destroy(signal?.reason??new Error('pinned_https_aborted'));
      if(signal?.aborted){abort();return;}signal?.addEventListener?.('abort',abort,{once:true});
      request.setTimeout?.(Math.max(1,timeoutMs-(clock()-startedAt)),()=>request.destroy(new Error('pinned_https_timeout')));
      request.once?.('error',(error)=>finish(error));
      request.end(body??undefined);
    });
  };
}
