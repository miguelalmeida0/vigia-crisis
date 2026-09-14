import { verifyOperatorProxyBody, verifyOperatorProxyEnvelope } from '../../../../packages/domain/src/operator-proxy/request-auth.mjs';

const assertionHeaders = [
  'x-vigia-operator-key-id', 'x-vigia-operator-release-id', 'x-vigia-operator-timestamp',
  'x-vigia-operator-nonce', 'x-vigia-operator-body-sha256',
  'x-vigia-operator-signature',
];

async function collect(req, { limitBytes, timeoutMs }) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > limitBytes) throw Object.assign(new Error('request_body_too_large'), { statusCode:413 });
  const chunks=[]; let total=0, timer;
  const timeout = new Promise((_,reject)=>{timer=setTimeout(()=>{const error=Object.assign(new Error('request_body_timeout'),{statusCode:408});req.destroy?.(error);reject(error);},timeoutMs);});
  const body = (async()=>{
    for await (const chunk of req) {
      total+=chunk.length;
      if(total>limitBytes)throw Object.assign(new Error('request_body_too_large'),{statusCode:413});
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks,total);
  })();
  try{return await Promise.race([body,timeout]);}finally{clearTimeout(timer);}
}

export function createOperatorProxyAuthenticator({ key, releaseId, now=()=>Date.now(), maximumAgeMs=60_000, maxBodyBytes=2_000_000, maxNonces=2048 }={}) {
  const usedNonces=new Map();
  return async function authenticateOperatorProxyRequest(req) {
    const hasAssertion=assertionHeaders.some((name)=>req.headers?.[name]!==undefined);
    if(!hasAssertion)return null;
    const current=now();
    for(const[nonce,expiresAt]of usedNonces)if(expiresAt<current)usedNonces.delete(nonce);
    const claim=verifyOperatorProxyEnvelope({headers:req.headers,key,method:req.method,path:req.url,releaseId,now:current,maximumAgeMs});
    const replayKey=`${claim.keyId}:${claim.nonce}`;
    if(usedNonces.has(replayKey))throw Object.assign(new Error('operator_proxy_replayed'),{statusCode:401});
    if(usedNonces.size>=maxNonces)throw Object.assign(new Error('operator_proxy_replay_capacity_reached'),{statusCode:503});
    usedNonces.set(replayKey,claim.expiresAt);
    const declaredLength=Number(req.headers?.['content-length']??0),hasTransferEncoding=Boolean(req.headers?.['transfer-encoding']),bodylessRead=['GET','HEAD'].includes(String(req.method).toUpperCase())&&!hasTransferEncoding&&(!Number.isFinite(declaredLength)||declaredLength===0);
    const body=bodylessRead?Buffer.alloc(0):await collect(req,{limitBytes:maxBodyBytes,timeoutMs:10_000});
    verifyOperatorProxyBody(claim,body);
    req.vigiaRawBody=body;
    req.vigiaOperatorProxyAssertion=claim;
    return claim;
  };
}

export function operatorProxyPublicFailure(error) {
  const status=Number(error?.statusCode);
  if(status===401)return{status,code:'operator_proxy_authentication_rejected'};
  if(status===408)return{status,code:'request_body_timeout'};
  if(status===413)return{status,code:'request_body_too_large'};
  if(status===503)return{status,code:'operator_proxy_capacity_unavailable'};
  return null;
}
