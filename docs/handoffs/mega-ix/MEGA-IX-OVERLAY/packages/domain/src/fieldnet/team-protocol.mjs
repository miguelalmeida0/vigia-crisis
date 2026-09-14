// Shared browser / local hub protocol. Standard Web Crypto only.
export const PROTOCOL = 'vigia.team-envelope.v1';
export const MAX_TTL_MS = 72 * 3600000;
export const canonical = value => JSON.stringify(sort(value));
function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v; }
const bytes = text => new TextEncoder().encode(text);
export const b64 = value => { let s = ''; for (const n of new Uint8Array(value)) s += String.fromCharCode(n); return btoa(s); };
export const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export async function digest(value) { return b64(await crypto.subtle.digest('SHA-256', bytes(canonical(value)))); }
export async function identity() {
  const pair = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, false, ['sign','verify']);
  return { deviceId:crypto.randomUUID(), privateKey:pair.privateKey, publicKey:await crypto.subtle.exportKey('jwk', pair.publicKey) };
}
export async function groupKey() { return b64(crypto.getRandomValues(new Uint8Array(32))); }
const aes = key => crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['encrypt','decrypt']);
export function header(envelope) { const { ciphertext, signature, ...value } = envelope; return value; }
export async function seal({ group, device, senderId, kind, payload, recipients, now = new Date(), ttlMs = MAX_TTL_MS }) {
  const createdAt = now.toISOString();
  const envelope = { protocol:PROTOCOL, id:crypto.randomUUID(), groupId:group.id, epoch:group.epoch, incidentId:group.incidentId, lane:group.lane, senderId, deviceId:device.deviceId, kind, createdAt, expiresAt:new Date(now.getTime()+Math.min(MAX_TTL_MS,ttlMs)).toISOString(), recipients:[...new Set(recipients ?? group.members.filter(m=>!m.revokedAt).map(m=>m.id).filter(id=>id!==senderId))].sort(), iv:b64(crypto.getRandomValues(new Uint8Array(12))) };
  envelope.ciphertext = b64(await crypto.subtle.encrypt({ name:'AES-GCM', iv:unb64(envelope.iv), additionalData:bytes(canonical(header(envelope))) }, await aes(group.key), bytes(canonical(payload))));
  envelope.signature = b64(await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, device.privateKey, bytes(canonical(envelope))));
  return envelope;
}
export async function verify(envelope, publicKey, { now = new Date(), allowExpired = false } = {}) {
  if (!envelope || envelope.protocol!==PROTOCOL || !/^[0-9a-f-]{36}$/i.test(envelope.id) || !Array.isArray(envelope.recipients) || envelope.recipients.length>32 || new Set(envelope.recipients).size!==envelope.recipients.length || typeof envelope.ciphertext!=='string' || envelope.ciphertext.length>1500000) throw Error('Invalid message envelope.');
  const sent=Date.parse(envelope.createdAt), end=Date.parse(envelope.expiresAt);
  if (!Number.isFinite(sent)||!Number.isFinite(end)||end<=sent||end-sent>MAX_TTL_MS||sent>now.getTime()+60000||(!allowExpired&&end<=now.getTime())) throw Error('Message expired or device clock is incorrect.');
  const { signature, ...signed } = envelope;
  const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if (!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,unb64(signature),bytes(canonical(signed)))) throw Error('Message signature is invalid.');
  return true;
}
export async function open(envelope, key) {
  const value=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(envelope.iv),additionalData:bytes(canonical(header(envelope)))},await aes(key),unb64(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(value));
}
export function delivery(envelope, receipts = [], { accepted = false, relayedBy = [] } = {}) {
  const ids=[...new Set(receipts.filter(r=>r.messageId===envelope.id&&envelope.recipients.includes(r.recipientId)).map(r=>r.recipientId))];
  return { received:ids, waiting:envelope.recipients.filter(id=>!ids.includes(id)), label:ids.length?`RECEIVED BY ${ids.length} OF ${envelope.recipients.length}`:relayedBy.length?'RELAYED':accepted?'SENT FROM THIS DEVICE':'WAITING FOR CONNECTION' };
}
