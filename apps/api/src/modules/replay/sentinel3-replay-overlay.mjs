import { haversineKm } from '../../../../../packages/domain/src/geo.mjs';

const HOUR=3_600_000;
const validTime=(value)=>Number.isFinite(Date.parse(value??''));
const productIds=(snapshot)=>[...new Set(snapshot?.state?.rawSourceProductIds??[])];
function caseWindow(item){const start=Date.parse(item.alertAt)-12*HOUR,end=Date.parse(item.extinctionAt??item.alertAt)+24*HOUR;return{start,end};}
function assign(point,cases){
  const at=Date.parse(point.observedAt),candidates=cases.map((item)=>{const window=caseWindow(item),distanceKm=haversineKm(item.coordinate,point.coordinate);return distanceKm<=12&&at>=window.start&&at<=window.end?{item,distanceKm}:null;}).filter(Boolean);
  return candidates.sort((a,b)=>a.distanceKm-b.distanceKm||Math.abs(at-Date.parse(a.item.alertAt))-Math.abs(at-Date.parse(b.item.alertAt)))[0]??null;
}
function sourceProduct(item){return{id:item.id,provider:item.provider,authority:'Copernicus Data Space Ecosystem / ESA',platform:String(item.sourceId).split(':').at(-1),instrument:'SLSTR',kind:'sentinel3_slstr_frp_archive',state:'archived_verified',checksumSha256:item.checksumSha256,bytes:item.byteLength,url:item.originalUri,providerUpdatedAt:item.sourceTimestamp,receivedAt:item.receivedAt,collection:item.requestWindow?.collection??null,parserVersion:item.parserVersion,normalizerVersion:item.normalizerVersion};}
function record(point,match){
  const caseId=match?.item.id??null,id=caseId?`${caseId}:thermal:${point.id}`:`replay:sentinel3:${point.id}`;
  return{id,caseId,kind:'thermal',arrivalAt:point.observedAt,payload:{...point,id,replayCaseId:caseId,distanceToOfficialReportKm:match?Number(match.distanceKm.toFixed(3)):null,provenance:{...point.provenance,provider:'Copernicus Data Space Ecosystem',evidenceUniverse:'official_archive_replay',timingQualification:'Archive sensing time; provider delivery latency was not retained. Retrieval time remains in raw-product lineage.'}}};
}

export function sentinel3ReplayOverlay({corpus,snapshot,acquisitionStore}){
  const historical=snapshot?.state?.selectionMode==='governed_window'&&snapshot?.state?.catalogueWindow?.collection?.endsWith('-ntc');
  if(!historical)return{applied:false,reason:'not_historical_ntc',corpus,products:[],sourceProducts:[],summary:null};
  const ids=productIds(snapshot),products=ids.map((id)=>acquisitionStore?.getProduct(id)).filter(Boolean),points=(snapshot.data??[]).filter((item)=>validTime(item.observedAt)&&Array.isArray(item.coordinate));
  const assignments=points.map((point)=>({point,match:assign(point,corpus.cases??[])})),records=assignments.map(({point,match})=>record(point,match));
  const byCase=new Map();for(const item of assignments)if(item.match){const rows=byCase.get(item.match.item.id)??[];rows.push(item.point);byCase.set(item.match.item.id,rows);}
  const cases=(corpus.cases??[]).map((item)=>{const rows=byCase.get(item.id)??[],platforms=[...new Set([...(item.independentPlatforms??[]),...rows.map((row)=>row.satellite).filter(Boolean)])],families=[...new Set(['viirs',...rows.map((row)=>row.sourceFamily).filter(Boolean)])];return{...item,thermalObservationCount:(item.thermalObservationCount??0)+rows.length,independentPlatforms:platforms,physicalSourceFamilies:families,twoPhysicalFamilies:families.length>=2,sentinel3ObservationCount:rows.length};});
  const summary={state:records.length?'historical_evidence_ready':products.length?'product_archived_no_qualifying_points':'no_product_acquired',collection:snapshot.state.catalogueWindow.collection,productCount:products.length,observationCount:records.length,assignedObservationCount:assignments.filter((item)=>item.match).length,unassignedObservationCount:assignments.filter((item)=>!item.match).length,caseCount:byCase.size,rawSourceProductIds:ids};
  return{applied:true,corpus:{...corpus,metadata:{...corpus.metadata,sentinel3Overlay:summary},cases,records:[...(corpus.records??[]),...records].sort((a,b)=>Date.parse(a.arrivalAt)-Date.parse(b.arrivalAt)||a.id.localeCompare(b.id))},products,sourceProducts:products.map(sourceProduct),summary};
}
