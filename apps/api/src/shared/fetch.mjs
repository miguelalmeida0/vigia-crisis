const abortAfter = (timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('upstream_timeout')), timeoutMs);
  timer.unref?.();
  return { controller, timer };
};
const cleanupSymbol=Symbol('vigiaFetchCleanup');

async function readLimited(response,maxBytes){
  const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>maxBytes)throw new Error('upstream_body_too_large');
  const chunks=[];let bytes=0;
  if(response.body)for await(const chunk of response.body){const part=Buffer.from(chunk);bytes+=part.length;if(bytes>maxBytes)throw new Error('upstream_body_too_large');chunks.push(part);}
  else{const part=Buffer.from(await response.arrayBuffer());bytes=part.length;if(bytes>maxBytes)throw new Error('upstream_body_too_large');chunks.push(part);}
  return Buffer.concat(chunks,bytes);
}
async function consume(response,maxBytes,transform){try{return transform(await readLimited(response,maxBytes));}catch(error){await response.body?.cancel?.().catch?.(()=>{});throw error;}finally{response[cleanupSymbol]?.();}}
async function jsonResponse(response,maxBytes){
  if(!response.body&&typeof response.arrayBuffer!=='function'&&typeof response.json==='function'){
    try{const value=await response.json(),encoded=JSON.stringify(value);if(Buffer.byteLength(encoded)>maxBytes)throw new Error('upstream_body_too_large');return value;}finally{response[cleanupSymbol]?.();}
  }
  return consume(response,maxBytes,(body)=>JSON.parse(body.toString('utf8')));
}

async function request(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 12_000,
  headers = {},
  method = 'GET',
  body,
  allowHttpError = false,
  signal = null,
  validateUrl = null,
  maxRedirects = 3,
  allowCrossOriginRedirect = false
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
  const { controller, timer } = abortAfter(timeoutMs);
  try {
    let target=new URL(url),response,redirects=0,currentMethod=method,currentBody=body;const currentHeaders=Object.fromEntries(new Headers(headers).entries());
    while(true){
      await validateUrl?.(target);
      response=await fetchImpl(target, {method:currentMethod,body:currentBody,redirect:'manual',signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,headers:currentHeaders});
      if(![301,302,303,307,308].includes(response.status))break;
      const failRedirect=async(code)=>{await response.body?.cancel?.().catch?.(()=>{});throw new Error(code);};
      if(redirects>=maxRedirects)await failRedirect('upstream_redirect_limit_exceeded');
      const location=response.headers.get('location');if(!location)await failRedirect('upstream_redirect_location_missing');
      let next;try{next=new URL(location,target);}catch{await failRedirect('upstream_redirect_location_invalid');}
      if(!['http:','https:'].includes(next.protocol)||target.protocol==='https:'&&next.protocol!=='https:')await failRedirect('upstream_redirect_scheme_rejected');
      const originChanged=next.origin!==target.origin;if(originChanged&&!allowCrossOriginRedirect)await failRedirect('upstream_redirect_origin_rejected');
      try{await validateUrl?.(next);}catch(error){await response.body?.cancel?.().catch?.(()=>{});throw error;}
      if(originChanged)for(const name of ['authorization','cookie','proxy-authorization'])delete currentHeaders[name];
      await response.body?.cancel?.().catch?.(()=>{});
      if(response.status===303||((response.status===301||response.status===302)&&currentMethod==='POST')){currentMethod='GET';currentBody=undefined;}
      target=next;redirects+=1;
    }
    if (!response.ok && !allowHttpError) {await response.body?.cancel?.();throw new Error(`upstream_http_${response.status}`);}
    response[cleanupSymbol]=()=>clearTimeout(timer);
    return response;
  } catch(error) {
    clearTimeout(timer);
    throw error;
  }
}

export async function fetchJson(url, options = {}) {
  const response = await request(url, {
    ...options,
    headers: {
      accept: 'application/json',
      'user-agent': options.userAgent ?? 'VIGIA/1.1',
      ...(options.headers ?? {})
    }
  });
  return jsonResponse(response,options.maxBytes??4*1024*1024);
}

export async function postJson(url, payload, options = {}) {
  const response = await request(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': options.userAgent ?? 'VIGIA/1.1',
      ...(options.headers ?? {})
    }
  });
  return jsonResponse(response,options.maxBytes??4*1024*1024);
}

export async function fetchText(url, options = {}) {
  const response = await request(url, {
    ...options,
    headers: {
      accept: 'text/plain,text/csv,application/xml,*/*;q=0.5',
      'user-agent': options.userAgent ?? 'VIGIA/1.1',
      ...(options.headers ?? {})
    }
  });
  return consume(response,options.maxBytes??8*1024*1024,(body)=>body.toString('utf8'));
}

export async function fetchBuffer(url, options = {}) {
  const response = await request(url, {
    ...options,
    headers: {
      accept: 'image/png,image/*;q=0.9,*/*;q=0.1',
      'user-agent': options.userAgent ?? 'VIGIA/1.1',
      ...(options.headers ?? {})
    }
  });
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  if (!contentType.startsWith('image/')) {await response.body?.cancel?.();response[cleanupSymbol]?.();throw new Error('upstream_not_image');}
  const body=await consume(response,options.maxBytes??8*1024*1024,(value)=>value);
  return { buffer: body, body, contentType };
}

export async function fetchRaw(url, options = {}) {
  const response = await request(url, {
    ...options,
    allowHttpError: true,
    headers: { 'user-agent': options.userAgent ?? 'VIGIA/10.0', ...(options.headers ?? {}) }
  });
  const body = await consume(response,options.maxBytes ?? 50 * 1024 * 1024,(value)=>value);
  const integrityHeaders=Object.fromEntries(['content-length','etag','last-modified','content-range','cache-control'].flatMap((name)=>{const value=response.headers.get(name);return value?[[name,value]]:[];}));
  return { body, contentType: response.headers.get('content-type') ?? 'application/octet-stream', status: response.status, ok: response.ok, headers:integrityHeaders };
}
