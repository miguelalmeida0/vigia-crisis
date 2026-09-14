import http from 'node:http';

const parseBody=(value)=>{try{return JSON.parse(value);}catch{return value;}};

export function fieldControlRequest({socketPath,path,method='GET',headers={},body=null,timeoutMs=10_000,maxResponseBytes=8*1024*1024,logicalUrl=null}={}){
  if(!socketPath)throw new Error('fieldnet_control_socket_required');
  if(typeof path!=='string'||!path.startsWith('/'))throw new Error('fieldnet_control_path_required');
  const payload=body==null?null:Buffer.from(String(body));
  return new Promise((resolve,reject)=>{
    const started=performance.now();
    const request=http.request({socketPath,path,method,headers:{host:'fieldnode.local',...headers,...(payload?{'content-length':String(payload.length)}:{})}},(response)=>{
      const declared=Number(response.headers['content-length']);
      if(Number.isFinite(declared)&&declared>maxResponseBytes){response.destroy();reject(Object.assign(new Error('fieldnet_control_response_too_large'),{statusCode:502}));return;}
      const chunks=[];let bytes=0;
      response.on('data',(chunk)=>{bytes+=chunk.length;if(bytes>maxResponseBytes){response.destroy(Object.assign(new Error('fieldnet_control_response_too_large'),{statusCode:502}));return;}chunks.push(chunk);});
      response.once('error',reject);
      response.once('end',()=>{const text=Buffer.concat(chunks,bytes).toString('utf8');resolve({url:logicalUrl??`http://fieldnode.local${path}`,status:Number(response.statusCode??0),ok:Number(response.statusCode??0)>=200&&Number(response.statusCode??0)<300,body:parseBody(text),durationMs:Number((performance.now()-started).toFixed(3)),setCookies:Array.isArray(response.headers['set-cookie'])?response.headers['set-cookie']:[]});});
    });
    request.setTimeout(timeoutMs,()=>request.destroy(Object.assign(new Error('fieldnet_control_request_timeout'),{code:'ETIMEDOUT'})));
    request.once('error',reject);
    if(payload)request.write(payload);
    request.end();
  });
}
