import { immutable,semanticHash,uniqueSorted } from '../intelligence/shared.mjs';

export const INDEPENDENCE_DIMENSIONS=Object.freeze(['transportProvider','publisher','processingCenter','satellitePlatform','instrument','instrumentFamily','algorithmProduct','originalObservation','institution','physicalModality']);
const text=(value)=>{const result=String(value??'').trim();return result||null;};
export function createCausalLineage(input={}){
  const sourceClass=String(input.sourceClass??'').toUpperCase();
  const dimensions=Object.fromEntries(INDEPENDENCE_DIMENSIONS.map((key)=>[key,text(input[key])]));
  if(!dimensions.publisher||!dimensions.institution)throw new Error('lineage_publisher_and_institution_required');
  if(sourceClass==='PHYSICAL'&&(!dimensions.instrumentFamily||!dimensions.physicalModality||!dimensions.originalObservation))throw new Error('physical_lineage_incomplete');
  const core={schemaVersion:'vigia.causal-lineage.v1',sourceClass,...dimensions,derivedFrom:uniqueSorted(input.derivedFrom),republishes:uniqueSorted(input.republishes),rawContentHash:text(input.rawContentHash)};
  return immutable({...core,lineageId:semanticHash('causal-lineage',core)});
}

export function independenceSignature(lineage,dimensions=['originalObservation']){return dimensions.map((key)=>`${key}:${lineage?.[key]??'UNKNOWN'}`).join('|');}
export function evaluateCausalIndependence({lineages=[],requirements={}}={}){
  const physical=lineages.filter((item)=>item.sourceClass==='PHYSICAL'),representatives=new Map();
  for(const item of physical){const root=item.originalObservation??item.lineageId;if(!representatives.has(root))representatives.set(root,item);}
  const unique=[...representatives.values()],counts=Object.fromEntries(INDEPENDENCE_DIMENSIONS.map((key)=>[key,new Set(unique.map((item)=>item[key]).filter(Boolean)).size]));
  const unmet=Object.entries(requirements).filter(([dimension,minimum])=>Number(counts[dimension]??0)<Number(minimum)).map(([dimension,minimum])=>({dimension,minimum:Number(minimum),actual:Number(counts[dimension]??0)}));
  return immutable({schemaVersion:'vigia.causal-independence-assessment.v1',satisfied:unmet.length===0,physicalStatements:physical.length,uniqueOriginalObservations:unique.length,counts,unmet,representativeLineageIds:unique.map((item)=>item.lineageId).sort(),duplicateLineageIds:physical.filter((item)=>!unique.includes(item)).map((item)=>item.lineageId).sort()});
}

export function causalWitnessKey(lineage){return lineage?.originalObservation||lineage?.rawContentHash||lineage?.lineageId||semanticHash('unknown-lineage',lineage??{});}
