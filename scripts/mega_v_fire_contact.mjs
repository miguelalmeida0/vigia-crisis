import {Pool} from 'pg';import {writeFile} from 'node:fs/promises';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
import {WorldKnowledgeStore} from '../apps/api/src/modules/intelligence/world-knowledge-store.mjs';
import {WorldKnowledgeService} from '../apps/api/src/modules/intelligence/world-knowledge-service.mjs';
import {OllamaIntelligenceModel} from '../apps/api/src/modules/intelligence/local-intelligence-model.mjs';
import {fetchApprovedSource} from '../apps/api/src/modules/intelligence/knowledge-sources.mjs';
const source={url:'https://centraldecompras.cimac.pt/entidade/view?id=29',provider:'Comunidade Intermunicipal do Alentejo Central',authority:'MUNICIPAL',format:'HTML',adapter:'CIMAC_FIRE_CONTACT',family:'FIRE_PUBLIC_CONTACT',pollIntervalMs:86400000};
const pool=new Pool({connectionString:await resolveLocalDatabaseUrl()}),store=new WorldKnowledgeStore({pool}),service=new WorldKnowledgeService({store,model:new OllamaIntelligenceModel({enabled:false})});
try{await service.initialize();const raw=await fetchApprovedSource(source),result=await service.ingest(raw.bytes,source);await writeFile('docs/handoffs/mega-v/fire-contact-acquisition.json',JSON.stringify({at:new Date().toISOString(),source,bytes:raw.bytes.length,contentHash:raw.contentHash,result,entity:await service.entity('osm:way:481130645'),modelCalls:0},null,2));console.log(JSON.stringify({state:result.state,accepted:result.accepted}));}finally{await pool.end();}
