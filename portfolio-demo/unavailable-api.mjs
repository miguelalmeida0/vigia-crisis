// The static public artifact has no operational transport or mutation capability.
const unavailable=()=>{throw new Error('Operational services are not connected in the portfolio scenario.');};
export const PROTECTION_MUTATION_TIMEOUT_MS=0;
export const idempotentMutationRequest=unavailable;
export const situationRequest=unavailable;
export const situationDocumentSources=unavailable;
export const teamRequest=unavailable;
export const collectionRequest=unavailable;
export const vigiaApi=new Proxy(Object.freeze({}),{get:()=>unavailable});
export const backendAsset=()=>'';
export const thermalOverlayUrl=()=>'';
export const basemapTileUrl=()=>'';
