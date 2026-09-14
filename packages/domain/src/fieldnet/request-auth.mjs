import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonical, sha256 } from './contracts.mjs';

const lowerHeaders = (headers = {}) => Object.fromEntries((typeof headers?.entries==='function'?[...headers.entries()]:Object.entries(headers)).map(([key,value]) => [key.toLowerCase(), String(value)]));
const safeEqual = (left, right) => { const a=Buffer.from(String(left??'')),b=Buffer.from(String(right??''));return a.length>0&&a.length===b.length&&timingSafeEqual(a,b); };
const material = ({ method, path, keyId, timestamp, nonce, bodyHash }) => [String(method).toUpperCase(), path, keyId, timestamp, nonce, bodyHash].join('\n');
const responseMaterial=({keyId,requestNonce,requestBodyHash,responseBodyHash})=>['FIELDNET_RESPONSE_V1',keyId,requestNonce,requestBodyHash,responseBodyHash].join('\n');

export function signFieldRequest({ method, path, keyId, key, body = null, now = new Date(), nonce = randomBytes(18).toString('base64url') }) {
  if (!keyId || !key) throw new Error('fieldnet_signing_key_required');
  const timestamp = now.toISOString(),bodyHash=sha256(canonical(body));
  const signature=createHmac('sha256',key).update(material({method,path,keyId,timestamp,nonce,bodyHash})).digest('base64url');
  return { 'x-vigia-field-key-id':keyId, 'x-vigia-field-timestamp':timestamp, 'x-vigia-field-nonce':nonce, 'x-vigia-field-body-sha256':bodyHash, 'x-vigia-field-signature':signature };
}

export function signFieldResponse({keyId,key,requestNonce,requestBodyHash,body}){
  if(!keyId||!key||!requestNonce||!/^sha256:[a-f0-9]{64}$/.test(requestBodyHash??''))throw new Error('fieldnet_response_signing_material_required');
  const responseBodyHash=sha256(canonical(body)),signature=createHmac('sha256',key).update(responseMaterial({keyId,requestNonce,requestBodyHash,responseBodyHash})).digest('base64url');
  return{'x-vigia-field-response-key-id':keyId,'x-vigia-field-response-request-nonce':requestNonce,'x-vigia-field-response-request-sha256':requestBodyHash,'x-vigia-field-response-body-sha256':responseBodyHash,'x-vigia-field-response-signature':signature};
}

export function verifyFieldResponse({keyId,key,requestNonce,requestBodyHash,body,headers}){
  const h=lowerHeaders(headers),responseBodyHash=sha256(canonical(body)),expected=createHmac('sha256',key).update(responseMaterial({keyId,requestNonce,requestBodyHash,responseBodyHash})).digest('base64url');
  if(h['x-vigia-field-response-key-id']!==keyId||h['x-vigia-field-response-request-nonce']!==requestNonce||h['x-vigia-field-response-request-sha256']!==requestBodyHash||h['x-vigia-field-response-body-sha256']!==responseBodyHash||!safeEqual(h['x-vigia-field-response-signature'],expected))throw Object.assign(new Error('fieldnet_central_response_authentication_failed'),{statusCode:502});
  return{authenticated:true,keyId,requestNonce,requestBodyHash,responseBodyHash};
}

export class FieldRequestVerifier {
  constructor({ keyFor, clock=()=>new Date(), maxSkewMs=120_000, maxNonces=10_000 }={}) { if(typeof keyFor!=='function')throw new Error('fieldnet_key_registry_required');Object.assign(this,{keyFor,clock,maxSkewMs,maxNonces});this.nonces=new Map(); }
  verifyEnvelope({ method, path, headers }) {
    const h=lowerHeaders(headers),keyId=h['x-vigia-field-key-id'],timestamp=h['x-vigia-field-timestamp'],nonce=h['x-vigia-field-nonce'],bodyHash=h['x-vigia-field-body-sha256'],presented=h['x-vigia-field-signature'];
    const key=this.keyFor(keyId);if(!keyId||!key)throw Object.assign(new Error('fieldnet_unknown_signing_principal'),{statusCode:401});
    const at=Date.parse(timestamp??'');if(!Number.isFinite(at)||Math.abs(this.clock().getTime()-at)>this.maxSkewMs)throw Object.assign(new Error('fieldnet_signature_timestamp_rejected'),{statusCode:401});
    if(!/^sha256:[a-f0-9]{64}$/.test(bodyHash??''))throw Object.assign(new Error('fieldnet_body_hash_rejected'),{statusCode:401});
    const expected=createHmac('sha256',key).update(material({method,path,keyId,timestamp,nonce,bodyHash})).digest('base64url');
    if(!nonce||!safeEqual(presented,expected))throw Object.assign(new Error('fieldnet_signature_rejected'),{statusCode:401});
    const replayKey=`${keyId}:${nonce}`;if(this.nonces.has(replayKey))throw Object.assign(new Error('fieldnet_nonce_replayed'),{statusCode:409});
    this.nonces.set(replayKey,at);while(this.nonces.size>this.maxNonces)this.nonces.delete(this.nonces.keys().next().value);
    return { keyId, authenticated:true, mode:'fieldnet_hmac_sha256', signedAt:new Date(at).toISOString(), requestNonce:nonce, expectedBodyHash:bodyHash };
  }
  verifyBody({ envelope, body=null }) {
    if(!envelope?.authenticated||!envelope.expectedBodyHash)throw Object.assign(new Error('fieldnet_signed_envelope_required'),{statusCode:401});
    const calculatedBodyHash=sha256(canonical(body));if(envelope.expectedBodyHash!==calculatedBodyHash)throw Object.assign(new Error('fieldnet_body_hash_mismatch'),{statusCode:401});
    const {expectedBodyHash,...principal}=envelope;
    return{...principal,requestBodyHash:calculatedBodyHash};
  }
  verify({ method, path, headers, body=null }) {
    const envelope=this.verifyEnvelope({method,path,headers});
    return this.verifyBody({envelope,body});
  }
}
