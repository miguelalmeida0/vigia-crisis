import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshSafeStagingManifest } from './build_release_manifest.mjs';
import { verifyFinalRelease } from './verify_final_release.mjs';
import { atomicWriteNoFollow,readFileNoFollow } from './safe_artifact.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),releaseDir=path.join(root,'data/validation/release'),manifestFile=path.join(releaseDir,'current-release-manifest.json'),proofFile=path.join(releaseDir,'final-release-convergence.json');

function assertStableVerification(before,after){for(const field of ['releaseId','codeStateHash','operationalDataHash','releaseStatementHash','manifestEvidenceHash'])if(before[field]!==after[field])throw new Error(`final_release_verification_changed:${field}`);if(JSON.stringify(before.certificationEvidenceHashes)!==JSON.stringify(after.certificationEvidenceHashes))throw new Error('final_release_certification_evidence_changed');}

export async function finalizeRelease(options={}){const beforeStaging=await verifyFinalRelease(options),manifest=JSON.parse(await readFileNoFollow(manifestFile,{root,encoding:'utf8'}));await refreshSafeStagingManifest(manifest);const verification=await verifyFinalRelease(options);assertStableVerification(beforeStaging,verification);const proof={...verification,schemaVersion:'vigia.final-release-convergence.v1',finalizedAt:new Date().toISOString(),verificationPasses:{beforeSafeStaging:beforeStaging.verifiedAt,afterSafeStaging:verification.verifiedAt,identityStable:true,certificationEvidenceStable:true},safeStaging:{state:'GENERATED',mode:'NON_EXECUTING_OPERATOR_HANDOFF'}};await atomicWriteNoFollow(proofFile,`${JSON.stringify(proof,null,2)}\n`,{root});return proof;}

if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url))process.stdout.write(`${JSON.stringify(await finalizeRelease())}\n`);
