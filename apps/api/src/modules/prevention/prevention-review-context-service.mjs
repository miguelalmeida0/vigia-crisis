import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])]));
  return value;
}
const sha=(value)=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

export class PreventionReviewContextService{
  constructor({filePath='' }={}){this.filePath=filePath;this.state={schema:'vigia.prevention.review-context.v1',evidenceHash:null,findings:new Map(),error:filePath?null:'not_configured'};}
  async initialize(){
    if(!this.filePath)return this.snapshot();
    try{
      const value=JSON.parse(await readFile(this.filePath,'utf8'));
      if(value.schema!=='vigia.prevention.review-context.v1'||value.integrity?.syntheticEvidence!==false||value.integrity?.humanLabelsGenerated!==false)throw new Error('invalid_prevention_context_integrity');
      this.state={schema:value.schema,evidenceHash:value.evidenceHash??null,generatedAt:value.generatedAt??null,inventory:value.inventory??{},limitations:value.limitations??[],findings:new Map((value.findings??[]).map((item)=>[String(item.findingId),item])),error:null};
    }catch(error){this.state={...this.state,findings:new Map(),error:String(error.message??error)};}
    return this.snapshot();
  }
  snapshot(){return{schema:this.state.schema,evidenceHash:this.state.evidenceHash,generatedAt:this.state.generatedAt??null,inventory:this.state.inventory??{},limitations:this.state.limitations??[],loadedFindings:this.state.findings.size,error:this.state.error};}
  enrich(finding={}){
    const context=this.state.findings.get(String(finding.findingId));
    if(!context)return finding;
    const valid=context.detectorVersion===finding.detectorVersion&&context.geometrySha256===sha(finding.geometry);
    if(!valid)return{...finding,reviewContextBinding:{state:'REJECTED_VERSION_OR_GEOMETRY_MISMATCH',evidenceHash:this.state.evidenceHash}};
    const uncertainty=(finding.rationale?.uncertainty??[]).filter((item)=>!/(land cover|terrain|road crossings)/i.test(String(item)));
    return{
      ...finding,
      roadCrossings:context.roadCrossings,
      criticalAssetProximityM:context.criticalAssetProximityM,
      terrainContext:structuredClone(context.terrainContext),
      landCoverContext:structuredClone(context.landCoverContext),
      roadContext:structuredClone(context.roadContext),
      reviewContextBinding:{state:'GEOMETRY_BOUND_REAL_CONTEXT',evidenceHash:this.state.evidenceHash,geometrySha256:context.geometrySha256,generatedAt:this.state.generatedAt},
      rationale:{...finding.rationale,whatIsNearby:{...(finding.rationale?.whatIsNearby??{}),roads:`${context.roadCrossings} mapped road intersection${context.roadCrossings===1?'':'s'}`,criticalAssets:context.criticalAssetProximityM===null?'No mapped critical asset distance available':`${Math.round(context.criticalAssetProximityM)} m to nearest mapped critical asset`},uncertainty:[...uncertainty,'Static/context providers do not replace domain-expert adjudication','OpenStreetMap completeness varies']},
      provenance:{...finding.provenance,reviewContext:{schema:this.state.schema,evidenceHash:this.state.evidenceHash,geometrySha256:context.geometrySha256,sourceProducts:context.sourceProducts}}
    };
  }
}
