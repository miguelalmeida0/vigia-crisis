import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm,writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ReleaseIdentityService } from '../src/modules/release/release-identity-service.mjs';
import { CERTIFICATION_REFERENCES,CERTIFICATION_SCOPES } from '../../../scripts/release/certification_semantics.mjs';
import { CERTIFICATION_EVIDENCE_PATHS,bindCertificationEvidence,buildReleaseStatement,certificationEvidenceDigest,currentManifestHash,releaseSourceHashes,sha256,verifyCertificationEvidenceBindings } from '../../../scripts/release/release_statement.mjs';
import { VIGIA_RELEASE_CONTRACT } from '../../../packages/domain/src/release-contract.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),scratchRoot=path.join(projectRoot,'.tmp/tests');
async function writeBundle(root,{releaseId='release-a',certification={},certificationArtifacts={}}={}){const directory=path.join(root,'data/validation/release');await mkdir(directory,{recursive:true});const entries=[{path:'apps/api/src/server.mjs',mode:'0644',sha256:sha256('code'),classification:'SOURCE'},{path:'data/reference/test.json',mode:'0644',sha256:sha256('data'),classification:'DEPLOYMENT DATA'}],hashes=releaseSourceHashes(entries),releaseSource={schemaVersion:'vigia.release-source-manifest.v2',releaseId,...hashes,entries};delete releaseSource.codeEntries;delete releaseSource.operationalEntries;const manifest={schemaVersion:'vigia.current-release-manifest.v2',releaseId,...hashes,buildTimestamp:'2026-08-23T12:00:00.000Z',contracts:VIGIA_RELEASE_CONTRACT,certification,certificationEvidence:{schemaVersion:'vigia.certification-evidence-bindings.v1',entries:{}}};delete manifest.codeEntries;delete manifest.operationalEntries;const artifactWrites=[],artifactBytes={};for(const[id,factory]of Object.entries(certificationArtifacts)){const value=typeof factory==='function'?factory(manifest):factory,bytes=Buffer.from(`${JSON.stringify(value,null,2)}\n`);artifactBytes[id]=bytes;const relative=CERTIFICATION_EVIDENCE_PATHS[id];if(!relative)throw new Error(`test_certification_artifact_invalid:${id}`);const target=path.join(root,relative);await mkdir(path.dirname(target),{recursive:true});artifactWrites.push(writeFile(target,bytes));}bindCertificationEvidence(manifest,artifactBytes);manifest.manifestEvidenceHash=currentManifestHash(manifest);const statement=buildReleaseStatement({releaseSource,manifest});manifest.releaseStatementHash=sha256(JSON.stringify(statement));await Promise.all([writeFile(path.join(directory,'release-source-manifest.json'),JSON.stringify(releaseSource)),writeFile(path.join(directory,'current-release-manifest.json'),JSON.stringify(manifest)),writeFile(path.join(directory,'release-statement.json'),JSON.stringify(statement)),...artifactWrites]);return{directory,manifest,releaseSource,statement};}

async function writeFinalCertification(root,value){const target=path.join(root,CERTIFICATION_REFERENCES.release);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,`${JSON.stringify(value,null,2)}\n`);}

test('approved certification evidence bindings authenticate exact artifact bytes',()=>{const manifest={},routes=Buffer.from('{"state":"PASS"}\n'),session=Buffer.from('{"identity":"operator"}\n');bindCertificationEvidence(manifest,{routes,session});assert.equal(certificationEvidenceDigest(manifest,'data/validation/release/route-contract-certification.json'),sha256(routes));assert.deepEqual(verifyCertificationEvidenceBindings(manifest,{routes,session},{requireAll:false}),{routes:sha256(routes),session:sha256(session)});assert.throws(()=>verifyCertificationEvidenceBindings(manifest,{routes:Buffer.from('{"state":"PASS","forged":true}\n'),session},{requireAll:false}),/certification_evidence_digest_mismatch:routes/);});

