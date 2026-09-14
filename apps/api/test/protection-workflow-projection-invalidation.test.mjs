import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { registerProtectionWorkflowRoutes } from '../src/modules/protection/protection-workflow-routes.mjs';

function response(){return{statusCode:null,body:'',writeHead(status){this.statusCode=status;},end(chunk){this.body=chunk?Buffer.from(chunk).toString('utf8'):'';}};}
function request(body={}){const bytes=Buffer.from(JSON.stringify(body)),req=Readable.from([bytes]);req.headers={'content-type':'application/json','content-length':String(bytes.length)};return req;}

test('every persisted protection mutation invalidates canonical operator projections',async()=>{
  const posts=new Map(),router={get(){},post(path,handler){posts.set(path,handler);}},calls=[];
  const protectionWorkflowService={
    create:async()=>{calls.push('create');return{receipt:{receiptId:'create'}};},
    transition:async()=>{calls.push('transition');return{receipt:{receiptId:'transition'}};},
    capDraft:async()=>({validation:{valid:true}}),
    dispatchCap:async()=>{calls.push('dispatch');return{receipt:{receiptId:'dispatch'}};},
  };
  let invalidations=0;
  registerProtectionWorkflowRoutes(router,{protectionWorkflowService,canonicalOperatorApiService:{invalidate(){invalidations+=1;}}});
  const base='/api/v10/incident-command/incidents/:incidentId/protection-workflows',context={actor:{id:'operator:test'}},params={incidentId:'incident:test',workflowId:'protect:test'};
  for(const path of [base,`${base}/:workflowId/transitions`,`${base}/:workflowId/cap-dispatch`]){
    const res=response();
    await posts.get(path)({req:request({state:'REVIEW'}),res,params,context});
    assert.ok([200,201].includes(res.statusCode));
  }
  assert.deepEqual(calls,['create','transition','dispatch']);
  assert.equal(invalidations,3);
});

test('read-only CAP draft validation does not invalidate canonical projections',async()=>{
  const posts=new Map(),router={get(){},post(path,handler){posts.set(path,handler);}};
  let invalidations=0;
  registerProtectionWorkflowRoutes(router,{protectionWorkflowService:{capDraft:async()=>({validation:{valid:true}})},canonicalOperatorApiService:{invalidate(){invalidations+=1;}}});
  const base='/api/v10/incident-command/incidents/:incidentId/protection-workflows';
  const res=response();
  await posts.get(`${base}/:workflowId/cap-draft`)({req:request({}),res,params:{incidentId:'incident:test',workflowId:'protect:test'},context:{actor:{id:'operator:test'}}});
  assert.equal(res.statusCode,200);
  assert.equal(invalidations,0);
});

test('protection mutation invalidation is late-bound when canonical routes register afterward',async()=>{
  const posts=new Map(),router={get(){},post(path,handler){posts.set(path,handler);}},services={protectionWorkflowService:{create:async()=>({receipt:{receiptId:'create'}})}};
  registerProtectionWorkflowRoutes(router,services);
  let invalidations=0;
  services.canonicalOperatorApiService={invalidate(){invalidations+=1;}};
  const base='/api/v10/incident-command/incidents/:incidentId/protection-workflows',res=response();
  await posts.get(base)({req:request({}),res,params:{incidentId:'incident:test'},context:{actor:{id:'operator:test'}}});
  assert.equal(res.statusCode,201);
  assert.equal(invalidations,1);
});
