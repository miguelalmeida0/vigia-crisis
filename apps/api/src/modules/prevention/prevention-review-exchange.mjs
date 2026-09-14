import { readJson } from '../../shared/json-file.mjs';

const EXPORT_SCHEMA='vigia.prevention.blinded-expert-review-pack.v1';
const IMPORT_SCHEMA='vigia.prevention.completed-expert-reviews.v1';
const REVIEWER_CLASSES=Object.freeze([
  {reviewerType:'REMOTE_SENSING_EXPERT_REVIEW',qualification:'remote_sensing_expert',label:'Remote-sensing expert'},
  {reviewerType:'WILDFIRE_EXPERT_REVIEW',qualification:'wildfire_prevention_domain_expert',label:'Wildfire expert'},
  {reviewerType:'FORESTRY_EXPERT_REVIEW',qualification:'forestry_expert',label:'Forestry expert'},
  {reviewerType:'DEVELOPER_REVIEW',qualification:null,label:'Developer · excluded from expert precision'}
]);

export class PreventionReviewExchange{
  constructor({packFile='',keyFile=''}={}){this.packFile=packFile;this.keyFile=keyFile;this.pack=null;this.keys=new Map();this.error=null;}
  async initialize(){
    const [pack,key]=await Promise.all([readJson(this.packFile,null),readJson(this.keyFile,null)]);
    if(pack?.schema!==EXPORT_SCHEMA||key?.schema!=='vigia.prevention.blinded-expert-review-key.v1'||pack.evidenceHash!==key.packEvidenceHash){this.error='prevention_review_exchange_integrity_failed';return this.snapshot();}
    this.pack=pack;this.keys=new Map((key.cases??[]).map((item)=>[String(item.caseId),item]));this.error=null;return this.snapshot();
  }
  snapshot(){return{state:this.error?'unavailable':this.pack?'ready':'not_initialized',error:this.error,cases:this.pack?.inventory?.cases??0,packEvidenceHash:this.pack?.evidenceHash??null,importSchema:IMPORT_SCHEMA,reviewerClasses:REVIEWER_CLASSES};}
  exportPack(){if(!this.pack)throw new Error(this.error??'prevention_review_exchange_not_ready');return structuredClone({...this.pack,reviewerContract:{...this.pack.reviewerContract,reviewerClasses:REVIEWER_CLASSES,completedReviewSchema:IMPORT_SCHEMA}});}
  resolve(payload={},findings=[]){
    if(!this.pack)throw new Error(this.error??'prevention_review_exchange_not_ready');if(payload.schema!==IMPORT_SCHEMA)throw new Error('invalid_prevention_review_import_schema');
    const rows=Array.isArray(payload.reviews)?payload.reviews:[];if(!rows.length||rows.length>100)throw new Error('prevention_review_import_rows_required');
    const current=new Map(findings.map((item)=>[String(item.findingId),item])),seen=new Set();
    return rows.map((row)=>{const caseId=String(row.caseId??'').trim(),key=this.keys.get(caseId);if(!key)throw new Error(`unknown_prevention_review_case:${caseId}`);if(seen.has(caseId))throw new Error(`duplicate_prevention_review_case:${caseId}`);seen.add(caseId);const finding=current.get(String(key.findingId));if(!finding||finding.findingVersion!==key.findingVersion||finding.detectorVersion!==key.detectorVersion)throw new Error(`stale_prevention_review_case:${caseId}`);return{caseId,findingId:key.findingId,reviewerType:row.reviewerType??payload.reviewerType,decision:row.decision,reason:row.reason,note:row.note};});
  }
}
