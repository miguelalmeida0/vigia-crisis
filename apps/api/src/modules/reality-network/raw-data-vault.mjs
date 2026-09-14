import { semanticHash,uniqueSorted } from '../../../../../packages/domain/src/intelligence/shared.mjs';

export class RawDataVault{
  constructor({acquisitionStore,stateStore}={}){if(!acquisitionStore||!stateStore)throw new Error('raw_vault_dependencies_required');this.acquisitionStore=acquisitionStore;this.stateStore=stateStore;}
  async initialize(){await Promise.all([this.acquisitionStore.initialize(),this.stateStore.initialize()]);return this.status();}
  status(){const acquisition=this.acquisitionStore.status(),runtime=this.stateStore.status();return{schemaVersion:'vigia.raw-data-vault-status.v1',layer:'BRONZE',rawProductCount:acquisition.rawProductCount,archiveBytes:acquisition.archiveBytes,retrievalCount:runtime.retrievals.length,limits:acquisition.limits};}
  async preserve({providerId,sourceId,providerProductId,body,requestIdentity,response={},licenceId,parserVersion,requestWindow,fetchRunId,retrievedAt=new Date().toISOString()}={}){
    if(String(requestIdentity).includes('REDACTED')===false&&/[?&](?:key|token|map_key|api_key)=/i.test(String(requestIdentity)))throw new Error('raw_vault_secret_bearing_request_identity');
    const archived=await this.acquisitionStore.archiveReceivedProduct({provider:providerId,sourceId,providerProductId,body,contentType:response.contentType,httpStatus:response.status,originalUri:requestIdentity,licenceMetadata:{licenceId},acquisitionRunId:fetchRunId,requestWindow,requestedAt:retrievedAt,acquisitionTimings:{downloadCompletedAt:retrievedAt}});
    const accepted=await this.acquisitionStore.acceptProduct(archived.product.id,{providerProductId,parserVersion,sourceTimestamp:response.sourceTimestamp,sourceTimestampRange:response.sourceTimestampRange});
    const record=await this.stateStore.recordRetrieval({schemaVersion:'vigia.raw-retrieval.v1',providerId,sourceId,fetchRunId,retrievedAt,requestIdentity,httpStatus:response.status,responseHeaders:structuredClone(response.headers??{}),contentType:response.contentType,contentLength:body.length,etag:response.headers?.etag??null,providerVersion:response.providerVersion??null,rawContentHash:accepted.product.checksumSha256,rawObjectRef:accepted.product.originalUriOrObjectKey,rawProductId:accepted.product.id,licenceId,parserVersion,canonicalEventIds:[],outcome:'PRESERVED'});
    return{product:accepted.product,retrieval:record,duplicate:archived.duplicate};
  }
  async bindOutcome(retrieval,{canonicalEventIds=[],outcome='ACCEPTED',reasons=[]}={}){return this.stateStore.recordRetrieval({...retrieval,canonicalEventIds:uniqueSorted(canonicalEventIds),outcome,reasons:uniqueSorted(reasons),bindingHash:semanticHash('raw-canonical-binding',{rawContentHash:retrieval.rawContentHash,canonicalEventIds:uniqueSorted(canonicalEventIds),outcome})});}
}
