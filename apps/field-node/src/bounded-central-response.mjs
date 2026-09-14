const plainObject=(value)=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function capacityError(code,details={}){return Object.assign(new Error(code),{statusCode:502,details});}

export async function readBoundedCentralJson(response,{maxBytes=2*1024*1024}={}){
  if(!Number.isInteger(maxBytes)||maxBytes<1024)throw new Error('valid_central_response_limit_required');
  const declared=Number(response?.headers?.get?.('content-length'));
  if(Number.isFinite(declared)&&declared>maxBytes){try{await response.body?.cancel?.();}catch{}throw capacityError('central_response_too_large',{declared,maxBytes});}
  if(!response?.body)throw capacityError('central_response_body_required');
  const chunks=[];let bytes=0;
  try{
    for await(const chunk of response.body){const part=Buffer.from(chunk);bytes+=part.length;if(bytes>maxBytes)throw capacityError('central_response_too_large',{bytes,maxBytes});chunks.push(part);}
  }catch(error){if(error?.message==='central_response_too_large')try{await response.body?.cancel?.();}catch{}throw error;}
  let value;try{value=JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));}catch{throw capacityError('central_response_invalid_json');}
  if(!plainObject(value))throw capacityError('central_response_object_required');
  return value;
}

export function boundedSyncCursor(value,{fallback=null,maxLength=160}={}){
  if(value===undefined||value===null)value=fallback;
  if(typeof value!=='string'&&typeof value!=='number')throw capacityError('central_sync_cursor_invalid');
  const cursor=String(value);
  if(cursor.length<1||cursor.length>maxLength||!/^[A-Za-z0-9._~:+-]+$/.test(cursor))throw capacityError('central_sync_cursor_invalid',{maxLength});
  return cursor;
}

export function validateCentralSyncPayload(payload,{maxAccepted=1000,maxUpdates=500,maxUpdateBytes=262_144}={}){
  if(!plainObject(payload))throw capacityError('central_sync_payload_invalid');
  const accepted=payload.acceptedMutationIds??[],updates=payload.updates??[];
  if(!Array.isArray(accepted)||accepted.length>maxAccepted||accepted.some((id)=>typeof id!=='string'||id.length<1||id.length>256))throw capacityError('central_sync_acknowledgements_invalid',{maxAccepted});
  if(!Array.isArray(updates)||updates.length>maxUpdates)throw capacityError('central_sync_updates_capacity_exceeded',{maxUpdates});
  for(const update of updates){
    if(!plainObject(update)||Buffer.byteLength(JSON.stringify(update))>maxUpdateBytes)throw capacityError('central_sync_update_invalid',{maxUpdateBytes});
    if(typeof update.id!=='string'||update.id.length<1||update.id.length>256||typeof update.incidentId!=='string'||update.incidentId.length<1||update.incidentId.length>256||update.type!=='CENTRAL_EVENT_SNAPSHOT'||update.actor!=='regional-vigia'||!plainObject(update.payload))throw capacityError('central_sync_update_contract_invalid');
  }
  return{...payload,acceptedMutationIds:accepted,updates};
}
