import { createHash } from 'node:crypto';

export const RELEASE_IMAGE_MATERIALS=Object.freeze({
  node:'node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436',
  postgis:'postgis/postgis:17-3.5@sha256:0a23a2b5e4fbd9b4c6980d20ee80dd6b63dec52669379c75a506db58a4116708'
});

export const DEPLOYMENT_DATA_PREFIXES=Object.freeze([
  'data/reference/',
  'data/replay/corpus/',
  'data/replay/results/',
  'data/validation/measurement-debt/',
  'data/validation/fieldnet/',
  'data/validation/pilot/'
]);
export const DEPLOYMENT_DATA_FILES=Object.freeze(new Set([
  'data/replay/raw/openstreetmap/portugal-thermal-context-v1/portugal-boundary.json',
  'data/validation/detection/portugal-2023-v4-confirmatory-benchmark.json',
  'data/validation/detection/portugal-2024-small-fire-opportunity.json',
  'data/validation/detection/sentinel3-portugal-2024-product-manifest.json',
  'data/validation/physical-sensing/gold-specialist-handoff.json',
  'data/validation/prevention/portugal-sentinel2-review-corpus-v3.json',
  'data/validation/prevention/portugal-sentinel2-expert-review-pack-v1.json',
  'data/validation/prevention/portugal-sentinel2-expert-review-key-v1.json',
  'data/validation/prevention/consensus-topology-evaluation-v1.json'
]));

export const CERTIFICATION_EVIDENCE_PATHS=Object.freeze({
  routes:'data/validation/release/route-contract-certification.json',
  session:'data/validation/release/session-certification.json',
  handshake:'data/validation/release/release-handshake.json',
  browser:'data/validation/release/running-browser-certification.json',
  screenshots:'data/validation/release/screenshot-evidence.json'
});

export const sha256=(value)=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
export function bindCertificationEvidence(manifest,artifacts={}){
  const entries={...(manifest.certificationEvidence?.entries??{})};
  for(const[id,bytes]of Object.entries(artifacts)){
    const evidencePath=CERTIFICATION_EVIDENCE_PATHS[id];
    if(!evidencePath)throw new Error(`certification_evidence_kind_invalid:${id}`);
    entries[id]={path:evidencePath,sha256:sha256(bytes)};
  }
  manifest.certificationEvidence={schemaVersion:'vigia.certification-evidence-bindings.v1',entries};
  return manifest.certificationEvidence;
}
export function removeCertificationEvidence(manifest,ids=[]){
  const entries={...(manifest.certificationEvidence?.entries??{})};
  for(const id of ids)delete entries[id];
  manifest.certificationEvidence={schemaVersion:'vigia.certification-evidence-bindings.v1',entries};
  return manifest.certificationEvidence;
}
export function certificationEvidenceDigest(manifest,relativePath){
  const match=Object.values(manifest?.certificationEvidence?.entries??{}).find((entry)=>entry?.path===relativePath);
  return match?.sha256??null;
}
export function verifyCertificationEvidenceBindings(manifest,artifacts,{requireAll=true}={}){
  if(manifest?.certificationEvidence?.schemaVersion!=='vigia.certification-evidence-bindings.v1')throw new Error('certification_evidence_bindings_schema_invalid');
  const verified={};
  for(const[id,evidencePath]of Object.entries(CERTIFICATION_EVIDENCE_PATHS)){
    const entry=manifest.certificationEvidence.entries?.[id],bytes=artifacts?.[id];
    if(!entry&&!requireAll)continue;
    if(entry?.path!==evidencePath||!/^sha256:[a-f0-9]{64}$/.test(entry?.sha256??''))throw new Error(`certification_evidence_binding_invalid:${id}`);
    if(bytes===undefined||sha256(bytes)!==entry.sha256)throw new Error(`certification_evidence_digest_mismatch:${id}`);
    verified[id]=entry.sha256;
  }
  return verified;
}
export const isDeploymentDataPath=(value)=>{
  const name=String(value).replaceAll('\\','/');
  return DEPLOYMENT_DATA_FILES.has(name)||DEPLOYMENT_DATA_PREFIXES.some((prefix)=>name.startsWith(prefix));
};
const entryAggregate=(entries)=>entries.map((item)=>`${item.path}\0${item.mode}\0${item.sha256}`).join('\n');
export function releaseSourceHashes(entries=[]){
  const codeEntries=entries.filter((item)=>item.classification!=='DEPLOYMENT DATA');
  const operationalEntries=entries.filter((item)=>item.classification==='DEPLOYMENT DATA');
  return{codeStateHash:sha256(entryAggregate(codeEntries)),operationalDataHash:sha256(entryAggregate(operationalEntries)),codeEntries,operationalEntries};
}
export function canonicalCurrentManifest(manifest={}){
  const value=structuredClone(manifest);
  delete value.manifestEvidenceHash;
  delete value.releaseStatementHash;
  return JSON.stringify(value);
}
export const currentManifestHash=(manifest)=>sha256(canonicalCurrentManifest(manifest));
export function buildReleaseStatement({releaseSource,manifest}){
  return{
    schemaVersion:'vigia.release-statement.v1',
    generatedAt:manifest.buildTimestamp,
    releaseId:manifest.releaseId,
    codeStateHash:manifest.codeStateHash,
    operationalDataHash:manifest.operationalDataHash,
    sourceManifestHash:sha256(JSON.stringify(releaseSource)),
    currentManifestHash:currentManifestHash(manifest),
    imageMaterials:RELEASE_IMAGE_MATERIALS
  };
}
export function verifyReleaseBundle({releaseSource,manifest,statement,expectedStatementHash='',requireExternal=false}){
  const hashes=releaseSourceHashes(releaseSource?.entries??[]),statementHash=sha256(JSON.stringify(statement));
  if(releaseSource?.schemaVersion!=='vigia.release-source-manifest.v2'||manifest?.schemaVersion!=='vigia.current-release-manifest.v2'||statement?.schemaVersion!=='vigia.release-statement.v1')throw new Error('release_bundle_schema_invalid');
  if(!releaseSource.entries?.length||!hashes.operationalEntries.length)throw new Error('release_bundle_entries_incomplete');
  if(hashes.codeStateHash!==releaseSource.codeStateHash||hashes.operationalDataHash!==releaseSource.operationalDataHash)throw new Error('release_source_hash_invalid');
  for(const field of ['releaseId','codeStateHash','operationalDataHash'])if(releaseSource[field]!==manifest[field]||statement[field]!==manifest[field])throw new Error(`release_bundle_${field}_mismatch`);
  if(statement.sourceManifestHash!==sha256(JSON.stringify(releaseSource))||statement.currentManifestHash!==currentManifestHash(manifest)||manifest.manifestEvidenceHash!==statement.currentManifestHash||manifest.releaseStatementHash!==statementHash)throw new Error('release_statement_material_mismatch');
  if(JSON.stringify(statement.imageMaterials)!==JSON.stringify(RELEASE_IMAGE_MATERIALS))throw new Error('release_statement_image_materials_invalid');
  const approved=String(expectedStatementHash??'').trim();
  if(requireExternal&&!/^sha256:[a-f0-9]{64}$/.test(approved))throw new Error('approved_release_statement_hash_required');
  if(approved&&approved!==statementHash)throw new Error('approved_release_statement_hash_mismatch');
  return{releaseId:manifest.releaseId,codeStateHash:manifest.codeStateHash,operationalDataHash:manifest.operationalDataHash,releaseStatementHash:statementHash,verifiedFiles:releaseSource.entries.length};
}
