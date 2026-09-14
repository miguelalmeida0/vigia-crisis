import { hashValue, stableValue } from './contract.mjs';

const TEMPLATES=Object.freeze({
  NO_CURRENT_DEFENSIBLE_INCIDENT:'No current defensible incident is supported by the visible evidence.',
  REPORT_ONLY_INCIDENT:'A current report is visible, but no current physical observation supports it.',
  SINGLE_FAMILY_PHYSICAL_SIGNAL:'A current physical signal is present from one governed source family; independent corroboration is missing.',
  MULTI_FAMILY_PHYSICAL_SUPPORT:'Current physical observations from multiple governed source families support this incident.',
  PHYSICAL_REPORT_CONFLICT:'Attributable evidence conflicts with the current incident assertion and requires review.',
  STALE_PHYSICAL_EVIDENCE:'Physical evidence exists but is excluded from current support because it is stale.',
  INSUFFICIENT_EVIDENCE:'The visible evidence does not support a stronger incident state.',
  HISTORICAL_REHEARSAL_CASE:'This assessment is bound to a historical or rehearsal clock and is not a live claim.'
});
const bounded=(value,max=200)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

export function explanationTrace({situation={},attention={},unknowns=[],nextBestEvidence={},ruleSetVersion,excludedEvidence=[]}={}){
  const trace=stableValue({schemaVersion:'vigia.intelligence-explanation.v1',conclusion:situation.state,operatorCopy:bounded(TEMPLATES[situation.state]??situation.operatorStatement),rulesApplied:[...(situation.why?.rulesApplied??[]),...(attention.reasons?.length?['ATT-001','ATT-002']:[])].filter((value,index,rows)=>rows.indexOf(value)===index),supportingEvidence:(situation.supportingEvidenceIds??[]).map(bounded),contradictoryEvidence:(situation.contradictingEvidenceIds??[]).map(bounded),missingEvidence:(situation.missingEvidence??[]).map(bounded),excludedEvidence:[...(situation.why?.excludedEvidence??[]),...excludedEvidence].map((item)=>({id:bounded(item.id),reason:bounded(item.reason)})),unknowns:unknowns.map((item)=>({id:bounded(item.id),classification:item.classification,reason:bounded(item.reason)})),nextEvidence:(nextBestEvidence.candidates??[]).slice(0,5).map((item)=>({candidateId:bounded(item.candidateId),unknownId:bounded(item.unknownId),reasons:item.whyRankedHere.map(bounded)})),ruleSetVersion});
  return Object.freeze({...trace,explanationHash:hashValue(trace)});
}
