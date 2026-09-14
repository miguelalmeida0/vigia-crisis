import {offlineKey,encryptOffline,decryptOffline} from './field-team-offline.js';
// Only ciphertext and non-extractable device keys are stored on disk.
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Local save interrupted.'));});
const result=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
export class FieldTeamStore {
  static authorized=null;
  static offline=null;
  authorize(senderId){FieldTeamStore.authorized=senderId;}
  async lock(){FieldTeamStore.authorized=null;FieldTeamStore.offline=null;await this.remove('offline-package');dispatchEvent(new Event('vigia-team-locked'));}
  async prepareOffline(passphrase,value){const salt=crypto.getRandomValues(new Uint8Array(16)),key=await offlineKey(passphrase,salt);FieldTeamStore.offline={key,salt};await this.updateOffline(value);}
  async updateOffline(value){const unlocked=FieldTeamStore.offline;if(unlocked)await this.put('offline-package',{salt:unlocked.salt,...await encryptOffline(value,unlocked.key)});}
  async unlockOffline(passphrase){const record=await this.get('offline-package');if(!record)throw Error('No offline team has been prepared.');const key=await offlineKey(passphrase,record.salt);let value;try{value=await decryptOffline(record,key);}catch{throw Error('The offline passphrase did not unlock this device.');}FieldTeamStore.offline={key,salt:record.salt};this.authorize(value.session.senderId);return value;}
  async initialize(){if(this.db)return this;const req=indexedDB.open('vigia-field-team-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('records');this.db=await result(req);return this;}
  async get(id){await this.initialize();return result(this.db.transaction('records').objectStore('records').get(id));}
  async put(id,value){await this.initialize();const tx=this.db.transaction('records','readwrite');tx.objectStore('records').put(value,id);await done(tx);return value;}
  async all(prefix){await this.initialize();const tx=this.db.transaction('records'),s=tx.objectStore('records');const [keys,values]=await Promise.all([result(s.getAllKeys()),result(s.getAll())]);return values.filter((_,i)=>String(keys[i]).startsWith(prefix));}
  async remove(id){await this.initialize();const tx=this.db.transaction('records','readwrite');tx.objectStore('records').delete(id);await done(tx);}
  async cache(id,value){let key=await this.get('cache-key');if(!key){key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await this.put('cache-key',key);}const iv=crypto.getRandomValues(new Uint8Array(12)),body=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(id)},key,new TextEncoder().encode(JSON.stringify(value)));await this.put('cache:'+id,{iv,body});}
  async cached(id){if(!FieldTeamStore.authorized)return null;const record=await this.get('cache:'+id),key=await this.get('cache-key');if(!record||!key)return null;const value=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv,additionalData:new TextEncoder().encode(id)},key,record.body)));return id.startsWith('session:')?value.senderId===FieldTeamStore.authorized?value:null:id.startsWith(FieldTeamStore.authorized+':')?value:null;}
}
