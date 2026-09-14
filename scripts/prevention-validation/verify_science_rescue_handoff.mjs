#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const file=path.join(root,'data/validation/category-leadership/science-rescue-handoff.json');
const artifact=JSON.parse(await readFile(file,'utf8')),{evidenceHash,...core}=artifact,failures=[];
const actual=`sha256:${createHash('sha256').update(JSON.stringify(core)).digest('hex')}`;
const states=new Set(['ROBUST_INTERVENTION_ZONE','MIXED_INTERVENTION_ZONE','UNSTABLE_INTERVENTION_GEOMETRY','NO_DEFENSIBLE_INTERVENTION_ZONE','INSUFFICIENT_EVIDENCE']);
if(artifact.schemaVersion!=='vigia.prevent-science-rescue-handoff.v1')failures.push('schema');
if(actual!==evidenceHash)failures.push('evidence_hash');
if(artifact.criticalDelta?.before?.interventionReviewCandidates!==11||artifact.criticalDelta?.after?.interventionReviewCandidates!==0)failures.push('critical_delta');
if(artifact.current11?.denominator!==11||artifact.current11?.measurementRequired!==11)failures.push('current_11');
if(artifact.current11?.items?.some((item)=>!states.has(item.state)||item.workflow?.interventionReviewEligible!==false||item.workflow?.disposition!=='MEASUREMENT_REQUIRED'))failures.push('workflow_gating');
if(artifact.measurementAutopilot?.debts!==11||artifact.measurementAutopilot?.plans!==11)failures.push('measurement_autopilot');
if(artifact.falseNegativeRecovery?.denominator!==18||artifact.falseNegativeRecovery?.recoverable?.denominator!==7||artifact.falseNegativeRecovery?.sensingLimited?.denominator!==11)failures.push('false_negative_denominators');
if(artifact.falseNegativeRecovery?.v5?.attempted!==false||artifact.falseNegativeRecovery?.v5?.decision!=='NOT_SCIENTIFICALLY_JUSTIFIED')failures.push('v5_integrity');
if(artifact.prospectiveCampaign?.retrospectiveBackfillAllowed!==false||artifact.prospectiveCampaign?.outcomeStates?.length!==6)failures.push('prospective_contract');
if(artifact.fieldnetConflictPlans?.plans?.some((plan)=>plan.automaticWinner))failures.push('fieldnet_auto_winner');
if(failures.length)throw new Error(`science_rescue_handoff_verification_failed:${failures.join(',')}`);
console.log(JSON.stringify({verdict:'PASS',evidenceHash,criticalDelta:artifact.criticalDelta,states:artifact.consensusStates.counts,measurementPlans:artifact.measurementAutopilot.plans,falseNegatives:artifact.falseNegativeRecovery.denominator,v5:artifact.falseNegativeRecovery.v5.decision,conflicts:artifact.fieldnetConflictPlans.plans.length},null,2));
