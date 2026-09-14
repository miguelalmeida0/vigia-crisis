export class SseHub {
  #clients = new Set();
  #byClient=new Map();

  constructor({maxClients=128,maxPerClient=16,maxAgeMs=15*60_000,backpressureTimeoutMs=2_000}={}){Object.assign(this,{maxClients,maxPerClient,maxAgeMs,backpressureTimeoutMs});}

  get size() {
    return this.#clients.size;
  }

  add(res,{clientKey='unknown'}={}) {
    const key=String(clientKey??'unknown').slice(0,160),count=this.#byClient.get(key)??0;
    if(this.#clients.size>=this.maxClients)throw Object.assign(new Error('sse_capacity_exhausted'),{statusCode:503});
    if(count>=this.maxPerClient)throw Object.assign(new Error('sse_client_capacity_exhausted'),{statusCode:429});
    const row={res,clientKey:key,drainTimer:null,ageTimer:null};this.#clients.add(row);this.#byClient.set(key,count+1);
    const remove = () => this.#remove(row);
    res.once('close', remove);
    res.once('error', remove);
    row.ageTimer=setTimeout(()=>{res.end();remove();},this.maxAgeMs);row.ageTimer.unref?.();
    return row;
  }

  publish(event, payload) {
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.#clients) {
      try {
        if(client.res.write(message)===false&&!client.drainTimer){
          const drained=()=>{if(client.drainTimer)clearTimeout(client.drainTimer);client.drainTimer=null;};client.res.once('drain',drained);
          client.drainTimer=setTimeout(()=>{client.res.destroy();this.#remove(client);},this.backpressureTimeoutMs);client.drainTimer.unref?.();
        }
      } catch {
        this.#remove(client);
      }
    }
  }

  close() {
    for (const client of this.#clients) client.res.end();
    this.#clients.clear();
    this.#byClient.clear();
  }

  #remove(row){if(!this.#clients.delete(row))return;if(row.ageTimer)clearTimeout(row.ageTimer);if(row.drainTimer)clearTimeout(row.drainTimer);const remaining=(this.#byClient.get(row.clientKey)??1)-1;if(remaining>0)this.#byClient.set(row.clientKey,remaining);else this.#byClient.delete(row.clientKey);}
}
