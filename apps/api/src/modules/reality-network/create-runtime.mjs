import path from 'node:path';
import { createLiveWildfireEvidenceContract } from '../../../../../packages/domain/src/reality-network/index.mjs';
import { AcquisitionStore } from '../acquisition/acquisition-store.mjs';
import { AppendOnlyOperationalEventJournal } from '../intelligence/append-only-event-journal.mjs';
import { OperationalIntelligenceService } from '../intelligence/operational-intelligence-service.mjs';
import { writeJsonAtomic } from '../../shared/json-file.mjs';
import { createRealityProviders } from './provider-factory.mjs';
import { PROVIDER_MANIFESTS } from './provider-portfolio.mjs';
import { ProviderStateStore } from './provider-state-store.mjs';
import { RawDataVault } from './raw-data-vault.mjs';
import { RealityNetworkRuntime } from './reality-network-runtime.mjs';
import { createRealityCoverageIndex,createRealitySourceRegistry } from './source-registry.mjs';

export async function createRealityNetworkRuntime({config,runtimeDir=config?.realityRuntimeDir??path.join(config?.projectRoot??process.cwd(),'data/runtime/reality-network'),reportFile=config?.realityReportFile??path.join(config?.projectRoot??process.cwd(),'data/validation/reality-network/latest-live-run.json'),fetchImpl=globalThis.fetch,clock=()=>new Date()}={}){
  const stateStore=new ProviderStateStore({filePath:path.join(runtimeDir,'provider-state.json')});
  const acquisitionStore=new AcquisitionStore({filePath:path.join(runtimeDir,'raw-vault-state.json'),archiveDir:path.join(runtimeDir,'bronze'),clock,maxArchiveBytes:2*1024*1024*1024,maxProviderArchiveBytes:512*1024*1024,maxProductBytes:20*1024*1024,maxProducts:20_000});
  const rawVault=new RawDataVault({acquisitionStore,stateStore}),sourceRegistry=createRealitySourceRegistry(),coverageIndex=createRealityCoverageIndex();
  const intelligence=new OperationalIntelligenceService({journal:new AppendOnlyOperationalEventJournal({filePath:path.join(runtimeDir,'operational-events-v4.jsonl'),clock}),sourceRegistry,clock});
  const providers=createRealityProviders({config,rawVault,stateStore,fetchImpl,clock});
  await stateStore.initialize();
  for(const manifest of PROVIDER_MANIFESTS){const prior=stateStore.provider(manifest.providerId),configuration=manifest.authentication.method==='NONE'||manifest.authentication.method==='AWS_NO_SIGN'?'PUBLIC':manifest.providerId==='nasa-firms'&&config?.firmsMapKey?'CONFIGURED':manifest.providerId==='copernicus-sentinel3-slstr'&&(config?.cdseAccessToken||(config?.cdseUsername&&config?.cdsePassword))?'CONFIGURED':'CREDENTIALS_REQUIRED',desired=manifest.providerId==='nasa-firms'&&!config?.firmsMapKey||manifest.providerId==='eumetsat-mtg-fci'&&!config?.eumetsatToken||manifest.providerId==='copernicus-sentinel3-slstr'&&configuration==='CREDENTIALS_REQUIRED'?'CREDENTIALS_REQUIRED':'READY',status=prior.lastAttemptAt?prior.status:desired;await stateStore.configure(manifest.providerId,{configuration,status});}
  const runtime=new RealityNetworkRuntime({providers,stateStore,rawVault,intelligence,sourceRegistry,coverageIndex,clock,reportWriter:(report)=>{const contract=createLiveWildfireEvidenceContract();return writeJsonAtomic(reportFile,{...report,contract:{id:contract.id,version:contract.version,fingerprint:contract.fingerprint}});}});
  await runtime.initialize();return runtime;
}
