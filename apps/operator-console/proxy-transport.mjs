export function retryableProxyTransport(method, body, contentType) {
  const normalizedMethod=String(method||'GET').toUpperCase();
  if(['GET','HEAD','OPTIONS'].includes(normalizedMethod))return true;
  if(!body||!String(contentType||'').toLowerCase().includes('application/json'))return false;
  try{return Boolean(String(JSON.parse(body.toString('utf8'))?.idempotencyKey??'').trim());}
  catch{return false;}
}
