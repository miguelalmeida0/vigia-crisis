import { fetchRaw } from '../../shared/fetch.mjs';

const PRIVATE=/^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;
export function validateTrustedEndpoint(value,{allowedHosts=[]}={}){const url=value instanceof URL?value:new URL(value);if(url.protocol!=='https:')throw new Error('provider_https_required');if(url.username||url.password)throw new Error('provider_url_credentials_rejected');if(url.port&&url.port!=='443')throw new Error('provider_nonstandard_port_rejected');if(PRIVATE.test(url.hostname))throw new Error('provider_private_host_rejected');if(!allowedHosts.includes(url.hostname))throw new Error(`provider_host_not_allowed:${url.hostname}`);return url;}
export function redactRequestIdentity(value,{secretValues=[],sensitiveQueryKeys=[]}={}){const url=new URL(value);for(const key of sensitiveQueryKeys)if(url.searchParams.has(key))url.searchParams.set(key,'REDACTED');let safe=url.toString();for(const secret of secretValues.filter(Boolean))safe=safe.replaceAll(String(secret),'REDACTED');return safe;}
export async function trustedFetch({url,allowedHosts,secretValues=[],sensitiveQueryKeys=[],headers={},accept='*/*',timeoutMs=15_000,maxBytes=8*1024*1024,fetchImpl=globalThis.fetch}={}){
  validateTrustedEndpoint(url,{allowedHosts});const started=performance.now(),requestIdentity=redactRequestIdentity(url,{secretValues,sensitiveQueryKeys});
  const response=await fetchRaw(url,{fetchImpl,timeoutMs,maxBytes,headers:{accept,...headers},maxRedirects:0,validateUrl:(candidate)=>validateTrustedEndpoint(candidate,{allowedHosts})});
  const latencyMs=Number((performance.now()-started).toFixed(3));return{...response,latencyMs,requestIdentity,retrievedAt:new Date().toISOString()};
}
