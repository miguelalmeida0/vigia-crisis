import pg from 'pg';
import { DependencyUnavailableError,isPostgresAvailabilityError } from '../storage/dependency-error.mjs';

export class PostgresReleaseDeploymentIdentityStore{
  constructor({databaseUrl='',pool=null,releaseIdentity,clock=()=>new Date(),connectionTimeoutMs=3_000,statementTimeoutMs=15_000}={}){
    this.pool=pool??(databaseUrl?new pg.Pool({connectionString:databaseUrl,application_name:'vigia-release-deployment-identity',connectionTimeoutMillis:connectionTimeoutMs,statement_timeout:statementTimeoutMs,max:1}):null);
    this.ownsPool=!pool&&Boolean(this.pool);this.releaseIdentity=releaseIdentity;this.clock=clock;this.ready=false;this.lastRecordedAt=null;this.pool?.on?.('error',()=>{this.ready=false;});
  }
  #unavailable(){return new DependencyUnavailableError({dependency:'postgis',capability:'release-deployment-identity',code:'release_deployment_identity_unavailable',message:'The exact release identity could not be bound to the deployment database.',retryable:true,state:this.pool?'degraded':'not_configured'});}
  status(){return{state:this.ready?'ready':this.pool?'degraded':'not_configured',releaseId:this.releaseIdentity?.releaseId??null,codeStateHash:this.releaseIdentity?.codeStateHash??null,operationalDataHash:this.releaseIdentity?.operationalDataHash??null,releaseStatementHash:this.releaseIdentity?.releaseStatementHash??null,migrationHead:this.releaseIdentity?.migrationHead??null,recordedAt:this.lastRecordedAt};}
  async initialize(){
    if(!this.releaseIdentity?.releaseId||!/^sha256:[a-f0-9]{64}$/.test(String(this.releaseIdentity.codeStateHash??''))||!/^sha256:[a-f0-9]{64}$/.test(String(this.releaseIdentity.operationalDataHash??''))||!/^sha256:[a-f0-9]{64}$/.test(String(this.releaseIdentity.releaseStatementHash??''))||!this.releaseIdentity?.migrationHead)throw this.#unavailable();
    if(!this.pool)return this.status();
    const recordedAt=this.clock().toISOString();
    try{
      const result=await this.pool.query("INSERT INTO vigia_release_deployment_identity(singleton,release_id,code_state_hash,operational_data_hash,release_statement_hash,migration_head,recorded_at) VALUES('current',$1,$2,$3,$4,$5,$6) ON CONFLICT(singleton) DO UPDATE SET release_id=excluded.release_id,code_state_hash=excluded.code_state_hash,operational_data_hash=excluded.operational_data_hash,release_statement_hash=excluded.release_statement_hash,migration_head=excluded.migration_head,recorded_at=excluded.recorded_at RETURNING release_id,code_state_hash,operational_data_hash,release_statement_hash,migration_head,recorded_at",[this.releaseIdentity.releaseId,this.releaseIdentity.codeStateHash,this.releaseIdentity.operationalDataHash,this.releaseIdentity.releaseStatementHash,this.releaseIdentity.migrationHead,recordedAt]);
      const row=result.rows[0];
      if(row?.release_id!==this.releaseIdentity.releaseId||row?.code_state_hash!==this.releaseIdentity.codeStateHash||row?.operational_data_hash!==this.releaseIdentity.operationalDataHash||row?.release_statement_hash!==this.releaseIdentity.releaseStatementHash||row?.migration_head!==this.releaseIdentity.migrationHead)throw new Error('release_deployment_identity_write_mismatch');
      this.ready=true;this.lastRecordedAt=row.recorded_at?.toISOString?.()??recordedAt;return this.status();
    }catch(error){this.ready=false;if(isPostgresAvailabilityError(error))throw this.#unavailable();throw error;}
  }
  async close(){this.ready=false;if(this.ownsPool)await this.pool?.end();}
}
