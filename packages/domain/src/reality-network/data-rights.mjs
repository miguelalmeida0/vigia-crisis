import { immutable,requiredText,semanticHash,uniqueSorted } from '../intelligence/shared.mjs';

const USE=Object.freeze(['ALLOWED','ATTRIBUTION_REQUIRED','REVIEW_REQUIRED','PROHIBITED','UNKNOWN']);
const decision=(value,code)=>{const normalized=String(value??'UNKNOWN').toUpperCase();if(!USE.includes(normalized))throw new Error(code);return normalized;};
export function createDataRight(input={}){
  const reviewedAt=new Date(input.reviewedAt);if(!Number.isFinite(reviewedAt.getTime()))throw new Error('licence_review_time_required');
  const core={schemaVersion:'vigia.data-right.v1',licenceId:requiredText(input.licenceId,'licence_id_required'),name:requiredText(input.name,'licence_name_required'),termsVersion:requiredText(input.termsVersion,'licence_terms_version_required'),source:requiredText(input.source,'licence_source_required'),
    attribution:requiredText(input.attribution,'licence_attribution_required'),commercialUse:decision(input.commercialUse,'invalid_commercial_use'),redistribution:decision(input.redistribution,'invalid_redistribution'),rawRetention:decision(input.rawRetention,'invalid_raw_retention'),derivedProducts:decision(input.derivedProducts,'invalid_derived_products'),accessRestrictions:uniqueSorted(input.accessRestrictions),reviewedAt:reviewedAt.toISOString(),limitations:uniqueSorted(input.limitations)};
  return immutable({...core,fingerprint:semanticHash('data-right',core)});
}

export function assessExportRights({rights=[],licenceIds=[],includeRaw=false}={}){
  const registry=new Map(rights.map((item)=>[item.licenceId,item])),missing=[...new Set(licenceIds)].filter((id)=>!registry.has(id)).sort(),selected=[...new Set(licenceIds)].map((id)=>registry.get(id)).filter(Boolean);
  const blockers=[...missing.map((id)=>`LICENCE_NOT_REGISTERED:${id}`),...selected.flatMap((right)=>[right.redistribution==='PROHIBITED'||right.redistribution==='UNKNOWN'?`REDISTRIBUTION_${right.redistribution}:${right.licenceId}`:null,includeRaw&&(right.rawRetention==='PROHIBITED'||right.rawRetention==='UNKNOWN')?`RAW_EXPORT_${right.rawRetention}:${right.licenceId}`:null].filter(Boolean))].sort();
  return immutable({schemaVersion:'vigia.export-rights-assessment.v1',allowed:blockers.length===0,blockers,attributions:selected.map((item)=>({licenceId:item.licenceId,attribution:item.attribution,termsVersion:item.termsVersion})).sort((a,b)=>a.licenceId.localeCompare(b.licenceId))});
}
