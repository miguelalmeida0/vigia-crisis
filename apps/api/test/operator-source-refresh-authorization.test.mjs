import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { Router } from '../src/http/router.mjs';
import { registerWorldRoutes } from '../src/modules/world/world-routes.mjs';
import { registerFieldNetRoutes } from '../src/modules/fieldnet/fieldnet-routes.mjs';

function response(){return{statusCode:null,body:'',headers:{},setHeader(name,value){this.headers[name]=value;},writeHead(status,headers={}){this.statusCode=status;Object.assign(this.headers,headers);},end(value=''){this.body+=value;}};}
async function dispatch(router,actor,{intent=false}={}){const req=Readable.from([]);Object.assign(req,{method:'POST',url:'/api/v1/world/refresh',headers:{host:'127.0.0.1:4177',...(intent?{'x-vigia-operator-intent':'operator-console'}:{})},socket:{remoteAddress:'127.0.0.1'}});const res=response();await router.safeHandle(req,res,{actor});return res;}

test('source refresh requires capability and local operator intent',async()=>{
  let refreshes=0;const router=new Router();registerWorldRoutes(router,{worldService:{refresh:async()=>{refreshes+=1;return{changed:false,snapshot:{meta:{generatedAt:'2026-08-21T12:00:00Z'}}};},snapshot:async()=>({})}});
  const authentication={authenticated:true,mode:'local_shadow_session'};
  assert.equal((await dispatch(router,{id:'viewer',role:'viewer',authentication},{intent:true})).statusCode,403);
  assert.equal((await dispatch(router,{id:'supervisor',role:'supervisor',authentication})).statusCode,403);
  assert.equal((await dispatch(router,{id:'supervisor',role:'supervisor',authentication},{intent:true})).statusCode,200);
  assert.equal(refreshes,1);
});

test('FieldNet reconciliation requires evidence-read authority',async()=>{
  const router=new Router();registerFieldNetRoutes(router,{centralFieldNetService:{status:()=>({state:'ready'}),snapshot:()=>({incidentId:'PT-1',nodes:[{id:'node-1'}]})},fieldSensorQualificationService:{status:async()=>({})},releaseIdentityService:{identity:()=>({})}});
  const get=async actor=>{const req=Readable.from([]);Object.assign(req,{method:'GET',url:'/api/v10/fieldnet/reconciliation/PT-1',headers:{host:'127.0.0.1:4177'},socket:{remoteAddress:'127.0.0.1'}});const res=response();await router.safeHandle(req,res,{actor});return res;};
  assert.equal((await get({id:'public',role:'public_viewer',authentication:{authenticated:false}})).statusCode,401);
  assert.equal((await get({id:'supervisor',role:'supervisor',incidentScopes:['PT-1'],authentication:{authenticated:true}})).statusCode,200);
});
