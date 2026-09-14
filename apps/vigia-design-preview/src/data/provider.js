import {initialState} from './model.js';
const STORAGE_KEY='vigia.design-preview.v1';
/** Isolated demo provider. It never calls the real API and cannot issue public instructions. */
export function createDemoProvider(storage){
 let current=initialState(); let persisted=true;
 try { if(storage===undefined)storage=globalThis.localStorage; } catch { storage=null;persisted=false; }
 try {const saved=JSON.parse(storage?.getItem(STORAGE_KEY)||'null');if(saved?.version===1 && ['populated','limited','stale','readonly'].includes(saved.variant) && typeof saved.selected==='string' && saved.tasks && typeof saved.tasks==='object' && Array.isArray(saved.activity))current=saved;}catch{persisted=false;}
 return {mode:'demo',read:()=>structuredClone(current),write(next){current=structuredClone(next);try{if(storage)storage.setItem(STORAGE_KEY,JSON.stringify(current));else persisted=false;}catch{persisted=false;}return persisted;},reset(){current=initialState();try{storage?.removeItem(STORAGE_KEY);}catch{persisted=false;}return structuredClone(current);},get persistenceAvailable(){return persisted;}};
}
/** Production must supply a different adapter. Missing credentials are never a demo fallback. */
export function assertLiveAdapter(adapter){if(!adapter || adapter.mode!=='live' || typeof adapter.read!=='function')throw new Error('Live adapter not configured. Demo data must never be substituted.');return adapter;}
