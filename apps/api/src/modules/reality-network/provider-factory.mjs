import { EcmwfRealityProvider } from './providers/ecmwf-provider.mjs';
import { FirmsRealityProvider } from './providers/firms-provider.mjs';
import { GoesRealityProvider } from './providers/goes-provider.mjs';
import { FedsRealityProvider,WfigsRealityProvider } from './providers/official-perimeter-providers.mjs';
import { NwsCapRealityProvider } from './providers/nws-cap-provider.mjs';
import { OsmContextRealityProvider } from './providers/osm-context-provider.mjs';

export function createRealityProviders({config,rawVault,stateStore,fetchImpl=globalThis.fetch,clock=()=>new Date()}={}){
  const shared={rawVault,stateStore,fetchImpl,clock};
  const providers={
    firms:new FirmsRealityProvider({...shared,mapKey:config?.firmsMapKey,pythonPath:config?.geoPython}),
    goes:new GoesRealityProvider({...shared,pythonPath:config?.geoPython}),
    wfigs:new WfigsRealityProvider(shared),feds:new FedsRealityProvider(shared),nws:new NwsCapRealityProvider(shared),
    ecmwf:new EcmwfRealityProvider({...shared,pythonPath:config?.geoPython}),osm:new OsmContextRealityProvider(shared)
  };
  return Object.freeze(providers);
}
