const sizeError=(maxBytes)=>Object.assign(new Error('bounded_http_response_exceeded'),{statusCode:502,details:{maxBytes}});

export async function readBoundedResponse(response,{maxBytes=8*1024*1024}={}){
  const declared=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(declared)&&declared>maxBytes){await response.body?.cancel?.();throw sizeError(maxBytes);}
  if(!response.body)return{text:'',body:null};
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw sizeError(maxBytes);}chunks.push(Buffer.from(value));}
  }finally{reader.releaseLock();}
  const text=Buffer.concat(chunks,bytes).toString('utf8');let body;
  try{body=JSON.parse(text);}catch{body=text;}
  return{text,body};
}
