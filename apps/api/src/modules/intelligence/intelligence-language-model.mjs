import {readFileSync} from 'node:fs';
import {EXTRACTION_SCHEMA} from './local-intelligence-model.mjs';

export function qualifiedReceipt(receipt,model){
 const m=receipt?.metrics;return receipt?.model===model&&receipt?.selected===true&&receipt?.startup?.passed===50&&receipt?.startup?.attempts===50&&m?.cases>=100&&m.completion>=.99&&m.structured>=.98&&m.intentAccuracy>=.95&&m.extractionPrecision>=.95&&m.abstention>=.95&&m.p95Ms<=3000;
}
export class DisabledModel {
 async health(){return{state:'disabled',model:null,inferenceVerified:false};}
 async extract(){return{state:'disabled',candidates:[]};}
 async intent(){return null;}
 classify(input){return this.extract(input);}
 resolveCandidate(input){return this.extract(input);}
}
export class MLXLocalModel extends DisabledModel {
 constructor({endpoint='http://127.0.0.1:11438',model='mlx-community/Qwen3.5-2B-MLX-4bit',receipt=null,fetchImpl=fetch,timeoutMs=3000}={}){super();const u=new URL(endpoint);if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password)throw Error('local_model_endpoint_required');Object.assign(this,{endpoint,model,fetchImpl,timeoutMs});this.qualified=qualifiedReceipt(receipt,model);this.metrics={calls:0,rejected:0,failed:0};}
 async health(){if(!this.qualified)return{state:'disabled',model:this.model,reason:'QUALIFICATION_REQUIRED',metrics:this.metrics};try{const r=await this.fetchImpl(this.endpoint+'/health',{signal:AbortSignal.timeout(1000)}),h=await r.json();return {...h,state:r.ok&&h.model===this.model?'available':'offline',inferenceVerified:false,metrics:this.metrics};}catch{return{state:'offline',model:this.model,metrics:this.metrics};}}
 async request(task,input,schema){if(!this.qualified)return null;this.metrics.calls++;try{const r=await this.fetchImpl(this.endpoint+'/infer',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(this.timeoutMs),body:JSON.stringify({task,input,schema})});if(!r.ok)throw Error('model_unavailable');const text=await r.text();if(text.length>50000)throw Error('model_output_bound');return JSON.parse(text).output;}catch{this.metrics.failed++;return null;}}
 async intent({question,tools,entities=[],roads=[],communities=[]}){if(typeof question!=='string'||question.length>800)return null;const output=await this.request('intent',{question,tools,entities:entities.slice(0,60),roads:roads.slice(0,40),communities:communities.slice(0,60)},{type:'object',additionalProperties:false,properties:{tool:{type:'string',enum:tools},args:{type:'object'}},required:['tool','args']});if(!output||Object.keys(output).some(k=>!['tool','args'].includes(k))||!tools.includes(output.tool)||!output.args||Array.isArray(output.args)){this.metrics.rejected++;return null;}return output;}
 async extract({text,sourceUrl}){if(typeof text!=='string'||text.length>16000)return{state:'no_supported_value',candidates:[]};const output=await this.request('extract',{text,sourceUrl},EXTRACTION_SCHEMA),allowed=EXTRACTION_SCHEMA.properties.candidates.items.properties.predicate.enum;
  if(!output||!['supported','insufficient_information','ambiguous','no_supported_value'].includes(output.state)||!Array.isArray(output.candidates)||output.candidates.length>30||output.candidates.some(c=>!allowed.includes(c.predicate)||typeof c.sourceText!=='string'||!text.includes(c.sourceText)||typeof c.value!=='string'||!c.sourceText.includes(c.value)||typeof c.subjectCandidate!=='string'||!c.sourceText.includes(c.subjectCandidate)||/\b(não|nao|never|not|ignore|instruç|instruction)\b/i.test(c.sourceText))){this.metrics.rejected++;return{state:'no_supported_value',candidates:[]};}
  return {...output,candidates:output.candidates.map(c=>({...c,extractionMethod:'LOCAL_MODEL'}))};
 }
}
export function createLanguageModel(){
 if(!process.env.VIGIA_MLX_QUALIFICATION_FILE)return new DisabledModel();
 try{return new MLXLocalModel({endpoint:process.env.VIGIA_MLX_URL,model:process.env.VIGIA_LOCAL_MODEL??'mlx-community/Qwen3.5-2B-MLX-4bit',receipt:JSON.parse(readFileSync(process.env.VIGIA_MLX_QUALIFICATION_FILE,'utf8'))});}catch{return new DisabledModel();}
}
