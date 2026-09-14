import { lstatSync,readFileSync } from 'node:fs';
import path from 'node:path';
import { VIGIA_RELEASE_CONTRACT, WEB_REQUIRED_CONTRACTS } from '../../../../../packages/domain/src/release-contract.mjs';
import { ProductionIntegrityViolation } from '../../../../../packages/domain/src/production-integrity.mjs';
import { CERTIFICATION_REFERENCES,CERTIFICATION_SCOPES,projectEmbeddedCertification,projectManifestCertification,projectReleaseCertification } from '../../../../../scripts/release/certification_semantics.mjs';
import { certificationEvidenceDigest,sha256,verifyReleaseBundle } from '../../../../../scripts/release/release_statement.mjs';

function readManifest(file){try{return JSON.parse(readFileSync(file,'utf8'));}catch(error){return{schemaVersion:'vigia.release-manifest.unavailable',releaseId:null,codeStateHash:null,state:'MISSING',error:String(error.code??error.message??error)};}}
function readCertificationArtifact(projectRoot,relativeFile){
  const file=path.join(projectRoot,relativeFile);
  try{const metadata=lstatSync(file);if(!metadata.isFile()||metadata.isSymbolicLink()||metadata.size>2*1024*1024)return{artifact:null,bytes:null};const bytes=readFileSync(file);return{artifact:JSON.parse(bytes.toString('utf8')),bytes};}catch{return{artifact:null,bytes:null};}
}
function identity(manifest){return{
  releaseId:manifest.releaseId??null,codeStateHash:manifest.codeStateHash??null,operationalDataHash:manifest.operationalDataHash??null,releaseStatementHash:manifest.releaseStatementHash??null,buildTimestamp:manifest.buildTimestamp??null,
  contracts:manifest.contracts??VIGIA_RELEASE_CONTRACT,webBuildVersion:manifest.webBuildVersion??null,
  databaseSchemaVersion:manifest.contracts?.databaseSchemaVersion??VIGIA_RELEASE_CONTRACT.databaseSchemaVersion,
  migrationHead:manifest.contracts?.migrationHead??VIGIA_RELEASE_CONTRACT.migrationHead,
  domainSchemaVersion:manifest.contracts?.domainSchemaVersion??VIGIA_RELEASE_CONTRACT.domainSchemaVersion,
  ontologyContractVersion:manifest.contracts?.ontologyContractVersion??VIGIA_RELEASE_CONTRACT.ontologyContractVersion,
  intelligenceRuleSetVersion:manifest.contracts?.intelligenceRuleSetVersion??VIGIA_RELEASE_CONTRACT.intelligenceRuleSetVersion
};}

