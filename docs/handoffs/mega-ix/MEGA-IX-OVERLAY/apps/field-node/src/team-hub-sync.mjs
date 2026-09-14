// Runs beside the existing FieldNet service. Its injected transport must use the
// installation's authenticated central connection. No public hub discovery.
export class TeamHubSync {
  constructor({service,actor,groupId,transport,clock=()=>new Date()}){Object.assign(this,{service,actor,groupId,transport,clock});this.running=null;}
  state(){return this.service.store.get('hub-sync',this.groupId)??{state:'NOT_CONNECTED',lastCentralSync:null,reportsSynced:0,messagesSynced:0,duplicates:0};}
  sync(){if(this.running)return this.running;this.running=this.run().finally(()=>this.running=null);return this.running;}
  async run(){
    const group=this.service.group(this.actor,this.groupId),before=this.state();
    if(!this.transport){const state={...before,state:'NOT_CONFIGURED'};this.service.store.put('hub-sync',group.id,state);return state;}
    let reports=0,messages=0,duplicates=0;
    try{
      const records=this.service.records('envelope',group).filter(r=>!this.service.store.get('central-receipt',r.id));
      for(const row of records){const receipt=await this.transport.transmit(row.envelope,row.relayedBy??[]);if(receipt.id!==row.id||receipt.accepted!==true)throw Error('Central storage acknowledgement missing.');this.service.store.put('central-receipt',row.id,receipt);if(receipt.duplicate)duplicates++;else{if(row.envelope.kind==='REPORT')reports++;if(row.envelope.kind==='MESSAGE')messages++;}}
      let cursor=before.receiveCursor??0,more=true;while(more){const page=await this.transport.receive?.(group.id,cursor)??[];const incoming=Array.isArray(page)?page:page.envelopes;for(const row of incoming){const receipt=await this.service.accept(this.actor,row.envelope,row.via??[]);if(receipt.duplicate)duplicates++;this.service.store.put('central-receipt',row.envelope.id,receipt);}more=!Array.isArray(page)&&page.hasMore===true;if(more&&page.nextCursor<=cursor)throw Error('Central cursor did not advance.');cursor=page.nextCursor??cursor;this.service.store.put('hub-sync',group.id,{...before,receiveCursor:cursor});}
      const state={receiveCursor:cursor,state:'CENTRAL_CONNECTION_RESTORED',lastCentralSync:this.clock().toISOString(),reportsSynced:before.reportsSynced+reports,messagesSynced:before.messagesSynced+messages,duplicates:before.duplicates+duplicates,lastBatch:{reports,messages,duplicates}};this.service.store.put('hub-sync',group.id,state);return state;
    }catch(error){const state={...before,receiveCursor:this.state().receiveCursor??before.receiveCursor,state:'INTERNET_OFFLINE',lastError:'Central connection unavailable. Local VIGIA remains active.',reportsSynced:before.reportsSynced+reports,messagesSynced:before.messagesSynced+messages,duplicates:before.duplicates+duplicates};this.service.store.put('hub-sync',group.id,state);return state;}
  }
}
