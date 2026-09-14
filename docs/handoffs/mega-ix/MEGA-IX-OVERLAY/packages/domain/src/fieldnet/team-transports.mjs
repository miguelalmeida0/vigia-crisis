// Network adapters accept signed encrypted envelopes; never manufacture receipts.
export class InternetTransport {
  constructor(send){this.send=send;this.kind='INTERNET';}
  async transmit(envelope,via=[]){return this.send({envelope,via});}
}
export class LocalNetworkTransport extends InternetTransport {
  constructor(send){super(send);this.kind='LOCAL_NETWORK';}
}
export class StoreAndForwardTransport {
  constructor({store,deviceId,verifyEnvelope,clock=()=>new Date()}){Object.assign(this,{store,deviceId,verifyEnvelope,clock});this.kind='STORE_AND_FORWARD';}
  async retain(envelope,via=[]){
    if(Date.parse(envelope.expiresAt)<=this.clock().getTime()||via.length>=8||via.includes(this.deviceId))throw Error('Relay expired or already passed through this device.');
    await this.verifyEnvelope(envelope);const prior=await this.store.get('relay:'+envelope.id);
    if(prior){if(JSON.stringify(prior.envelope)!==JSON.stringify(envelope))throw Error('Conflicting relay message ID.');return {relayed:true,duplicate:true};}
    await this.store.put('relay:'+envelope.id,{envelope,via:[...via,this.deviceId]});return {relayed:true,duplicate:false};
  }
  async forward(transport){const results=[];for(const item of await this.store.all('relay:')){if(Date.parse(item.envelope.expiresAt)<=this.clock().getTime()){results.push({id:item.envelope.id,expired:true});continue;}results.push(await transport.transmit(item.envelope,item.via));}return results;}
}
export class NativePeerTransport {
  constructor(adapter=null){this.adapter=adapter;this.kind='NATIVE_PEER';}
  available(){return Boolean(this.adapter?.transmit);}
  async transmit(envelope,via=[]){if(!this.available())throw Error('Nearby / Bluetooth requires an installed native peer adapter.');return this.adapter.transmit(envelope,via);}
}
export class LoRaGatewayTransport extends NativePeerTransport {
  constructor(adapter=null){super(adapter);this.kind='LORA_GATEWAY';}
  async transmit(envelope,via=[]){if(!this.available())throw Error('LoRa requires a paired radio gateway and fragmentation adapter.');return this.adapter.transmit(envelope,via);}
}
export class DurableOutbox {
  constructor({store,clock=()=>new Date()}){Object.assign(this,{store,clock});this.running=null;}
  async enqueue(envelope){const id='outbox:'+envelope.id,prior=await this.store.get(id);if(prior){if(JSON.stringify(prior.envelope)!==JSON.stringify(envelope))throw Error('Conflicting outgoing message ID.');return prior;}const row={envelope,attempts:0,state:'WAITING_FOR_CONNECTION',queuedAt:this.clock().toISOString()};await this.store.put(id,row);return row;}
  flush(transport){if(this.running)return this.running;this.running=this.run(transport).finally(()=>this.running=null);return this.running;}
  async run(transport){const results=[];for(const row of await this.store.all('outbox:')){
    if(['ACCEPTED','EXPIRED','REJECTED'].includes(row.state))continue;
    if(Date.parse(row.envelope.expiresAt)<=this.clock().getTime()){row.state='EXPIRED';await this.store.put('outbox:'+row.envelope.id,row);continue;}
    try{const receipt=await transport.transmit(row.envelope);if(receipt?.accepted!==true||receipt.id!==row.envelope.id)throw Error('Local hub did not acknowledge storage.');row.state='ACCEPTED';row.acceptedAt=receipt.receivedAt;row.error=null;results.push(receipt);}
    catch(e){row.state=[400,401,403,409,413].includes(e.status??e.statusCode)?'REJECTED':'WAITING_FOR_CONNECTION';row.error=e.message;}
    row.attempts++;await this.store.put('outbox:'+row.envelope.id,row);
  }return results;}
}
