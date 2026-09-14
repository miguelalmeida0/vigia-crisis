const timeout=(ms)=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
async function json(url,options={}){const response=await fetch(url,{cache:'no-store',credentials:url.startsWith('/')?'same-origin':'omit',signal:timeout(8_000),...options});if(!response.ok)throw new Error(`${url}:HTTP_${response.status}`);return response.json();}
function fieldNodeBase(){const value=new URLSearchParams(location.search).get('fieldnetNode');if(!value)return'http://127.0.0.1:4188';try{const parsed=new URL(value);return parsed.protocol==='http:'&&['127.0.0.1','localhost'].includes(parsed.hostname)?parsed.origin:'http://127.0.0.1:4188';}catch{return'http://127.0.0.1:4188';}}
export async function certifyBrowserRelease(){
  const failures=[],degraded=[];let web=null,api=null,fieldNode=null;
  const results=await Promise.allSettled([json('/data/release-identity.json'),json('/api/v10/release'),json(`${fieldNodeBase()}/api/fieldnet/release`)]);
  [web,api,fieldNode]=results.map((result)=>result.status==='fulfilled'?result.value:null);
  results.forEach((result,index)=>{
    if(result.status!=='rejected')return;
    const component=['web','api','fieldnode'][index],message=`${component}_release_unavailable:${result.reason.message}`;
    if(component==='fieldnode')degraded.push(message);else failures.push(message);
  });
  if(web&&api&&web.releaseId!==api.releaseId)failures.push('web_api_release_id_mismatch');
  if(web&&fieldNode&&web.releaseId!==fieldNode.releaseId)failures.push('web_fieldnode_release_id_mismatch');
  if(web&&api&&web.codeStateHash!==api.codeStateHash)failures.push('web_api_code_state_mismatch');
  if(web&&fieldNode&&web.codeStateHash!==fieldNode.codeStateHash)failures.push('web_fieldnode_code_state_mismatch');
  const required=web?.contracts;
  if(!required||typeof required!=='object')failures.push('web_release_contract_missing');
  for(const [key,value] of Object.entries(required??{})){
    if(api?.contracts?.[key]!==value)failures.push(`api_${key}_requires_${value}`);
    if(key==='fieldNodeContractVersion'&&fieldNode&&fieldNode.contracts?.[key]!==value)failures.push(`fieldnode_${key}_requires_${value}`);
  }
  if(api?.schema?.certification?.state!=='PASS')failures.push('database_schema_not_certified');
  if(api?.routeCertification?.state!=='PASS')failures.push('primary_routes_not_certified');
  if(api?.sessionCertification?.state!=='PASS')failures.push('session_not_certified');
  return{schemaVersion:'vigia.browser-release-handshake.v2',compatible:failures.length===0,failures,degraded,web,api,fieldNode,checkedAt:new Date().toISOString()};
}

export function renderReleaseFailure(root,result){
  root.dataset.ready='false';root.dataset.releaseState='incompatible';
  root.innerHTML=`<main class="release-integrity-stop" role="alert"><span>RELEASE INTEGRITY STOP</span><h1>INCOMPATIBLE RELEASE</h1><p>VIGIA will not mix browser, API, database, or FieldNode contracts.</p><dl><div><dt>Browser</dt><dd>${result.web?.releaseId??'Unavailable'}</dd></div><div><dt>API</dt><dd>${result.api?.releaseId??'Unavailable'}</dd></div><div><dt>FieldNode</dt><dd>${result.fieldNode?.releaseId??'Unavailable'}</dd></div></dl><details><summary>Compatibility failures</summary><ul>${result.failures.map((item)=>`<li>${String(item).replaceAll('_',' ')}</li>`).join('')}</ul></details><strong>Run the governed local release command before making decisions.</strong></main>`;
}