export class ReleaseIdentityService{
  constructor({projectRoot,runtimeProfile='production',manifestFile=null,component='api',expectedReleaseId=null,expectedCodeStateHash=null,expectedOperationalDataHash=null,expectedStatementHash=null}={}){
    this.projectRoot=projectRoot;this.runtimeProfile=runtimeProfile;this.component=component;this.manifestFile=manifestFile??path.join(projectRoot,'data/validation/release/current-release-manifest.json');this.sourceFile=path.join(projectRoot,'data/validation/release/release-source-manifest.json');this.statementFile=path.join(projectRoot,'data/validation/release/release-statement.json');
    const manifest=readManifest(this.manifestFile),releaseSource=readManifest(this.sourceFile),statement=readManifest(this.statementFile);try{verifyReleaseBundle({releaseSource,manifest,statement,expectedStatementHash,requireExternal:runtimeProfile==='remote_shadow'});}catch(error){throw new ProductionIntegrityViolation(`release_statement_verification_failed:${error.message}`,{runtimeProfile});}this.processManifest=Object.freeze(structuredClone(manifest));this.processIdentity=Object.freeze(identity(manifest));
    const expected=String(expectedReleaseId??'').trim(),actual=this.processIdentity.releaseId;
    if(runtimeProfile==='remote_shadow'&&!expected)throw new ProductionIntegrityViolation('remote_shadow_release_identity_required: the deployment must assert the immutable manifest release before startup.',{runtimeProfile,actualReleaseId:actual});
    if(expected&&expected!==actual)throw new ProductionIntegrityViolation('remote_shadow_release_identity_mismatch: the deployment release assertion does not match the immutable manifest.',{runtimeProfile,expectedReleaseId:expected,actualReleaseId:actual});
    const expectedCode=String(expectedCodeStateHash??'').trim();if(runtimeProfile==='remote_shadow'&&!expectedCode)throw new ProductionIntegrityViolation('remote_shadow_code_state_identity_required',{runtimeProfile});if(expectedCode&&expectedCode!==this.processIdentity.codeStateHash)throw new ProductionIntegrityViolation('remote_shadow_code_state_identity_mismatch',{runtimeProfile});
    const expectedData=String(expectedOperationalDataHash??'').trim();if(runtimeProfile==='remote_shadow'&&!expectedData)throw new ProductionIntegrityViolation('remote_shadow_operational_data_identity_required',{runtimeProfile});if(expectedData&&expectedData!==this.processIdentity.operationalDataHash)throw new ProductionIntegrityViolation('remote_shadow_operational_data_identity_mismatch',{runtimeProfile});
  }
  manifest(){return structuredClone(this.processManifest);}
  identity(){return this.processIdentity;}
  snapshot({runtime=null,services=null,startup=null,startupError=null}={}){
    const manifest=this.processManifest,current=this.processIdentity,certification=manifest.certification??{};
    const finalEvidence=readCertificationArtifact(this.projectRoot,CERTIFICATION_REFERENCES.release),routeEvidence=readCertificationArtifact(this.projectRoot,CERTIFICATION_REFERENCES.routes),sessionEvidence=readCertificationArtifact(this.projectRoot,CERTIFICATION_REFERENCES.session);
    const releaseCertification=projectReleaseCertification({artifact:finalEvidence.artifact,current}),schemaCertification=projectEmbeddedCertification({value:certification.schema,scope:CERTIFICATION_SCOPES.schema,evidence:certification.schema?.evidence??CERTIFICATION_REFERENCES.schema,pendingReason:'Database schema and migration certification has not been executed for this release identity.'});
    const routeCertification=projectManifestCertification({value:{...certification.routes,identity:current},scope:CERTIFICATION_SCOPES.routes,evidence:certification.routes?.evidence??CERTIFICATION_REFERENCES.routes,artifact:routeEvidence.artifact,evidenceDigest:certificationEvidenceDigest(manifest,CERTIFICATION_REFERENCES.routes),actualDigest:routeEvidence.bytes?sha256(routeEvidence.bytes):null,pendingReason:'Required Central API and FieldNet route certification has not been executed for this release identity.',publicFields:{required:certification.routes?.required??null,passed:certification.routes?.passed??null}});
    const sessionCertification=projectManifestCertification({value:{...certification.session,identity:current},scope:CERTIFICATION_SCOPES.session,evidence:certification.session?.evidence??CERTIFICATION_REFERENCES.session,artifact:sessionEvidence.artifact,evidenceDigest:certificationEvidenceDigest(manifest,CERTIFICATION_REFERENCES.session),actualDigest:sessionEvidence.bytes?sha256(sessionEvidence.bytes):null,pendingReason:'Operator session identity and reload-continuity certification has not been executed for this release identity.',publicFields:{reloadPersistent:certification.session?.reloadPersistent===true,contradictions:Number(certification.session?.contradictions??0)}});
    const servicesReady=Boolean(services&&startup?.servicesReadyAt),startupState=startupError?'failed':servicesReady?'services_ready':'loading';
    return{schemaVersion:'vigia.release-identity.v2',state:manifest.releaseId?(this.runtimeProfile==='local_shadow'?'LOCAL_REHEARSAL_UNSEALED':'CURRENT_RELEASE'):'RELEASE_MANIFEST_MISSING',component:this.component,...current,runtimeProfile:this.runtimeProfile,requiredContracts:WEB_REQUIRED_CONTRACTS,process:{startedAt:runtime?.startedAt??startup?.processStartedAt??null,servicesReady,startup:{state:startupState,ready:servicesReady,servicesReadyAt:startup?.servicesReadyAt??null,...(this.runtimeProfile==='local_shadow'&&startupError?{error:String(startupError).slice(0,500)}:{})}},releaseCertification,schemaCertification,schema:{certification:schemaCertification,databaseSchemaVersion:current.databaseSchemaVersion,migrationHead:current.migrationHead,deploymentIdentity:services?.deploymentIdentityStore?.status?.()??{state:'unavailable'}},routeCertification,sessionCertification,manifestEvidenceHash:manifest.manifestEvidenceHash??null};
  }
}
