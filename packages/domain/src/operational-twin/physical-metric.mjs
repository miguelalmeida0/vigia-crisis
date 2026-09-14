// Presentation measurements only. These rules never admit a fire or issue an order.
import { realWorldValue } from './real-world-value.mjs';
export const rows = value => Array.isArray(value) ? value : [];
export const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const timestamp = value => Number.isFinite(Date.parse(value ?? '')) ? Date.parse(value) : null;
export function coordinate(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90 ? value : null;
}
export function distanceKm(a,b) {
  if (!coordinate(a) || !coordinate(b)) return null;
  const r = Math.PI / 180, dlat = (b[1]-a[1])*r, dlon = (b[0]-a[0])*r;
  const h = Math.sin(dlat/2)**2 + Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dlon/2)**2;
  return Math.round(6371.0088*2*Math.asin(Math.sqrt(Math.min(1,h)))*10)/10;
}
export function compass(degrees) {
  return number(degrees) === null || degrees < 0 || degrees > 360 ? null : ['N','NE','E','SE','S','SW','W','NW'][Math.round(degrees/45)%8];
}
export function metric(id,label,value,unit,record={},asOf,ttlMs=null,context='') {
  return realWorldValue({id,label,value,unit,record,asOf,ttlMs,context});
}
export const CHANGE_POLICY=Object.freeze({version:'vigia.observation-change.v1',maximumWindowMinutes:180,minimumDelta:{temperatureC:2,windSpeedKph:5,gustKph:5,humidityPercent:5,precipitationMm:1},meaning:'Display significance only; not an emergency or fire-behaviour threshold.'});
export function trend(samples,field,asOf,policy=CHANGE_POLICY) {
  const now=timestamp(asOf), valid=rows(samples).filter(s=>timestamp(s.observedAt)!==null&&timestamp(s.observedAt)<=now&&timestamp(s.observedAt)>=now-3*3600000&&number(s[field])!==null);
  const valuesByTime=new Map();for(const s of valid){if(!valuesByTime.has(s.observedAt))valuesByTime.set(s.observedAt,new Set());valuesByTime.get(s.observedAt).add(s[field]);}
  const unique=new Map();for(const s of valid)if(valuesByTime.get(s.observedAt).size===1&&!unique.has(s.observedAt))unique.set(s.observedAt,s);
  const ordered=[...unique.values()].sort((a,b)=>timestamp(a.observedAt)-timestamp(b.observedAt));
  if(ordered.length<2)return null;
  const first=ordered.at(-2),last=ordered.at(-1),lastHour=ordered.filter(s=>timestamp(s.observedAt)>=now-3600000);
  const delta=Math.round((last[field]-first[field])*10)/10,minutes=Math.round((timestamp(last.observedAt)-timestamp(first.observedAt))/60000),minimum=policy.minimumDelta[field];
  return {delta,minutes,previousValue:first[field],currentValue:last[field],from:first.observedAt,to:last.observedAt,direction:delta>0?'INCREASED':delta<0?'DECREASED':'UNCHANGED',material:Number.isFinite(minimum)&&Math.abs(delta)>=minimum&&minutes<=policy.maximumWindowMinutes,policy:policy.version,minimumDelta:minimum??null,limitation:policy.meaning,maxLastHour:lastHour.length?Math.max(...lastHour.map(s=>s[field])):null,samples:ordered.slice(-24).map(s=>({at:s.observedAt,value:s[field],receivedAt:s.receivedAt??null,sourceId:s.sourceId??s.source,observationId:s.observationId??s.id,provenanceRef:s.provenance?.rawSourceProductId??s.id}))};
}
