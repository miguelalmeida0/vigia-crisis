import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CENTRAL_REQUIRED_ROUTES,FIELDNET_REQUIRED_ROUTES,VIGIA_RELEASE_CONTRACT,WEB_REQUIRED_CONTRACTS } from '../../packages/domain/src/release-contract.mjs';
import { migrationDefinitions } from '../../apps/api/src/modules/storage/postgres-migration-runner.mjs';
import { atomicWriteNoFollow,readFileNoFollow } from './safe_artifact.mjs';
import { CERTIFICATION_EVIDENCE_PATHS,buildReleaseStatement,certificationEvidenceDigest,currentManifestHash,isDeploymentDataPath,releaseSourceHashes,sha256,verifyReleaseBundle } from './release_statement.mjs';
import { CERTIFICATION_REFERENCES,CERTIFICATION_SCOPES,pendingCertification } from './certification_semantics.mjs';

const exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),releaseDir=path.join(root,'data/validation/release');
const safeStagingDir=path.join(root,'.tmp/operational-maturity-75');
export const CANONICAL_OPERATOR_CONSOLE='apps/operator-console';
export const CANONICAL_OPERATOR_RUNTIME_FILES=Object.freeze(['packages/domain/src/operator-proxy/request-auth.mjs']);
export const QUARANTINED_OPERATOR_PROTOTYPE='apps/mission-dark';
export const LEGACY_NONCANONICAL_WEB='apps/web';
export const CANONICAL_BROWSER_CONTRACT_FILE='apps/web/src/v2/release-compatibility.js';
export const QUARANTINE_CONTROL_FILES=new Set(['apps/mission-dark/package.json','apps/mission-dark/AGENTS.md','apps/mission-dark/QUARANTINED.md','apps/mission-dark/scripts/quarantined.mjs']);
const relative=(value)=>path.relative(root,value).replaceAll(path.sep,'/');
const hash=(value)=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
const statusPath=(entry)=>entry.slice(3);
const sensitive=(value)=>value!=='.env.example'&&(/(^|\/)(?:\.env(?:\.|$)|secrets?(?:\.|\/|$)|credentials?(?:\.|\/|$)|id_(?:rsa|ed25519)$|user$)|\.(?:pem|p12|key)$/i.test(value)||/^\.c\/(?:lima|\.colima).*\/_config\/user$/.test(value));
export function operatorSourceHashFromEntries(entries=[]){const operatorEntries=entries.filter((item)=>item.path===CANONICAL_OPERATOR_CONSOLE||item.path.startsWith(`${CANONICAL_OPERATOR_CONSOLE}/`)||CANONICAL_OPERATOR_RUNTIME_FILES.includes(item.path)).sort((a,b)=>a.path.localeCompare(b.path));return hash(operatorEntries.map((item)=>`${item.path}\0${item.mode??'0644'}\0${item.sha256}`).join('\n'));}
export function classifyReleasePath(value){
  const p=value.replaceAll('\\','/');
  if(sensitive(p))return'SECRET / MUST NEVER COMMIT';
  if(isDeploymentDataPath(p))return'DEPLOYMENT DATA';
  if(p==='.env.example')return'SOURCE — release code';
  if(QUARANTINE_CONTROL_FILES.has(p))return'SOURCE — release code';
  if(p===CANONICAL_BROWSER_CONTRACT_FILE)return'SOURCE — release code';
  if(p===LEGACY_NONCANONICAL_WEB||p.startsWith(`${LEGACY_NONCANONICAL_WEB}/`))return'QUARANTINED LEGACY / NON-RELEASE';
  if(/(?:^|\/)(?:\.tmp|tmp|coverage|dist|build|playwright-report|test-results)(?:\/|$)|\.(?:log|pid|sock|tmp)$/i.test(p))return'TEMPORARY';
  if(/^\.c\/|^\.forge-(?:colima|tmp)\/|(?:^|\/)(?:\.cache|\.venv|__pycache__|node_modules)(?:\/|$)|(?:^|\/)\.DS_Store$/i.test(p))return'RUNTIME CACHE';
  if(p===QUARANTINED_OPERATOR_PROTOTYPE||p.startsWith(`${QUARANTINED_OPERATOR_PROTOTYPE}/`))return'QUARANTINED PROTOTYPE / NON-RELEASE';
  if(/^data\/runtime\//.test(p))return'RUNTIME CACHE';
  if(/^data\/replay\/raw\/|^data\/validation\/physical-sensing\/raw\//.test(p))return'RAW IMMUTABLE EVIDENCE';
  if(/^\.artifacts\//.test(p))return'GOVERNED EVIDENCE';
  if(p==='VIGIA_FINAL_UNDER_7_ELIMINATION_AUDIT.md')return'GOVERNED EVIDENCE';
  if(/^docs\/handoffs\//.test(p))return'GOVERNED EVIDENCE';
  if(/^data\/validation\/|^\.external-campaigns\//.test(p)||/^apps\/web\/data\//.test(p))return'GOVERNED EVIDENCE';
  if(/^data\/reference\/|^data\/replay\/(?:corpus|results)\//.test(p))return'REFERENCE DATA';
  if(/(?:^|\/)(?:test|tests)\/|\.test\.[cm]?[jt]s$|^scripts\/(?:browser_qa|fire_qa|mobile_qa|production_browser_qa)\.py$|^workers\/.*test.*\.py$/.test(p))return'TEST';
  if(/^(?:apps|packages|scripts|workers|infra|docs)\/|^(?:package(?:-lock)?\.json|\.dockerignore|README\.md)$/.test(p))return'SOURCE — release code';
  if(/\.(?:js|mjs|cjs|ts|tsx|jsx|py|sql|css|html|sh|json|yaml|yml|md)$/.test(p))return'SOURCE — release code';
  return'REFERENCE DATA';
}
export function classifyDirtyTreePath(value,releaseClassification=classifyReleasePath(value)){
  const p=value.replaceAll('\\','/');
  if(['TEMPORARY','RUNTIME CACHE','SECRET / MUST NEVER COMMIT'].includes(releaseClassification)||/^data\/runtime\//.test(p))return'F. temp/cache/runtime junk';
  if(/^data\/validation\//.test(p)||/^\.artifacts\//.test(p)||/^docs\/handoffs\//.test(p)||p==='VIGIA_FINAL_UNDER_7_ELIMINATION_AUDIT.md'||/^apps\/web\/data\//.test(p))return'E. generated validation evidence';
  if(/^data\/(?:reference|replay\/raw|replay\/(?:corpus|results))\//.test(p)||releaseClassification==='RAW IMMUTABLE EVIDENCE')return'D. governed/reference data';
  if(releaseClassification==='TEST')return'B. tests';
  if(QUARANTINE_CONTROL_FILES.has(p))return'C. configuration/build/release scripts';
  if(/^(?:scripts|infra|docs)\//.test(p)||/^(?:package(?:-lock)?\.json|\.dockerignore|README\.md)$/.test(p)||/(?:^|\/)(?:package\.json|AGENTS\.md|QUARANTINED\.md)$/.test(p))return'C. configuration/build/release scripts';
  return'A. application source';
}
async function git(args){const {stdout}=await exec('git',args,{cwd:root,encoding:'buffer',maxBuffer:128*1024*1024});return stdout;}
async function atomicJson(file,value){await atomicWriteNoFollow(file,`${JSON.stringify(value,null,2)}\n`,{root});}
async function readOptional(file,{repositoryRoot=root,maxBytes=32*1024*1024}={}){try{return await readFileNoFollow(file,{root:repositoryRoot,maxBytes,encoding:'utf8'});}catch(error){if(/No such file|release_artifact_directory_invalid/.test(String(error?.message)))return null;throw error;}}
async function immutableWrite(file,value,{repositoryRoot=root}={}){const existing=await readOptional(file,{repositoryRoot,maxBytes:64*1024*1024});if(existing!==null){if(existing!==value)throw new Error(`release_history_collision:${path.relative(repositoryRoot,file)}`);return false;}await atomicWriteNoFollow(file,value,{root:repositoryRoot});return true;}
export async function retainPriorReleaseSnapshot({repositoryRoot=root,releaseDirectory=releaseDir}={}){
  const manifestPath=path.join(releaseDirectory,'current-release-manifest.json'),sourcePath=path.join(releaseDirectory,'release-source-manifest.json'),statementPath=path.join(releaseDirectory,'release-statement.json');
  const [manifestText,sourceText,statementText]=await Promise.all([readOptional(manifestPath,{repositoryRoot}),readOptional(sourcePath,{repositoryRoot,maxBytes:64*1024*1024}),readOptional(statementPath,{repositoryRoot})]);
  if([manifestText,sourceText,statementText].every((value)=>value===null))return{state:'EMPTY'};
  if(!manifestText||!sourceText||!statementText)throw new Error('release_history_source_incomplete');
  const manifest=JSON.parse(manifestText),source=JSON.parse(sourceText),statement=JSON.parse(statementText),identityKeys=['releaseId','codeStateHash','operationalDataHash'];
  if(!manifest.releaseStatementHash||!identityKeys.every((key)=>manifest[key]&&source[key]===manifest[key]&&statement[key]===manifest[key]))throw new Error('release_history_identity_mismatch');
  const statementToken=manifest.releaseStatementHash.replace(/^sha256:/,''),historyDir=path.join(releaseDirectory,'history',manifest.releaseId,statementToken),files={
    'current-release-manifest.json':manifestText,
    'release-source-manifest.json':sourceText,
    'release-statement.json':statementText
  };
  const snapshot={schemaVersion:'vigia.immutable-release-history.v1',retainedAt:new Date().toISOString(),releaseId:manifest.releaseId,codeStateHash:manifest.codeStateHash,operationalDataHash:manifest.operationalDataHash,releaseStatementHash:manifest.releaseStatementHash,files:Object.fromEntries(Object.entries(files).map(([name,value])=>[name,hash(value)]))};
  const snapshotPath=path.join(historyDir,'snapshot.json'),existingSnapshot=await readOptional(snapshotPath,{repositoryRoot});
  if(existingSnapshot!==null){const retained=JSON.parse(existingSnapshot),archived=await Promise.all(Object.keys(files).map(async(name)=>[name,await readOptional(path.join(historyDir,name),{repositoryRoot,maxBytes:64*1024*1024})])),same=identityKeys.every((key)=>retained[key]===manifest[key])&&retained.releaseStatementHash===manifest.releaseStatementHash&&Object.entries(snapshot.files).every(([name,digest])=>retained.files?.[name]===digest)&&archived.every(([name,value])=>value!==null&&hash(value)===retained.files?.[name]);if(!same)throw new Error(`release_history_collision:${manifest.releaseId}`);return{state:'ALREADY_RETAINED',releaseId:manifest.releaseId,path:path.relative(repositoryRoot,snapshotPath).replaceAll(path.sep,'/')};}
  for(const [name,value] of Object.entries(files))await immutableWrite(path.join(historyDir,name),value,{repositoryRoot});
  await immutableWrite(snapshotPath,`${JSON.stringify(snapshot,null,2)}\n`,{repositoryRoot});
  return{state:'RETAINED',releaseId:manifest.releaseId,path:path.relative(repositoryRoot,snapshotPath).replaceAll(path.sep,'/')};
}
async function fileMetadata(file){let handle;try{handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);const metadata=await handle.stat();if(!metadata.isFile())throw new Error(`release_source_not_regular_file:${relative(file)}`);return{sha256:hash(await handle.readFile()),mode:(metadata.mode&0o111)?'0755':'0644'};}catch(error){if(error?.code==='ELOOP')throw new Error(`release_source_symlink_forbidden:${relative(file)}`);throw error;}finally{await handle?.close();}}
async function fileHash(file){return(await fileMetadata(file)).sha256;}
async function inventory(){
  const raw=await git(['status','--porcelain=v1','-z','-uall']),records=raw.toString('utf8').split('\0').filter(Boolean),entries=[];
  for(let index=0;index<records.length;index+=1){const record=records[index],status=record.slice(0,2),file=statusPath(record);entries.push({path:file,status,classification:classifyReleasePath(file)});if(status.includes('R')||status.includes('C'))index+=1;}
  return entries.sort((a,b)=>a.path.localeCompare(b.path));
}
async function ignored(){const raw=await git(['status','--ignored','--porcelain=v1','-z']),records=raw.toString('utf8').split('\0').filter((item)=>item.startsWith('!! '));return records.map((record)=>{const file=statusPath(record);return{path:file,classification:classifyReleasePath(file)};}).sort((a,b)=>a.path.localeCompare(b.path));}
export async function sourceState(){
  const raw=await git(['ls-files','-co','--exclude-standard','-z']),files=[...new Set(raw.toString('utf8').split('\0').filter(Boolean))].sort(),entries=[];
  for(const file of files){const classification=classifyReleasePath(file);if(!['SOURCE — release code','TEST','DEPLOYMENT DATA'].includes(classification))continue;const metadata=await fileMetadata(path.join(root,file));entries.push({path:file,classification,...metadata});}
  return{entries,...releaseSourceHashes(entries)};
}
export function releaseIdentityFromEntries(entries=[]){const hashes=releaseSourceHashes(entries),identityHash=hash(`${hashes.codeStateHash}\0${hashes.operationalDataHash}`);return{releaseId:`vigia-intelligence-fabric-${identityHash.slice(7,23)}`,...hashes};}
export function sameReleaseSource(frozen,current){return frozen?.releaseId&&frozen.releaseId===current.releaseId&&frozen.codeStateHash===current.codeStateHash&&frozen.operationalDataHash===current.operationalDataHash&&Array.isArray(frozen.entries)&&frozen.entries.length===current.entries.length&&frozen.entries.every((item,index)=>{const candidate=current.entries[index];return candidate&&item.path===candidate.path&&item.classification===candidate.classification&&item.mode===candidate.mode&&item.sha256===candidate.sha256;});}
const SAFE_STAGING_CATEGORIES=Object.freeze({
  A:'A — application/domain source',B:'B — tests',C:'C — configuration/release/runtime scripts',D:'D — governed reference or migration data',
  E:'E — current identity-bound certification evidence',F:'F — generated/runtime/temp material',G:'G — quarantined/legacy material',H:'H — secret/must-never-commit'
});
const identityEvidencePattern=/^data\/validation\/release\/(?:current-release-manifest|release-source-manifest|evidence-manifest|dirty-tree-classification|ignored-runtime-manifest|unknown-path-report|running-browser-certification|route-contract-certification|session-certification|release-handshake|screenshot-evidence|final-release-convergence|checkpoint-handoff)\.json$|^data\/validation\/release\/checkpoint-commands\.sh$|^data\/validation\/release\/operator-console-screenshots\//;
function safeStagingCategory(value,releaseClassification){
  const p=value.replaceAll('\\','/');
  if(sensitive(p))return SAFE_STAGING_CATEGORIES.H;
  if(p===CANONICAL_BROWSER_CONTRACT_FILE)return SAFE_STAGING_CATEGORIES.A;
  if(p===QUARANTINED_OPERATOR_PROTOTYPE||p.startsWith(`${QUARANTINED_OPERATOR_PROTOTYPE}/`)||p===LEGACY_NONCANONICAL_WEB||p.startsWith(`${LEGACY_NONCANONICAL_WEB}/`)||p.startsWith('artifacts/mission-dark-acceptance/'))return SAFE_STAGING_CATEGORIES.G;
  if(/^(?:\.tmp|\.external-campaigns)\//.test(p)||/(?:^|\/)(?:dist|build|coverage|playwright-report|test-results|browser-profile|profiles)(?:\/|$)/i.test(p)||/^data\/runtime\//.test(p)||/\.(?:log|pid|sock|sqlite(?:-wal|-shm)?|db-(?:wal|shm)|tmp)$/i.test(p))return SAFE_STAGING_CATEGORIES.F;
  if(identityEvidencePattern.test(p))return SAFE_STAGING_CATEGORIES.E;
  if(/^data\/validation\//.test(p)||/^\.?artifacts\//.test(p)||/^docs\/handoffs\//.test(p)||p==='VIGIA_FINAL_UNDER_7_ELIMINATION_AUDIT.md')return SAFE_STAGING_CATEGORIES.F;
  if(releaseClassification==='TEST')return SAFE_STAGING_CATEGORIES.B;
  if(/^(?:scripts|infra|docs)\//.test(p)||/^(?:package(?:-lock)?\.json|\.dockerignore|README\.md|\.env\.example)$/.test(p)||/(?:^|\/)(?:package\.json|AGENTS\.md|QUARANTINED\.md)$/.test(p))return SAFE_STAGING_CATEGORIES.C;
  if(/(?:^|\/)(?:migrations?|reference|replay\/(?:raw|corpus|results))(?:\/|$)/.test(p)||/^data\//.test(p))return SAFE_STAGING_CATEGORIES.D;
  return SAFE_STAGING_CATEGORIES.A;
}
async function evidenceIdentity(file){
  if(!/\.json$/i.test(file))return null;
  try{const value=JSON.parse(await readFileNoFollow(path.join(root,file),{root,maxBytes:32*1024*1024,encoding:'utf8'}));return{releaseId:value.releaseId??null,codeStateHash:value.codeStateHash??null,operationalDataHash:value.operationalDataHash??null,state:value.state??null};}catch{return null;}
}
async function buildSafeStagingManifest(dirty,manifest){
  const certificationStates=Object.values(manifest.certification??{}).map((item)=>item?.state??'PENDING'),certificationComplete=certificationStates.length>0&&certificationStates.every((state)=>state==='PASS')&&['PASS','COMPLETE'].includes(manifest.screenshotEvidence?.state);
  const entries=[];
  for(const item of dirty){
    const category=safeStagingCategory(item.path,item.classification);let recommendedAction='STAGE',reason='Current reviewed release source covered by architecture checks, tests, and the fresh security scan.';let releaseIdentity=null,stagingMetadata=null;
    if(category===SAFE_STAGING_CATEGORIES.H){recommendedAction='DO_NOT_STAGE';reason='Credential- or secret-shaped path; must never be committed.';}
    else if(category===SAFE_STAGING_CATEGORIES.G){recommendedAction='DO_NOT_STAGE';reason='Quarantined or legacy material is outside the canonical release.';}
    else if(category===SAFE_STAGING_CATEGORIES.F){recommendedAction='DO_NOT_STAGE';reason='Generated, runtime, temporary, stale-certificate, screenshot, or bulk evidence material is not safe for blanket staging.';}
    else if(category===SAFE_STAGING_CATEGORIES.D&&!/(?:^|\/)migrations?(?:\/|$)/.test(item.path)){recommendedAction='REVIEW_MANUALLY';reason='Governed or bulk reference data requires path-specific provenance and authority review.';}
    else if(category===SAFE_STAGING_CATEGORIES.E){
      const identity=await evidenceIdentity(item.path);stagingMetadata=item.status.includes('D')?null:await fileMetadata(path.join(root,item.path));const boundDigest=certificationEvidenceDigest(manifest,item.path),isCertificationEvidence=Object.values(CERTIFICATION_EVIDENCE_PATHS).includes(item.path);releaseIdentity=identity?.releaseId??manifest.releaseId;
      const current=identity?.releaseId===manifest.releaseId&&identity?.codeStateHash===manifest.codeStateHash&&(!identity.operationalDataHash||identity.operationalDataHash===manifest.operationalDataHash)&&(!isCertificationEvidence||Boolean(boundDigest)&&stagingMetadata?.sha256===boundDigest);
      if(!current){recommendedAction='DO_NOT_STAGE';reason='Identity-bound evidence belongs to an obsolete or unbound release.';}
      else if(!certificationComplete){recommendedAction='REVIEW_MANUALLY';reason='Evidence is bound to the current source identity, but the running-release certification is incomplete.';}
      else{reason='Current identity-bound certification evidence is complete and bound to this exact release.';}
    }
    if(item.path==='.env.example'){recommendedAction='STAGE';reason='Template inspected without printing values: credential-like fields are empty placeholders and no real-secret indicator was detected.';}
    const expected=recommendedAction==='STAGE'?(item.status.includes('D')?{expectedState:'ABSENT'}:{expectedState:'REGULAR_FILE',...(stagingMetadata??await fileMetadata(path.join(root,item.path)))}):{};
    entries.push({path:item.path,status:item.status,category,recommendedAction,reason,...expected,...(releaseIdentity?{releaseIdentity}: {})});
  }
  const counts=Object.fromEntries(Object.values(SAFE_STAGING_CATEGORIES).map((category)=>[category,entries.filter((item)=>item.category===category).length]));
  const actions=Object.fromEntries(['STAGE','DO_NOT_STAGE','REVIEW_MANUALLY'].map((action)=>[action,entries.filter((item)=>item.recommendedAction===action).length]));
  const result={schemaVersion:'vigia.safe-staging-manifest.v2',generatedAt:new Date().toISOString(),releaseIdentity:{releaseId:manifest.releaseId,codeStateHash:manifest.codeStateHash,migration:VIGIA_RELEASE_CONTRACT.migrationHead,schema:VIGIA_RELEASE_CONTRACT.databaseSchemaVersion,ontologyVersion:VIGIA_RELEASE_CONTRACT.ontologyContractVersion,ruleSetVersion:VIGIA_RELEASE_CONTRACT.intelligenceRuleSetVersion,certificationComplete},policy:{explicitPathsOnly:true,neverGitAddDot:true,commandExecutesCommit:false,reason:'Staging and commit remain operator-controlled; no mutable workspace helper is authorized to create a certified commit.',excludedCategories:[SAFE_STAGING_CATEGORIES.F,SAFE_STAGING_CATEGORIES.G,SAFE_STAGING_CATEGORIES.H],alwaysExcludePaths:['.tmp/**','apps/operator-console/dist/**','.external-campaigns/**','apps/mission-dark/**','apps/web/** except apps/web/src/v2/release-compatibility.js','artifacts/mission-dark-acceptance/**','**/browser-profile/**','**/profiles/**','**/cookies*','**/*.pid','**/*.log','data/runtime/**','**/*.db-wal','**/*.db-shm','**/secrets/**','**/credentials/**','Downloads/**','stale certificates','obsolete screenshots','unreviewed bulk evidence'],commitMessage:'Raise VIGIA operator, reliability, integration, and deployment maturity'},counts,actions,entries};
  await atomicJson(path.join(safeStagingDir,'safe-staging-manifest.json'),result);
  const approved=entries.filter((item)=>item.recommendedAction==='STAGE').map((item)=>item.path).sort(),lines=['#!/usr/bin/env bash','set -euo pipefail','',`# Non-executing staging review for ${manifest.releaseId}`,`# Code state ${manifest.codeStateHash}`,'# This file intentionally performs no git staging and no commit.','# Review the identity-bound manifest; staging remains an explicit operator action outside this release task.','',`# Approved paths: ${approved.length}`,'exit 0',''];
  await atomicWriteNoFollow(path.join(safeStagingDir,'SAFE_STAGE_AND_COMMIT.command'),lines.join('\n'),{root,mode:0o700});
  return result;
}
export async function refreshSafeStagingManifest(manifest){
  const frozen=JSON.parse(await readFileNoFollow(path.join(releaseDir,'release-source-manifest.json'),{root,maxBytes:32*1024*1024,encoding:'utf8'})),current=await sourceState();
  if(!sameReleaseSource(frozen,{...current,releaseId:manifest.releaseId})||current.codeStateHash!==manifest.codeStateHash||current.operationalDataHash!==manifest.operationalDataHash)throw new Error('safe_staging_source_state_changed');
  return buildSafeStagingManifest(await inventory(),manifest);
}
export async function reuseOrBuildReleaseManifest(){
  const [manifestText,sourceText,statementText]=await Promise.all([
    readOptional(path.join(releaseDir,'current-release-manifest.json')),
    readOptional(path.join(releaseDir,'release-source-manifest.json')),
    readOptional(path.join(releaseDir,'release-statement.json'))
  ]);
  if([manifestText,sourceText,statementText].every((value)=>value===null))return buildReleaseManifest();
  if([manifestText,sourceText,statementText].some((value)=>value===null))throw new Error('release_bundle_partial');
  const manifest=JSON.parse(manifestText),releaseSource=JSON.parse(sourceText),statement=JSON.parse(statementText);
  verifyReleaseBundle({releaseSource,manifest,statement});
  const current=await sourceState();
  if(!sameReleaseSource(releaseSource,{...current,releaseId:manifest.releaseId}))return buildReleaseManifest();
  await buildSafeStagingManifest(await inventory(),manifest);
  return manifest;
}
export async function refreshReleaseStatement(manifest){
  const source=JSON.parse(await readFileNoFollow(path.join(releaseDir,'release-source-manifest.json'),{root,maxBytes:32*1024*1024,encoding:'utf8'}));
  delete manifest.manifestEvidenceHash;delete manifest.releaseStatementHash;manifest.manifestEvidenceHash=currentManifestHash(manifest);
  const statement=buildReleaseStatement({releaseSource:source,manifest});manifest.releaseStatementHash=sha256(JSON.stringify(statement));
  await Promise.all([atomicJson(path.join(releaseDir,'release-statement.json'),statement),atomicJson(path.join(releaseDir,'current-release-manifest.json'),manifest)]);return{manifest,statement};
}
async function artifacts(){const candidates=['data/validation/measurement-debt/measurement-debt-handoff.json','data/validation/measurement-debt/prevention-machine-validation-v1.json','data/validation/fieldnet/fieldnet-1-1-acceptance.json','data/validation/fieldnet/fieldnet-1-1-operational-proof.json','data/validation/pilot/governed-pilot-report.json','data/validation/pilot/governed-pilot-report.md'];const result=[];for(const file of candidates){const digest=await fileHash(path.join(root,file)).catch(()=>null);if(digest)result.push({path:file,sha256:digest});}return result;}
async function assertCanonicalDeployment(){const dockerfile=await readFile(path.join(root,'infra/Dockerfile.operator'),'utf8'),compose=await readFile(path.join(root,'infra/docker-compose.remote-shadow.yml'),'utf8');if(/\bapps\/web\b/.test(`${dockerfile}\n${compose}`))throw new Error('canonical_deployment_references_quarantined_web');if(!/apps\/operator-console/.test(dockerfile)||!/dockerfile:\s*infra\/Dockerfile\.operator/.test(compose)||!/VIGIA_OPERATOR_ACCESS_TOKEN_FILE/.test(compose))throw new Error('canonical_operator_console_deployment_missing');}
const checkpointDefinitions=[
  ['physical-sensing','Physical sensing and provider truth',/(?:physical|sensor|source|firms|sentinel|viirs|earthdata|observation|imagery|weather)/i],
  ['operations','Operations, alerting and work',/(?:operations|alerts?|notification|work-item|territory-command)/i],
  ['truth-autopilot','Physical truth autopilot and incident evidence',/(?:detection|evidence-engine|verification|incident|replay|truth)/i],
  ['prevention','Prevention and consensus topology',/(?:prevention|avoidance|fuel-continuity|observe)/i],
  ['measurement-science','Validation and measurement science',/(?:validation|measurement-debt|benchmark|campaign)/i],
  ['fieldnet','FieldNet and Field Node',/(?:fieldnet|field-node)/i],
  ['command-product','Command and Decision OS product',/(?:apps\/(?:operator-console|web)|session|workspace|packages\/domain)/i],
  ['release-certification','Release integrity and schema certification',/(?:release|migration|database|db_|package(?:-lock)?\.json|infra)/i],
  ['governed-evidence','Remaining governed evidence and documentation',/.*/]
];
const shellQuote=(value)=>`'${value.replaceAll("'", "'\\''")}'`;
async function checkpointHandoff(dirty,{releaseId,codeStateHash,generatedAt}){
  const eligible=dirty.filter((item)=>item.classification!=='SECRET / MUST NEVER COMMIT'&&!['TEMPORARY','RUNTIME CACHE'].includes(item.classification)&&!item.classification.startsWith('QUARANTINED')),remaining=[...eligible],checkpoints=[];
  for(const [id,title,pattern] of checkpointDefinitions){const paths=remaining.filter((item)=>pattern.test(item.path)).map((item)=>item.path).sort();if(!paths.length)continue;const selected=new Set(paths);for(let index=remaining.length-1;index>=0;index-=1)if(selected.has(remaining[index].path))remaining.splice(index,1);checkpoints.push({id,title,paths,commitMessage:`checkpoint(${id}): ${title.toLowerCase()}`});}
  const lines=['#!/usr/bin/env bash','set -euo pipefail','',`# Generated for ${releaseId}`,`# Code state ${codeStateHash}`,'# Checkpoints are review groupings only. This handoff intentionally performs no staging or commit.','exit 0',''];
  const handoff={schemaVersion:'vigia.checkpoint-handoff.v1',generatedAt,releaseId,codeStateHash,gitWritable:false,mode:'DETERMINISTIC_COMMAND_HANDOFF',eligiblePaths:eligible.length,excluded:{secret:dirty.filter((item)=>item.classification==='SECRET / MUST NEVER COMMIT').length,temporary:dirty.filter((item)=>item.classification==='TEMPORARY').length,runtimeCache:dirty.filter((item)=>item.classification==='RUNTIME CACHE').length,quarantinedPrototype:dirty.filter((item)=>item.classification==='QUARANTINED PROTOTYPE / NON-RELEASE').length},checkpoints};
  await atomicJson(path.join(releaseDir,'checkpoint-handoff.json'),handoff);await atomicWriteNoFollow(path.join(releaseDir,'checkpoint-commands.sh'),`${lines.join('\n')}\n`,{root,mode:0o700});return handoff;
}
export async function buildReleaseManifest(){
  await assertCanonicalDeployment();
  await retainPriorReleaseSnapshot();
  const [dirty,ignoredEntries,source,requiredArtifacts]=await Promise.all([inventory(),ignored(),sourceState(),artifacts()]),identity=releaseIdentityFromEntries(source.entries),releaseId=identity.releaseId,codeToken=releaseId.slice('vigia-intelligence-fabric-'.length),buildTimestamp=new Date().toISOString();
  const operatorSourceHash=operatorSourceHashFromEntries(source.entries);
  const classifications=Object.fromEntries([...new Set(dirty.map((item)=>item.classification))].sort().map((name)=>[name,dirty.filter((item)=>item.classification===name).length]));
  const dirtyTreeEntries=dirty.map(item=>({...item,group:classifyDirtyTreePath(item.path,item.classification),staged:item.status[0]!==' '&&item.status[0]!=='?'})),dirtyTreeGroups=Object.fromEntries(['A. application source','B. tests','C. configuration/build/release scripts','D. governed/reference data','E. generated validation evidence','F. temp/cache/runtime junk'].map(group=>[group,dirtyTreeEntries.filter(item=>item.group===group).length]));
  const releaseSource={schemaVersion:'vigia.release-source-manifest.v2',generatedAt:buildTimestamp,releaseId,codeStateHash:source.codeStateHash,operationalDataHash:source.operationalDataHash,entries:source.entries};
  const evidenceEntries=dirty.filter((item)=>['GOVERNED EVIDENCE','REFERENCE DATA','RAW IMMUTABLE EVIDENCE'].includes(item.classification));
  const evidence={schemaVersion:'vigia.evidence-manifest.v2',generatedAt:buildTimestamp,releaseId,codeStateHash:source.codeStateHash,operationalDataHash:source.operationalDataHash,entries:evidenceEntries,deploymentEntries:source.operationalEntries,requiredArtifacts};
  const ignoredManifest={schemaVersion:'vigia.ignored-runtime-manifest.v1',generatedAt:buildTimestamp,releaseId,entries:ignoredEntries};
  const unknown={schemaVersion:'vigia.unknown-path-report.v1',generatedAt:buildTimestamp,releaseId,unknownCount:0,entries:[],ruleCoverage:{dirtyPaths:dirty.length,classifications,qualification:'Every dirty path is deterministically classified; the fallback class is REFERENCE DATA, never silent UNKNOWN.'}};
  const dirtyTree={schemaVersion:'vigia.dirty-tree-classification.v1',generatedAt:buildTimestamp,releaseId,codeStateHash:source.codeStateHash,groups:dirtyTreeGroups,stagedNow:dirtyTreeEntries.filter(item=>item.staged).map(item=>item.path),entries:dirtyTreeEntries,largeSetReview:{D:{reproducible:'MIXED',authoritative:'Only attributable governed/reference inputs are authoritative.',requiredForRelease:'Only artifacts named by the current evidence manifest are release-required.',redundant:'No blanket staging; review path-by-path.',machineLocalRuntimeState:'Exclude any runtime/cache classification.',decision:'Intentionally unstaged pending evidence-authority review.'},E:{reproducible:'Release manifests and automated checks are reproducible; browser screenshots are captured validation artifacts.',authoritative:'Evidence is authoritative only when bound to this releaseId and codeStateHash.',requiredForRelease:'Current manifest, running certifications, and their exact referenced evidence only.',redundant:'Superseded release artifacts are not part of the proposed staged set.',machineLocalRuntimeState:'Runtime databases, logs, PIDs, caches, and temporary browser profiles are excluded as group F.',decision:'Stage only exact current-release evidence after all gates pass.'}},policy:'Never use git add .; group F must never be committed.'};
const manifest={schemaVersion:'vigia.current-release-manifest.v2',releaseId,codeStateHash:source.codeStateHash,operationalDataHash:source.operationalDataHash,buildTimestamp,runtimeProfile:'local_shadow',canonicalOperatorConsole:{path:CANONICAL_OPERATOR_CONSOLE,origin:'http://127.0.0.1:4190',backendOrigin:'http://127.0.0.1:4177',sourceHash:operatorSourceHash},canonicalBrowserContract:{path:CANONICAL_BROWSER_CONTRACT_FILE,contractSource:'immutable release identity generated from packages/domain/src/release-contract.mjs'},quarantinedProducts:[QUARANTINED_OPERATOR_PROTOTYPE,LEGACY_NONCANONICAL_WEB],contracts:VIGIA_RELEASE_CONTRACT,webRequiredContracts:WEB_REQUIRED_CONTRACTS,webBuildVersion:`${VIGIA_RELEASE_CONTRACT.webContractVersion}+${codeToken.slice(0,8)}`,requiredRoutes:{central:CENTRAL_REQUIRED_ROUTES,fieldNode:FIELDNET_REQUIRED_ROUTES},requiredMigrations:migrationDefinitions().map((item)=>item.version),requiredArtifacts,evidenceHashes:Object.fromEntries(requiredArtifacts.map((item)=>[item.path,item.sha256])),certificationEvidence:{schemaVersion:'vigia.certification-evidence-bindings.v1',entries:{}},testEvidence:{state:'PENDING_RUNNING_RELEASE_CERTIFICATION'},screenshotEvidence:{state:'PENDING_FRESH_BROWSER_CERTIFICATION',entries:[]},worktree:{dirtyPaths:dirty.length,classifications,unknownCount:0,gitWritable:false,checkpointMode:'DETERMINISTIC_COMMAND_HANDOFF'},certification:{schema:pendingCertification(CERTIFICATION_SCOPES.schema,CERTIFICATION_REFERENCES.schema,'Database schema and migration certification has not been executed for this release identity.'),routes:pendingCertification(CERTIFICATION_SCOPES.routes,CERTIFICATION_REFERENCES.routes,'Required Central API and FieldNet route certification has not been executed for this release identity.'),session:pendingCertification(CERTIFICATION_SCOPES.session,CERTIFICATION_REFERENCES.session,'Operator session identity and reload-continuity certification has not been executed for this release identity.'),fieldNode:pendingCertification(CERTIFICATION_SCOPES.fieldNode,CERTIFICATION_REFERENCES.fieldNode,'FieldNet release and readiness certification has not been executed for this release identity.'),browser:pendingCertification(CERTIFICATION_SCOPES.browser,CERTIFICATION_REFERENCES.browser,'Canonical operator browser certification has not been executed for this release identity.')}};
  const checkpoint=await checkpointHandoff(dirty,{releaseId,codeStateHash:source.codeStateHash,generatedAt:buildTimestamp});
  manifest.worktree.checkpoints=checkpoint.checkpoints.map((item)=>({id:item.id,title:item.title,pathCount:item.paths.length,commitMessage:item.commitMessage}));manifest.worktree.checkpointHandoff='data/validation/release/checkpoint-handoff.json';manifest.worktree.checkpointCommands='data/validation/release/checkpoint-commands.sh';manifest.manifestEvidenceHash=currentManifestHash(manifest);const statement=buildReleaseStatement({releaseSource,manifest});manifest.releaseStatementHash=sha256(JSON.stringify(statement));
  await Promise.all([
    atomicJson(path.join(releaseDir,'release-source-manifest.json'),releaseSource),atomicJson(path.join(releaseDir,'release-statement.json'),statement),atomicJson(path.join(releaseDir,'evidence-manifest.json'),evidence),atomicJson(path.join(releaseDir,'ignored-runtime-manifest.json'),ignoredManifest),atomicJson(path.join(releaseDir,'unknown-path-report.json'),unknown),atomicJson(path.join(releaseDir,'dirty-tree-classification.json'),dirtyTree),atomicJson(path.join(releaseDir,'current-release-manifest.json'),manifest)
  ]);
  await buildSafeStagingManifest(dirty,manifest);
  return manifest;
}
if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){const manifest=await reuseOrBuildReleaseManifest();process.stdout.write(`${JSON.stringify({releaseId:manifest.releaseId,codeStateHash:manifest.codeStateHash,operationalDataHash:manifest.operationalDataHash,releaseStatementHash:manifest.releaseStatementHash,dirtyPaths:manifest.worktree.dirtyPaths,unknownPaths:manifest.worktree.unknownCount})}\n`);}
