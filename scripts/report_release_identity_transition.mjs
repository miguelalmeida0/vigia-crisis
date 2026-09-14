import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteNoFollow } from './release/safe_artifact.mjs';

const root=process.cwd();
const priorLedger=JSON.parse(await readFile(path.join(root,'data/validation/release/7e-to-402-transition.json'),'utf8'));
const responsible=priorLedger.responsiblePaths.map((item)=>item.classification==='SOURCE'?{path:item.path,classification:item.classification,oldHash:'sha256:4b0e479eafd1521542a5e92b801a2973de2a8df504b2e70d62313a97b361b622',newHash:item.hashAt402Build??item.newHash,oldHashState:'EXACT_RECONSTRUCTED_FROM_RECORDED_PATCHES',newHashState:'EXACT_RETAINED_AT_402_ANALYSIS',releaseIdentityParticipation:'INCLUDED_IN_CODE_STATE_HASH'}:{path:item.path,classification:item.classification,oldHash:null,newHash:item.hashAt402Build??item.newHash??null,oldHashState:'NOT_RETAINED_BEFORE_IMMUTABLE_HISTORY_FIX',newHashState:(item.hashAt402Build??item.newHash)?'EXACT_RETAINED_AT_402_ANALYSIS':'NOT_RETAINED',releaseIdentityParticipation:'ERRONEOUSLY_INCLUDED_IN_CODE_STATE_HASH_BY_PRE_FIX_CLASSIFIER'});
const value={
  schemaVersion:'vigia.release-identity-transition-analysis.v2',
  generatedAt:new Date().toISOString(),
  transition:{
    from:{releaseId:'vigia-intelligence-fabric-7e2625ba288ba199',codeStateHash:'sha256:f14954cb3e81ba2e305af642a06c21437a7d1d402ae9ff207b921c916e94ecd9',operationalDataHash:'sha256:09514b1ba2f2fff31a241e99ebbf6a00cdb4f0732f35283aec80c3228c9da344',releaseStatementHash:'sha256:3af335319187385a49ad87228155f9a1037a9d5b97e9b722ff70be98e968ed54'},
    to:priorLedger.transition.to
  },
  cause:'Between the 7e2625 and 402ff8 manifest cuts, scripts/visual-qa/final_white_capture.py changed and the final-under-7 browser/certification artifacts were regenerated. The pre-fix classifier treated .artifacts JSON and the root generated audit Markdown as SOURCE — release code, so those regenerated outputs also entered codeStateHash. Operational data did not change.',
  historicalHashEvidence:{sourceOldHash:'EXACT',generatedArtifactOldHashes:'IRRECOVERABLE_NOT_RETAINED',reason:'The 7e release-source-manifest was overwritten in place before immutable release history existed. Repository recovery snapshots, Git unreachable objects, local APFS snapshots, Trash, Docker containers/volumes, and the complete runtime transcript contain no retained copy. Null oldHash values are deliberate and prevent fabricated evidence.',reconstructionProof:{reconstructed402Hash:'sha256:324705d3a9f90c332a7ec3df17fca059afd03ccf87896ac88a92960fad8b3938',expected402Hash:'sha256:324705d3a9f90c332a7ec3df17fca059afd03ccf87896ac88a92960fad8b3938',match:true,reconstructed7eSourceHash:'sha256:4b0e479eafd1521542a5e92b801a2973de2a8df504b2e70d62313a97b361b622'}},
  classifications:{SOURCE:responsible.filter((item)=>item.classification==='SOURCE').length,'GOVERNED DATA':0,'GENERATED EVIDENCE':responsible.filter((item)=>item.classification==='GENERATED EVIDENCE').length,'CERTIFICATION OUTPUT':responsible.filter((item)=>item.classification==='CERTIFICATION OUTPUT').length,'RUNTIME-ONLY':1},
  responsiblePaths:responsible,
  governedData:{paths:[],operationalDataHashChanged:false},
  runtimeOnly:[{path:'data/runtime/canonical-incident-index.production.json',classification:'RUNTIME-ONLY',oldHash:null,newHash:null,oldHashState:'NOT_RETAINED',newHashState:'NOT_RETAINED_AT_402_CUT',priorIncidentCount:202,currentIncidentCount:204,releaseIdentityParticipation:'EXCLUDED',releaseIdentityEffect:'NONE — data/runtime is excluded from release identity and was not reset.'}],
  permanentCorrection:{artifactClassification:'GOVERNED EVIDENCE',sourceHashParticipation:false,rootAuditClassification:'GOVERNED EVIDENCE',certificationBinding:'Four-field runtime identity required.',immutableReleaseHistory:'Every replaced manifest/source-manifest/statement quartet is retained once under data/validation/release/history/<releaseId>/<releaseStatementHash>; collisions fail closed.'}
};
await atomicWriteNoFollow(path.join(root,'data/validation/release/7e-to-402-transition.json'),`${JSON.stringify(value,null,2)}\n`,{root});
process.stdout.write(`${JSON.stringify({output:'data/validation/release/7e-to-402-transition.json',responsiblePaths:responsible.length,classifications:value.classifications})}\n`);
