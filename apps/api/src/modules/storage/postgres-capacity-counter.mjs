import { guardPostgresClient,postgresClientFailure,releasePostgresClient } from './postgres-client-guard.mjs';
const normalizeScopes=(scopes)=>[...new Map((scopes??[]).map(({kind,id})=>[`${String(kind)}\0${String(id)}`,{kind:String(kind),id:String(id)}])).values()].sort((left,right)=>left.kind.localeCompare(right.kind)||left.id.localeCompare(right.id));

export async function beginCapacityTransaction(client){
  const state=guardPostgresClient(client);
  if(state.failure)throw state.failure;
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='8s'; SET LOCAL idle_in_transaction_session_timeout='30s'");
}

export async function commitCapacityTransaction(client){
  const state=guardPostgresClient(client);
  if(state.failure)throw state.failure;
  await client.query('COMMIT');
  if(state.failure)throw state.failure;
}

export function capacityTransactionFailure(client,error){return postgresClientFailure(client,error);}

export function releaseCapacityTransaction(client){
  releasePostgresClient(client);
}

export async function lockCapacityCounters(client,ledger,scopes){
  try{
    const usage={};
    for(const scope of normalizeScopes(scopes)){
      await client.query('INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes) VALUES($1,$2,$3,0,0) ON CONFLICT (ledger,scope_kind,scope_id) DO NOTHING',[ledger,scope.kind,scope.id]);
      const result=await client.query('SELECT rows,bytes FROM vigia_capacity_counter WHERE ledger=$1 AND scope_kind=$2 AND scope_id=$3 FOR UPDATE',[ledger,scope.kind,scope.id]);
      if(result.rowCount!==1)throw new Error('capacity_counter_unavailable');
      usage[scope.kind]={rows:Number(result.rows[0].rows),bytes:Number(result.rows[0].bytes)};
    }
    return usage;
  }catch(error){if(['55P03','57014'].includes(String(error?.code??'').toUpperCase()))throw Object.assign(new Error('capacity_counter_busy'),{statusCode:503,code:'CAPACITY_COUNTER_BUSY'});throw error;}
}
