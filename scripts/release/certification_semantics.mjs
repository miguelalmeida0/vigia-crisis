export const CERTIFICATION_SCOPES=Object.freeze({
  release:'CANONICAL_RELEASE_IDENTITY_AND_FINAL_UNDER_7_GATES',
  schema:'DATABASE_SCHEMA_AND_MIGRATION_HEAD',
  routes:'REQUIRED_CENTRAL_API_AND_FIELDNET_ROUTE_CONTRACTS',
  session:'OPERATOR_SESSION_IDENTITY_AND_RELOAD_CONTINUITY',
  fieldNode:'FIELDNET_RELEASE_AND_RUNTIME_READINESS',
  browser:'CANONICAL_OPERATOR_BROWSER_BEHAVIOR'
});

export const CERTIFICATION_REFERENCES=Object.freeze({
  release:'.artifacts/final-under7-elimination/certification.json',
  schema:'data/validation/release/current-release-manifest.json#/certification/schema',
  routes:'data/validation/release/route-contract-certification.json',
  session:'data/validation/release/session-certification.json',
  fieldNode:'data/validation/release/current-release-manifest.json#/certification/fieldNode',
  browser:'data/validation/release/running-browser-certification.json'
});

const IDENTITY_FIELDS=Object.freeze(['releaseId','codeStateHash','operationalDataHash','releaseStatementHash']);
const SOURCE_IDENTITY_FIELDS=Object.freeze(['releaseId','codeStateHash','operationalDataHash']);
const statementHash=value=>value?.releaseStatementHash??value?.certifiedRuntimeReleaseStatementHash??null;

export function releaseCertificationIdentity(value={}){
  return{
    releaseId:value?.releaseId??null,
    codeStateHash:value?.codeStateHash??null,
    operationalDataHash:value?.operationalDataHash??null,
    releaseStatementHash:statementHash(value)
  };
}

export function releaseCertificationIdentityMatches(value,current){
  const candidate=releaseCertificationIdentity(value),expected=releaseCertificationIdentity(current);
  return IDENTITY_FIELDS.every(field=>candidate[field]!==null&&candidate[field]===expected[field]);
}

function certificationSourceIdentityMatches(value,current){
  const candidate=releaseCertificationIdentity(value),expected=releaseCertificationIdentity(current);
  return SOURCE_IDENTITY_FIELDS.every(field=>candidate[field]!==null&&candidate[field]===expected[field]);
}

export function pendingCertification(scope,evidence,reason){
  return{state:'PENDING',scope,checkedAt:null,evidence,reason};
}

export function projectReleaseCertification({artifact,current,evidence=CERTIFICATION_REFERENCES.release}={}){
  if(!artifact)return pendingCertification(CERTIFICATION_SCOPES.release,evidence,'Canonical release certification has not been executed for this release identity.');
  if(!releaseCertificationIdentityMatches(artifact,current))return pendingCertification(CERTIFICATION_SCOPES.release,evidence,'Existing canonical release certification evidence belongs to a different release identity and is not admitted.');
  const declaredState=String(artifact.state??'').toUpperCase();
  if(declaredState&&declaredState!=='PASS')return{state:'FAIL',scope:CERTIFICATION_SCOPES.release,checkedAt:artifact.generatedAt??null,evidence,reason:`Canonical release certification artifact declares ${declaredState}.`};
  const failedGates=Array.isArray(artifact.failedGates)?artifact.failedGates:[];
  if(failedGates.length)return{state:'FAIL',scope:CERTIFICATION_SCOPES.release,checkedAt:artifact.generatedAt??null,evidence,reason:`Canonical release certification failed: ${failedGates.join(', ')}.`};
  return{state:'PASS',scope:CERTIFICATION_SCOPES.release,checkedAt:artifact.generatedAt??null,evidence};
}

export function projectManifestCertification({value={},scope,evidence,artifact=null,evidenceDigest=null,actualDigest=null,pendingReason,publicFields={}}={}){
  const rawState=String(value?.state??'PENDING').toUpperCase(),checkedAt=value?.checkedAt??null,base={scope,checkedAt,evidence,...publicFields};
  if(rawState!=='PASS')return{state:'PENDING',...base,reason:value?.reason??pendingReason};
  if(!artifact)return{state:'FAIL',...base,reason:'The manifest reports PASS but its required certification artifact is unavailable.'};
  if(!certificationSourceIdentityMatches(artifact,value?.identity??value?.releaseIdentity??{}))return{state:'FAIL',...base,reason:'The manifest certification summary and certification artifact identify different releases.'};
  const expectedRuntimeStatement=value?.certifiedRuntimeReleaseStatementHash??null,actualRuntimeStatement=statementHash(artifact);
  if(expectedRuntimeStatement&&actualRuntimeStatement!==expectedRuntimeStatement)return{state:'FAIL',...base,reason:'The manifest and artifact identify different certified runtime release statements.'};
  if(String(artifact.state??'').toUpperCase()!=='PASS')return{state:'FAIL',...base,reason:'The manifest reports PASS but the certification artifact does not.'};
  if(!evidenceDigest||!actualDigest||evidenceDigest!==actualDigest)return{state:'FAIL',...base,reason:'The manifest certification evidence binding does not authenticate the current artifact bytes.'};
  return{state:'PASS',...base};
}

export function projectEmbeddedCertification({value={},scope,evidence,pendingReason,publicFields={}}={}){
  const rawState=String(value?.state??'PENDING').toUpperCase(),base={scope,checkedAt:value?.checkedAt??null,evidence,...publicFields};
  return rawState==='PASS'?{state:'PASS',...base}:{state:'PENDING',...base,reason:value?.reason??pendingReason};
}
