import {mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
import {WorldKnowledgeStore} from '../apps/api/src/modules/intelligence/world-knowledge-store.mjs';
import {WorldKnowledgeService} from '../apps/api/src/modules/intelligence/world-knowledge-service.mjs';
import {OllamaIntelligenceModel} from '../apps/api/src/modules/intelligence/local-intelligence-model.mjs';
import {fetchApprovedSource} from '../apps/api/src/modules/intelligence/knowledge-sources.mjs';
import {RoadStateService} from '../apps/api/src/modules/intelligence/road-state-service.mjs';
const out='docs/handoffs/mega-v';await mkdir(out,{recursive:true});await mkdir('.tmp/mega-v/sources',{recursive:true});
const pool=new Pool({connectionString:await resolveLocalDatabaseUrl()}),store=new WorldKnowledgeStore({pool}),knowledge=new WorldKnowledgeService({store,model:new OllamaIntelligenceModel({enabled:false})});
const sources=[
 {url:'https://www.ulsac.min-saude.pt/2025/11/28/areas-clinicas/',provider:'ULS Alentejo Central',authority:'OWNER',format:'HTML',adapter:'ULSAC_EMERGENCY_SERVICE',publishedAt:'2025-11-28T00:00:00Z',sourceUpdatedAt:'2026-09-04T00:00:00Z',family:'HEALTH_CAPABILITY',pollIntervalMs:86400000},
 {url:'https://www.cm-evora.pt/wp-content/uploads/2020/07/Plano_Municipal_Emergencia_Protecao_Civil_Evora_2024-1.pdf',provider:'Câmara Municipal de Évora — Plano Municipal de Emergência 2024',authority:'MUNICIPAL',format:'PDF',adapter:'EVORA_EMERGENCY_PLAN',sourceUpdatedAt:'2024-06-14T07:17:25Z',family:'CIVIL_PROTECTION_DESIGNATION',pollIntervalMs:86400000}
];const report={at:new Date().toISOString(),lane:'AUTHORITATIVE_SOURCE_ACQUISITION',sources:[],modelCalls:0};
try{
 await knowledge.initialize();
 for(const [i,source]of sources.entries())try{const raw=await fetchApprovedSource(source);await writeFile(`.tmp/mega-v/sources/${i}.${source.format.toLowerCase()}`,raw.bytes);const result=await knowledge.ingest(raw.bytes,source,{reviewed:source.adapter==='EVORA_EMERGENCY_PLAN'});const doc=(await store.read()).documents.find(d=>d.id===result.documentId);report.sources.push({source,bytes:raw.bytes.length,contentHash:raw.contentHash,result,passages:doc?{documentId:doc.id,knownAt:doc.retrievedAt,text:doc.text}:null});console.log(source.family,result.state,result.accepted);}catch(e){report.sources.push({source,state:'UNAVAILABLE',error:e.message});console.log(source.family,e.message);}
 const roads=new RoadStateService({pool});await roads.initialize();report.roads={refresh:await roads.refresh(),status:roads.state.status,snapshot:roads.state.snapshots[0],context:roads.context()};
 report.entities=(await store.read()).entities.filter(e=>e.capabilities?.emergencyDepartment||e.capabilities?.fireResponse||e.designation?.kind).map(e=>({id:e.id,name:e.canonicalName,type:e.canonicalType,subtype:e.subtype,externalIds:e.externalIds,capabilities:e.capabilities,designation:e.designation,activation:e.activation,location:e.location,provenance:e.provenance}));
}finally{await pool.end();await writeFile(out+'/source-acquisition.json',JSON.stringify(report,null,2));}
