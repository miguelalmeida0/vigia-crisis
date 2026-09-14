function boundedKey(value){return String(value??'unknown').slice(0,160);}
function capacityError(code,statusCode){return Object.assign(new Error(code),{statusCode});}

export class RequestGate {
  #active=0;#byClient=new Map();#windows=new Map();
  constructor({maxConcurrent=8,maxConcurrentPerClient=2,maxRequestsPerWindow=120,windowMs=60_000,maxClients=1_024,clock=()=>Date.now()}={}){Object.assign(this,{maxConcurrent,maxConcurrentPerClient,maxRequestsPerWindow,windowMs,maxClients,clock});}
  async run(clientKey,work){
    const key=boundedKey(clientKey),now=this.clock(),prior=this.#windows.get(key),window=!prior||prior.resetAt<=now?{count:0,resetAt:now+this.windowMs}:prior;
    if(window.count>=this.maxRequestsPerWindow)throw capacityError('request_rate_limited',429);
    if(this.#active>=this.maxConcurrent)throw capacityError('request_capacity_exhausted',503);
    const clientActive=this.#byClient.get(key)??0;if(clientActive>=this.maxConcurrentPerClient)throw capacityError('client_request_capacity_exhausted',429);
    window.count+=1;this.#windows.set(key,window);this.#prune(now);
    this.#active+=1;this.#byClient.set(key,clientActive+1);
    try{return await work();}finally{this.#active-=1;const remaining=(this.#byClient.get(key)??1)-1;if(remaining>0)this.#byClient.set(key,remaining);else this.#byClient.delete(key);}
  }
  #prune(now){if(this.#windows.size<=this.maxClients)return;for(const [key,value] of this.#windows){if(value.resetAt<=now)this.#windows.delete(key);if(this.#windows.size<=this.maxClients)return;}while(this.#windows.size>this.maxClients)this.#windows.delete(this.#windows.keys().next().value);}
}

export class SingleFlight {
  #pending=new Map();
  constructor({maxKeys=256}={}){this.maxKeys=maxKeys;}
  run(key,work){const name=boundedKey(key);if(this.#pending.has(name))return this.#pending.get(name);if(this.#pending.size>=this.maxKeys)throw capacityError('single_flight_capacity_exhausted',503);const promise=Promise.resolve().then(work).finally(()=>this.#pending.delete(name));this.#pending.set(name,promise);return promise;}
}