test('a running process cannot advertise a newer manifest identity than the code it started with',async()=>{
  await mkdir(scratchRoot,{recursive:true});
  const root=await mkdtemp(path.join(scratchRoot,'vigia-release-identity-'));
  try{
    const bundle=await writeBundle(root,{certification:{routes:{state:'PENDING'}}}),service=new ReleaseIdentityService({projectRoot:root});
    await writeFile(path.join(bundle.directory,'current-release-manifest.json'),JSON.stringify({...bundle.manifest,releaseId:'release-b'}));
    assert.deepEqual(service.identity(),{releaseId:'release-a',codeStateHash:bundle.manifest.codeStateHash,operationalDataHash:bundle.manifest.operationalDataHash,releaseStatementHash:bundle.manifest.releaseStatementHash,buildTimestamp:'2026-08-23T12:00:00.000Z',contracts:VIGIA_RELEASE_CONTRACT,webBuildVersion:null,databaseSchemaVersion:VIGIA_RELEASE_CONTRACT.databaseSchemaVersion,migrationHead:VIGIA_RELEASE_CONTRACT.migrationHead,domainSchemaVersion:VIGIA_RELEASE_CONTRACT.domainSchemaVersion,ontologyContractVersion:VIGIA_RELEASE_CONTRACT.ontologyContractVersion,intelligenceRuleSetVersion:VIGIA_RELEASE_CONTRACT.intelligenceRuleSetVersion});
    const snapshot=service.snapshot();assert.equal(snapshot.releaseId,'release-a');assert.equal(snapshot.codeStateHash,bundle.manifest.codeStateHash);assert.equal(snapshot.routeCertification.state,'PENDING');assert.equal(snapshot.routeCertification.scope,CERTIFICATION_SCOPES.routes);assert.equal(snapshot.routeCertification.checkedAt,null);assert.equal(snapshot.routeCertification.evidence,CERTIFICATION_REFERENCES.routes);assert.match(snapshot.routeCertification.reason,/not been executed/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('public release identity omits the certifying operator personal identity',async()=>{
  await mkdir(scratchRoot,{recursive:true});const root=await mkdtemp(path.join(scratchRoot,'vigia-release-public-'));
  try{const runtimeStatementHash=sha256('certified-runtime-statement'),identity={id:'operator-secret',name:'Private Name',title:'Chief',role:'supervisor'},session={state:'PASS',scope:CERTIFICATION_SCOPES.session,checkedAt:'2026-08-23T12:00:00Z',identity,reloadPersistent:true,contradictions:0,certifiedRuntimeReleaseStatementHash:runtimeStatementHash,evidence:CERTIFICATION_REFERENCES.session};const bundle=await writeBundle(root,{certification:{session},certificationArtifacts:{session:manifest=>({schemaVersion:'vigia.session-certification.v1',state:'PASS',releaseId:manifest.releaseId,codeStateHash:manifest.codeStateHash,operationalDataHash:manifest.operationalDataHash,certifiedRuntimeReleaseStatementHash:runtimeStatementHash,completedAt:session.checkedAt,identity,reloadPersistent:true,contradictions:0})}});const snapshot=new ReleaseIdentityService({projectRoot:root}).snapshot();assert.deepEqual(snapshot.sessionCertification,{state:'PASS',scope:CERTIFICATION_SCOPES.session,checkedAt:'2026-08-23T12:00:00Z',evidence:CERTIFICATION_REFERENCES.session,reloadPersistent:true,contradictions:0});assert.equal(snapshot.releaseId,bundle.manifest.releaseId);assert.doesNotMatch(JSON.stringify(snapshot),/operator-secret|Private Name|Chief|supervisor/);}finally{await rm(root,{recursive:true,force:true});}
});

test('canonical release PASS remains distinct from pending route and session scopes',async()=>{
  await mkdir(scratchRoot,{recursive:true});const root=await mkdtemp(path.join(scratchRoot,'vigia-release-scopes-'));
  try{const bundle=await writeBundle(root,{certification:{routes:{state:'PENDING'},session:{state:'PENDING'},schema:{state:'PENDING'}}});await writeFinalCertification(root,{schemaVersion:'vigia.final-under7-elimination-certification.v1',state:'PASS',generatedAt:'2026-08-23T12:10:00.000Z',releaseId:bundle.manifest.releaseId,codeStateHash:bundle.manifest.codeStateHash,operationalDataHash:bundle.manifest.operationalDataHash,releaseStatementHash:bundle.manifest.releaseStatementHash,failedGates:[]});const snapshot=new ReleaseIdentityService({projectRoot:root}).snapshot();assert.equal(snapshot.releaseCertification.state,'PASS');assert.equal(snapshot.releaseCertification.scope,CERTIFICATION_SCOPES.release);assert.equal(snapshot.routeCertification.state,'PENDING');assert.equal(snapshot.sessionCertification.state,'PENDING');assert.notEqual(snapshot.releaseCertification.scope,snapshot.routeCertification.scope);assert.notEqual(snapshot.releaseCertification.scope,snapshot.sessionCertification.scope);for(const item of [snapshot.releaseCertification,snapshot.schemaCertification,snapshot.routeCertification,snapshot.sessionCertification]){assert.equal(typeof item.scope,'string');assert.ok(item.scope);assert.ok('checkedAt'in item);assert.ok(item.evidence);}}finally{await rm(root,{recursive:true,force:true});}
});

test('stale canonical certification cannot survive a new release identity',async()=>{
  await mkdir(scratchRoot,{recursive:true});const root=await mkdtemp(path.join(scratchRoot,'vigia-release-stale-cert-'));
  try{await writeBundle(root,{releaseId:'release-new'});await writeFinalCertification(root,{schemaVersion:'vigia.final-under7-elimination-certification.v1',state:'PASS',generatedAt:'2026-08-23T12:10:00.000Z',releaseId:'release-old',codeStateHash:sha256('old-code'),operationalDataHash:sha256('old-data'),releaseStatementHash:sha256('old-statement'),failedGates:[]});const snapshot=new ReleaseIdentityService({projectRoot:root}).snapshot();assert.equal(snapshot.releaseCertification.state,'PENDING');assert.equal(snapshot.releaseCertification.checkedAt,null);assert.match(snapshot.releaseCertification.reason,/different release identity/);}finally{await rm(root,{recursive:true,force:true});}
});

test('an explicit canonical artifact failure can never be projected as release PASS',async()=>{
  await mkdir(scratchRoot,{recursive:true});const root=await mkdtemp(path.join(scratchRoot,'vigia-release-failed-cert-'));
  try{const bundle=await writeBundle(root);await writeFinalCertification(root,{schemaVersion:'vigia.final-under7-elimination-certification.v1',state:'FAIL',generatedAt:'2026-08-23T12:10:00.000Z',releaseId:bundle.manifest.releaseId,codeStateHash:bundle.manifest.codeStateHash,operationalDataHash:bundle.manifest.operationalDataHash,releaseStatementHash:bundle.manifest.releaseStatementHash,failedGates:[]});const snapshot=new ReleaseIdentityService({projectRoot:root}).snapshot();assert.equal(snapshot.releaseCertification.state,'FAIL');assert.match(snapshot.releaseCertification.reason,/declares FAIL/);}finally{await rm(root,{recursive:true,force:true});}
});

test('manifest PASS cannot contradict stale or unauthenticated route evidence',async()=>{
  await mkdir(scratchRoot,{recursive:true});const root=await mkdtemp(path.join(scratchRoot,'vigia-release-contradiction-'));
  try{const runtimeStatementHash=sha256('runtime-statement'),routes={state:'PASS',checkedAt:'2026-08-23T12:05:00.000Z',certifiedRuntimeReleaseStatementHash:runtimeStatementHash,evidence:CERTIFICATION_REFERENCES.routes};await writeBundle(root,{releaseId:'release-current',certification:{routes},certificationArtifacts:{routes:manifest=>({schemaVersion:'vigia.route-certification.v1',state:'PASS',releaseId:'release-stale',codeStateHash:manifest.codeStateHash,operationalDataHash:manifest.operationalDataHash,certifiedRuntimeReleaseStatementHash:runtimeStatementHash})}});const snapshot=new ReleaseIdentityService({projectRoot:root}).snapshot();assert.equal(snapshot.routeCertification.state,'FAIL');assert.match(snapshot.routeCertification.reason,/different releases/);}finally{await rm(root,{recursive:true,force:true});}
});

test('release readiness is driven by the same services-ready transition exposed by startup health',async()=>{
  await mkdir(scratchRoot,{recursive:true});const root=await mkdtemp(path.join(scratchRoot,'vigia-release-readiness-'));
  try{
    await writeBundle(root);const service=new ReleaseIdentityService({projectRoot:root,runtimeProfile:'local_shadow'}),startup={processStartedAt:'2026-08-23T12:00:00.000Z',servicesReadyAt:null};
    const loading=service.snapshot({runtime:null,services:null,startup});assert.equal(loading.process.servicesReady,false);assert.equal(loading.process.startup.state,'loading');assert.equal(loading.process.startup.ready,false);
    const failed=service.snapshot({runtime:null,services:null,startup,startupError:'createServices failed safely'});assert.equal(failed.process.servicesReady,false);assert.equal(failed.process.startup.state,'failed');assert.equal(failed.process.startup.ready,false);assert.equal(failed.process.startup.error,'createServices failed safely');
    startup.servicesReadyAt='2026-08-23T12:00:01.000Z';const ready=service.snapshot({runtime:{},services:{},startup});assert.equal(ready.process.servicesReady,true);assert.equal(ready.process.startup.state,'services_ready');assert.equal(ready.process.startup.ready,true);assert.equal(ready.process.startup.servicesReadyAt,startup.servicesReadyAt);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('remote shadow release identity is required and must match the immutable process manifest',async()=>{
  await mkdir(scratchRoot,{recursive:true});const root=await mkdtemp(path.join(scratchRoot,'vigia-release-assertion-'));
  try{
    const {manifest}=await writeBundle(root,{releaseId:'release-current'}),common={projectRoot:root,runtimeProfile:'remote_shadow',expectedCodeStateHash:manifest.codeStateHash,expectedOperationalDataHash:manifest.operationalDataHash,expectedStatementHash:manifest.releaseStatementHash};
    assert.throws(()=>new ReleaseIdentityService(common),(error)=>error?.name==='ProductionIntegrityViolation'&&/remote_shadow_release_identity_required/.test(error.message));
    assert.throws(()=>new ReleaseIdentityService({...common,expectedReleaseId:'release-stale'}),(error)=>error?.name==='ProductionIntegrityViolation'&&/remote_shadow_release_identity_mismatch/.test(error.message)&&error.evidence?.actualReleaseId==='release-current');
    const service=new ReleaseIdentityService({...common,expectedReleaseId:'release-current'});assert.equal(service.identity().releaseId,'release-current');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('the deployment code-state assertion is mandatory remotely and exact in every runtime profile',async()=>{
  await mkdir(scratchRoot,{recursive:true});const root=await mkdtemp(path.join(scratchRoot,'vigia-release-code-assertion-'));
  try{
    const {manifest}=await writeBundle(root,{releaseId:'release-current'}),common={projectRoot:root,expectedReleaseId:'release-current',expectedOperationalDataHash:manifest.operationalDataHash,expectedStatementHash:manifest.releaseStatementHash};
    assert.throws(()=>new ReleaseIdentityService({...common,runtimeProfile:'remote_shadow'}),/remote_shadow_code_state_identity_required/);
    assert.throws(()=>new ReleaseIdentityService({...common,runtimeProfile:'local_shadow',expectedCodeStateHash:`sha256:${'f'.repeat(64)}`}),/remote_shadow_code_state_identity_mismatch/);
    assert.equal(new ReleaseIdentityService({...common,runtimeProfile:'remote_shadow',expectedCodeStateHash:manifest.codeStateHash}).identity().codeStateHash,manifest.codeStateHash);
  }finally{await rm(root,{recursive:true,force:true});}
});
