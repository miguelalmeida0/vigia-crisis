import { readFile } from 'node:fs/promises';
import path from 'node:path';
const file=path.join(process.cwd(),'data/validation/command-survival/controlled-exercise-proof.json'),proof=JSON.parse(await readFile(file,'utf8'));
const required=['realGovernedAnchor','shadowSeparated','oneIncidentIdentity','canonicalLink','maydayPinnedUntilPhysicalRecovery','evacuationClosedOnlyAfterExitReunionPar','orderAcknowledgementNotCompletion','centralAuditChainValid','fieldAuditChainValid','offlineZeroLoss','offlineConflictPreserved','waterTruthSeparated','unknownLocationPreserved'];
const failures=required.filter((key)=>proof.invariants?.[key]!==true);if(proof.verdict!=='PASS'||failures.length||proof.metrics?.dataLossCount!==0)throw new Error(`command_survival_evidence_failed:${failures.join(',')}`);process.stdout.write(`${JSON.stringify({state:'verified',exerciseId:proof.exerciseId,incidentId:proof.incidentId,metrics:proof.metrics,invariants:required.length})}\n`);
