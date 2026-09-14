// Identifiers for local demonstration records only; never tokens or credentials.
let sequence=0;
export function localId(){
 if(typeof globalThis.crypto?.randomUUID==='function')return globalThis.crypto.randomUUID();
 if(typeof globalThis.crypto?.getRandomValues==='function'){const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');}
 return `local-${Date.now().toString(36)}-${++sequence}`;
}
