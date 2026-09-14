import { randomUUID } from 'node:crypto';
import { fetchRaw } from '../../shared/fetch.mjs';
import { assertContentChecksum, normalizeContentChecksum, normalizeSha256Checksum } from '../../shared/content-checksum.mjs';

const decode=(body)=>new TextDecoder().decode(body);

export class AcquisitionScheduler{
  #active=0;#activeBytes=0;#providerActive=new Map();#providerBytes=new Map();#queue=[];#inFlight=new Map();
  constructor({maxConcurrency=4,maxProviderConcurrency=2,maxInFlightBytes=100*1024*1024,maxProviderInFlightBytes=60*1024*1024,maxQueued=200}={}){
    this.maxConcurrency=Math.max(1,Number(maxConcurrency));this.maxProviderConcurrency=Math.max(1,Number(maxProviderConcurrency));
    this.maxInFlightBytes=Math.max(1,Number(maxInFlightBytes));this.maxProviderInFlightBytes=Math.max(1,Number(maxProviderInFlightBytes));this.maxQueued=Math.max(1,Number(maxQueued));
  }
  status(){return{active:this.#active,activeBytes:this.#activeBytes,queued:this.#queue.length,providers:Object.fromEntries([...this.#providerActive].map(([provider,active])=>[provider,{active,bytes:this.#providerBytes.get(provider)??0}]))};}
  run({provider,key,reservedBytes,signal},operation){
    const identity=String(key);if(this.#inFlight.has(identity))return this.#inFlight.get(identity);
    const bytes=Math.max(1,Number(reservedBytes));
    if(bytes>this.maxInFlightBytes||bytes>this.maxProviderInFlightBytes)throw Object.assign(new Error('acquisition_memory_reservation_exceeded'),{statusCode:413});
    if(this.#queue.length>=this.maxQueued)throw Object.assign(new Error('acquisition_queue_capacity_reached'),{statusCode:503});
    let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const entry={provider:String(provider),identity,bytes,signal,operation,resolve,reject};this.#queue.push(entry);this.#inFlight.set(identity,promise);
    const abort=()=>{const index=this.#queue.indexOf(entry);if(index>=0){this.#queue.splice(index,1);this.#inFlight.delete(identity);reject(signal?.reason??new Error('acquisition_aborted'));}};
    if(signal?.aborted)abort();else signal?.addEventListener?.('abort',abort,{once:true});this.#drain();return promise;
  }
  #eligible(entry){return this.#active<this.maxConcurrency&&(this.#providerActive.get(entry.provider)??0)<this.maxProviderConcurrency&&this.#activeBytes+entry.bytes<=this.maxInFlightBytes&&(this.#providerBytes.get(entry.provider)??0)+entry.bytes<=this.maxProviderInFlightBytes;}
  #drain(){
    for(let index=0;index<this.#queue.length;){
      const entry=this.#queue[index];if(!this.#eligible(entry)){index+=1;continue;}
      this.#queue.splice(index,1);this.#active+=1;this.#activeBytes+=entry.bytes;this.#providerActive.set(entry.provider,(this.#providerActive.get(entry.provider)??0)+1);this.#providerBytes.set(entry.provider,(this.#providerBytes.get(entry.provider)??0)+entry.bytes);
      const release=()=>{this.#active-=1;this.#activeBytes-=entry.bytes;this.#providerActive.set(entry.provider,(this.#providerActive.get(entry.provider)??1)-1);this.#providerBytes.set(entry.provider,(this.#providerBytes.get(entry.provider)??entry.bytes)-entry.bytes);this.#inFlight.delete(entry.identity);this.#drain();};
      Promise.resolve().then(entry.operation).then((value)=>{release();entry.resolve(value);},(error)=>{release();entry.reject(error);});
    }
  }
}
const sharedScheduler=new AcquisitionScheduler();

export class HttpAcquirer{
  constructor({store,fetchImpl=globalThis.fetch,timeoutMs=12_000,userAgent='VIGIA/10.0',clock=()=>new Date(),scheduler=sharedScheduler}={}){Object.assign(this,{store,fetchImpl,timeoutMs,userAgent,clock,scheduler});}
  async acquire({sourceId,provider,url,archiveUri=null,accept='*/*',headers={},licenceMetadata,parserVersion='unspecified',requestWindow=null,signal=null,validateUrl=null,maxBytes=50*1024*1024,expectedChecksum=null,expectedSha256=null,decodeBody=false,parse}){
    const normalizedExpected=expectedChecksum?normalizeContentChecksum(expectedChecksum,{allowMissing:false}):expectedSha256?{algorithm:'sha256',digest:normalizeSha256Checksum(expectedSha256,{allowMissing:false}),encoding:'hex',strength:'cryptographic'}:null;
    const productKey=JSON.stringify([String(provider),String(sourceId),String(url),requestWindow??null,normalizedExpected?[normalizedExpected.algorithm,normalizedExpected.digest]:null]);
    return this.scheduler.run({provider,key:productKey,reservedBytes:maxBytes,signal},()=>this.#acquire({sourceId,provider,url,archiveUri,accept,headers,licenceMetadata,parserVersion,requestWindow,signal,validateUrl,maxBytes,normalizedExpected,decodeBody,parse}));
  }
  async #acquire({sourceId,provider,url,archiveUri,accept,headers,licenceMetadata,parserVersion,requestWindow,signal,validateUrl,maxBytes,normalizedExpected,decodeBody,parse}){
    const acquisitionRunId=randomUUID();let archived=null;
    const acquisitionStartedAt=this.clock().toISOString();let downloadStartedAt=null,downloadCompletedAt=null,archivePersistedAt=null,parseStartedAt=null,parseCompletedAt=null;
    await this.store.recordAttempt(sourceId);
    try{
      downloadStartedAt=this.clock().toISOString();
      const raw=await fetchRaw(url,{fetchImpl:this.fetchImpl,timeoutMs:this.timeoutMs,userAgent:this.userAgent,headers:{accept,...headers},signal,validateUrl,maxBytes});
      downloadCompletedAt=this.clock().toISOString();
      if(!raw.ok)throw new Error(`upstream_http_${raw.status}`);
      if(normalizedExpected)assertContentChecksum(raw.body,normalizedExpected);
      archived=await this.store.archiveReceivedProduct({sourceId,provider,body:raw.body,contentType:raw.contentType,httpStatus:raw.status,originalUri:archiveUri??url,licenceMetadata,acquisitionRunId,requestWindow,acquisitionTimings:{acquisitionStartedAt,downloadStartedAt,downloadCompletedAt}});
      archivePersistedAt=this.clock().toISOString();
      parseStartedAt=this.clock().toISOString();
      const body=raw.body;raw.body=null;const parsed=await parse(decodeBody?decode(body):null,{...raw,body});
      parseCompletedAt=this.clock().toISOString();
      if(!parsed||!('value'in parsed))throw new Error('acquirer_parser_contract_invalid');
      const accepted=await this.store.acceptProduct(archived.product.id,{sourceTimestamp:parsed.sourceTimestamp,sourceTimestampRange:parsed.sourceTimestampRange,providerProductId:parsed.providerProductId,parserVersion,normalizerVersion:parsed.normalizerVersion,nextAttemptAt:parsed.nextAttemptAt,acquisitionTimings:{acquisitionStartedAt,downloadStartedAt,downloadCompletedAt,archivePersistedAt,parseStartedAt,parseCompletedAt}});
      return{value:parsed.value,rawSourceProduct:accepted.product,duplicate:archived.duplicate,checkpoint:accepted.checkpoint,acquisitionRunId,acquisitionTimings:accepted.product.acquisitionTimings};
    }catch(error){if(archived?.product?.id)await this.store.recordProductRejected(archived.product.id,error,{parserVersion}).catch(()=>undefined);await this.store.recordFailure(sourceId,error);throw error;}
  }
  json(input){return this.acquire({...input,decodeBody:true,accept:'application/json',parse:async(text,raw)=>{let value;try{value=JSON.parse(text);}catch{throw new Error('upstream_invalid_json');}if(!value||typeof value!=='object')throw new Error('upstream_invalid_json_shape');const details=await input.describe(value,raw);return{value,...details};}});}
  text(input){return this.acquire({...input,decodeBody:true,parse:async(text,raw)=>{const details=await input.describe(text,raw);return{value:text,...details};}});}
}
