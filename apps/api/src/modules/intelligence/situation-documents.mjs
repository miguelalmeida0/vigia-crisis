import {assertCan,assertIncidentScope,canonicalIncidentId} from '../../../../../packages/domain/src/authorization.mjs';
import {hash,normalize,validateCandidate,materializeEntity} from '../../../../../packages/domain/src/intelligence/world-knowledge.mjs';
import {parseDocument,approvedURL,plainText} from './knowledge-sources.mjs';
const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const hostile=/\b(ignore|instructions|instrucoes|system prompt|execute|executa|sql|curl|override|sudo)\b/;
export function extractSituationDocument(text,facilities=[]){
  const candidates=[],references={roads:[],dates:[],municipalities:[],facilities:[]};const segments=[...text.matchAll(/[^\n]+/g)].slice(0,1000);
  for(const m of segments){const passage=m[0].trim(),q=normalize(passage);if(!passage||passage.length>2000||hostile.test(q))continue;
    const dates=passage.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})/g)??[];
    const validity=dates.length===2&&dates.every(d=>Number.isFinite(Date.parse(d)))&&Date.parse(dates[0])<Date.parse(dates[1])?{validFrom:new Date(dates[0]).toISOString(),validUntil:new Date(dates[1]).toISOString()}:{validFrom:null,validUntil:null};
    const base={sourceText:passage,sourceLocator:{start:m.index+m[0].indexOf(passage),end:m.index+m[0].indexOf(passage)+passage.length},...validity,extractionMethod:'DETERMINISTIC_PASSAGE',state:'REVIEW_REQUIRED'};
    const add=fact=>candidates.push({...base,id:'candidate:'+hash([base.sourceLocator,fact]),fact});
    const negated=/\b(nao|sem|antigo|anterior|historico|talvez|possivel)\b/.test(q);
    const roads=[...new Set((passage.match(/\b(?:EN|N|A|IP|IC|EM)\s?\d{1,4}(?:-\d+)?\b/g)??[]).map(r=>r.replace(/\s/g,'')))];
    for(const value of roads)references.roads.push({value,sourceText:passage,sourceLocator:base.sourceLocator});
    for(const value of dates)references.dates.push({value,sourceText:passage,sourceLocator:base.sourceLocator});
    const municipality=passage.match(/Munic[ií]pio:\s*([^;\n.]+)/i);if(municipality)references.municipalities.push({value:municipality[1].trim(),sourceText:passage,sourceLocator:base.sourceLocator});
    if(!negated&&/\b(encerrad[ao]s?|cortad[ao]s?|interdit[ao]s?)\b/.test(q))for(const road of roads)add({kind:'ROAD_RESTRICTION',roadRef:road,state:'CLOSED'});
    const matched=facilities.filter(f=>f.canonicalName&&q.includes(normalize(f.canonicalName)));
    for(const f of matched)references.facilities.push({entityId:f.id,value:f.canonicalName,sourceText:passage,sourceLocator:base.sourceLocator});
    if(matched.length!==1||negated)continue;const f=matched[0],field=(predicate,value)=>add({kind:'FACILITY_FACT',entityId:f.id,subjectCandidate:f.canonicalName,predicate,value});
    const phones=[...new Set((passage.match(/(?:\+351[ -]?)?\b[29]\d(?:[ -]?\d){7}\b/g)??[]))];if(phones.length===1&&/telefone|contacto/i.test(passage))field('contact.phone',phones[0]);
    const address=passage.match(/Morada:\s*([^;\n]+)/i);if(address)field('address.street',address[1].trim());
    if(/servico de urgencia (?:confirmado|disponivel)|dispoe de servico de urgencia/.test(q))field('capabilities.emergencyDepartment',true);
    if(/resposta a incendios confirmada/.test(q))field('capabilities.fireResponse',true);
    if(/refugio oficial (?:designado|para incendios)/.test(q))field('designation.kind','WILDFIRE_REFUGE');
    if(/centro de acolhimento ativado/.test(q)&&['temporary_reception_center','official_wildfire_refuge'].includes(f.canonicalType))field('activation.state','ACTIVATED');
  }
  return{candidates:candidates.slice(0,100),references,modelState:'DISABLED',limitations:['Conservative literal extraction. Dates without an explicit UTC offset remain unresolved. Ambiguous, negative and instruction-like passages are withheld. All candidates require operator review.']};
}
export class SituationDocuments{
  constructor({service,knowledge,clock=()=>new Date()}){Object.assign(this,{service,knowledge,clock});}
  async sources(actor){assertCan(actor,'submit:evidence');return(await this.knowledge.store.read()).sources.filter(s=>['OWNER','GOVERNMENT','MUNICIPAL'].includes(s.authority)).map(s=>({id:s.id??s.url,provider:s.provider,url:s.url,authority:s.authority}));}
  async upload(actor,{incidentId,sourceId,format,contentBase64,filename}){
    assertCan(actor,'submit:evidence');assertIncidentScope(actor,incidentId);incidentId=canonicalIncidentId(incidentId);
    if(!['TXT','HTML','PDF'].includes(format)||typeof contentBase64!=='string'||contentBase64.length>7000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64))throw fail('document_format_or_size_invalid');
    const source=(await this.knowledge.store.read()).sources.find(s=>(s.id??s.url)===sourceId);if(!source||!['OWNER','GOVERNMENT','MUNICIPAL'].includes(source.authority))throw fail('registered_authoritative_source_required');approvedURL(source.url);
    const bytes=Buffer.from(contentBase64,'base64');if(!bytes.length)throw fail('document_empty');if(format==='PDF'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw fail('pdf_header_invalid');
    let parsed;try{parsed=await parseDocument(bytes,{...source,format,adapter:null});}catch(error){if(format==='PDF'&&error.code==='ENOENT')throw fail('pdf_parser_unavailable',503);throw error;}
    if(format==='HTML')parsed.text=parsed.rawText.replace(/<(script|style)[\s\S]*?<\/\1>/gi,'').replace(/<\/(?:p|div|li|tr|h[1-6])>|<br\s*\/?\s*>/gi,'\n').split('\n').map(plainText).filter(Boolean).join('\n');
    const view=await this.service.snapshot(incidentId),extraction=extractSituationDocument(parsed.text,view.snapshot?.facilities??[]),knownAt=this.clock().toISOString();
    if(!extraction.candidates.length&&parsed.text.length<=16000){
      const result=await this.knowledge.model?.extract?.({text:parsed.text,sourceUrl:source.url});
      extraction.modelState=result?.state??'DISABLED';
      for(const c of result?.candidates??[]){
        const matches=(view.snapshot?.facilities??[]).filter(f=>f.canonicalName===c.subjectCandidate),start=parsed.text.indexOf(c.sourceText);
        if(matches.length!==1||start<0||!c.sourceText.includes(c.value))continue;
        extraction.candidates.push({id:'candidate:'+hash([c.subjectCandidate,c.predicate,c.value,c.sourceText]),fact:{kind:'FACILITY_FACT',entityId:matches[0].id,predicate:c.predicate,value:c.value},sourceText:c.sourceText,sourceLocator:{start,end:start+c.sourceText.length},validFrom:c.validFrom??null,validUntil:c.validUntil??null,extractionMethod:'LOCAL_MODEL_REQUIRES_REVIEW'});
      }
    }
    if(format==='PDF')for(const c of extraction.candidates)c.sourceLocator.page=parsed.text.slice(0,c.sourceLocator.start).split('\f').length;
    const doc={id:'situation-doc:'+hash([incidentId,sourceId,hash(bytes)]),incidentId,knownAt,filename:String(filename??'Source document').replace(/[\u0000-\u001f]/g,'').slice(0,160),format,source:{id:sourceId,url:source.url,provider:source.provider,authority:source.authority},contentHash:hash(bytes),text:parsed.text,...extraction,submittedBy:actor.id,trust:'UPLOADED_COPY_REQUIRES_HUMAN_VERIFICATION'};
    const existing=await this.service.store.document(doc.id);if(existing)return existing;await this.service.store.saveDocument(doc);return doc;
  }
  async review(actor,{incidentId,documentId,candidateId,decision}){
    assertCan(actor,'review:incident');assertIncidentScope(actor,incidentId);incidentId=canonicalIncidentId(incidentId);
    if(!['ACCEPT','REJECT'].includes(decision))throw fail('review_decision_required');const doc=await this.service.store.document(documentId);if(!doc||doc.incidentId!==incidentId)throw fail('document_not_in_incident',404);
    const c=doc.candidates.find(c=>c.id===candidateId);if(!c||doc.text.slice(c.sourceLocator.start,c.sourceLocator.end)!==c.sourceText)throw fail('candidate_passage_invalid');
    const prior=(await this.service.store.admissions(incidentId)).find(a=>a.documentId===documentId&&a.candidateId===candidateId);if(prior)return prior;
    const at=this.clock().toISOString();let verdict=null;
    if(decision==='ACCEPT'){
      if(c.fact.kind==='ROAD_RESTRICTION'&&(!c.validFrom||!c.validUntil||Date.parse(c.validUntil)<=Date.parse(at)))throw fail('current_explicit_validity_required');
      if(c.fact.kind==='FACILITY_FACT'){
        const f=this.knowledge.cache.get(c.fact.entityId);if(!f)throw fail('canonical_facility_not_found');
        verdict=validateCandidate({...c,...c.fact,sourceLocator:JSON.stringify(c.sourceLocator),extractionMethod:'REVIEWED_PASSAGE'},{...doc,retrievedAt:doc.knownAt},{now:at,reviewed:true});if(!verdict.accepted)throw fail(verdict.reason);
        await this.knowledge.store.mutate(state=>{const entity=state.entities.find(e=>e.id===c.fact.entityId&&!e.redirectTo);if(!entity)throw fail('canonical_facility_not_found');if(!state.documents.some(d=>d.id===doc.id))state.documents.push({...doc,retrievedAt:doc.knownAt,pipelineVersion:'reviewed-situation-document-v1',extractionState:'REVIEWED'});const fact={...verdict.fact,entityId:entity.id};if(!state.facts.some(f=>f.id===fact.id))state.facts.push(fact);Object.assign(entity,materializeEntity(entity,state.facts.filter(f=>f.entityId===entity.id),{now:at}));});await this.knowledge.refreshCache();await this.service.changedEntities([c.fact.entityId]);
      }
    }
    const admission={id:'admission:'+hash([documentId,candidateId,decision]),incidentId,documentId,candidateId,decision,knownAt:at,source:doc.source,sourceText:c.sourceText,sourceLocator:c.sourceLocator,fact:c.fact,validFrom:c.validFrom,validUntil:c.validUntil,reviewedBy:actor.id};
    await this.service.store.admit(admission);if(decision==='ACCEPT')await this.service.store.enqueue(incidentId,{reason:'REVIEWED_DOCUMENT_ADMISSION'},at);return admission;
  }
}
