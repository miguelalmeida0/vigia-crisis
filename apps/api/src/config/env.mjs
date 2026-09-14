import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ProductionIntegrityViolation } from '../../../../packages/domain/src/production-integrity.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '../../../..');
const LOCAL_SECRET_KEYS=new Set(['NASA_FIRMS_MAP_KEY','VIGIA_CDSE_USERNAME','VIGIA_CDSE_PASSWORD','VIGIA_CDSE_ACCESS_TOKEN','VIGIA_EARTHDATA_TOKEN','VIGIA_EUMETSAT_TOKEN','VIGIA_EFFIS_TOKEN','VIGIA_CAMS_TOKEN','VIGIA_CAP_PARTNER_TOKEN','VIGIA_ALERT_EMAIL_TOKEN']);
function positiveInt(value, fallback) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : fallback; }
function providerEndpoint(value,name){const raw=String(value??'').trim();if(!raw)return'';let target;try{target=new URL(raw);}catch{throw new ProductionIntegrityViolation('provider_endpoint_invalid',{name});}if(target.protocol!=='https:'||target.port&&target.port!=='443'||target.username||target.password||target.hash)throw new ProductionIntegrityViolation('provider_endpoint_must_use_https_443',{name});return target.href;}
function secretValueFile(file){if(!file)return'';try{return readFileSync(path.resolve(file),'utf8').trim();}catch{return'';}}
function parseSecretFile(value){
  const result={};
  for(const raw of String(value).split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const match=line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);if(!match||!LOCAL_SECRET_KEYS.has(match[1]))continue;
    let secret=match[2].trim();if((secret.startsWith("'")&&secret.endsWith("'"))||(secret.startsWith('"')&&secret.endsWith('"')))secret=secret.slice(1,-1);
    if(secret)result[match[1]]=secret;
  }
  return result;
}
function localSecretEnv(env){
  const enabled=env===process.env||Object.hasOwn(env,'VIGIA_SECRETS_FILE');
  if(!enabled||env.VIGIA_LOCAL_SECRETS_DISABLED==='1')return{values:{},state:'disabled',fields:[]};
  const file=path.resolve(env.VIGIA_SECRETS_FILE||path.join(env.HOME||process.env.HOME||'', '.config/vigia/secrets.env'));
  if(!existsSync(file))return{values:{},state:'absent',fields:[]};
  try{
    const metadata=statSync(file),runtimeSecret=file.startsWith('/run/secrets/'),privateMode=(metadata.mode&0o077)===0,owned=typeof process.getuid!=='function'||metadata.uid===process.getuid();
    if((!privateMode||!owned)&&!runtimeSecret)return{values:{},state:'rejected_insecure_permissions_or_owner',fields:[]};
    const values=parseSecretFile(readFileSync(file,'utf8'));
    return{values,state:runtimeSecret?'loaded_container_secret':'loaded_private_file',fields:Object.keys(values).sort()};
  }catch{return{values:{},state:'unreadable',fields:[]};}
}
function keychainSecret(env,service){
  if(env!==process.env||env.VIGIA_KEYCHAIN_DISABLED==='1'||process.platform!=='darwin'||!env.USER)return'';
  try{return execFileSync('/usr/bin/security',['find-generic-password','-a',env.USER,'-s',service,'-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:2_000}).trim();}catch{return'';}
}
export function loadConfig(env = process.env) {
  if (env.VIGIA_FIXTURES !== undefined) throw new ProductionIntegrityViolation('VIGIA_FIXTURES is forbidden. Production and TEST use separate entrypoints.', { variable: 'VIGIA_FIXTURES' });
  if (env.VIGIA_UNIVERSE && env.VIGIA_UNIVERSE !== 'production') throw new ProductionIntegrityViolation('The production server only accepts VIGIA_UNIVERSE=production.', { requestedUniverse: env.VIGIA_UNIVERSE });
  const localSecrets=localSecretEnv(env),effective={...localSecrets.values,...env};
  const defaultState = 'production-v1.json';
  const stateFile = path.resolve(effective.VIGIA_STATE_FILE || path.join(projectRoot, 'data/runtime', defaultState));
  const managedPython = path.join(projectRoot, '.venv', 'bin', 'python');
  const cdseCollection = effective.VIGIA_SENTINEL3_COLLECTION || 'sentinel-3-sl-2-frp-nrt';
  const cdseReplayCollection = effective.VIGIA_SENTINEL3_REPLAY_COLLECTION || 'sentinel-3-sl-2-frp-ntc';
  const firmsMapKey=effective.NASA_FIRMS_MAP_KEY||keychainSecret(env,'vigia-nasa-firms-map-key');
  const cdseUsername=effective.VIGIA_CDSE_USERNAME||keychainSecret(env,'vigia-cdse-username');
  const cdsePassword=effective.VIGIA_CDSE_PASSWORD||keychainSecret(env,'vigia-cdse-password');
  const cdseAccessToken=effective.VIGIA_CDSE_ACCESS_TOKEN||keychainSecret(env,'vigia-cdse-access-token');
  const earthdataToken=effective.VIGIA_EARTHDATA_TOKEN||keychainSecret(env,'vigia-earthdata-token');
  const eumetsatToken=effective.VIGIA_EUMETSAT_TOKEN||keychainSecret(env,'vigia-eumetsat-token');
  const localOperatorAutologin=effective.VIGIA_LOCAL_OPERATOR_AUTOLOGIN==='1';
  const runtimeProfile=effective.VIGIA_RUNTIME_PROFILE||'production';
  const operatorProxyKey=effective.VIGIA_OPERATOR_PROXY_KEY||secretValueFile(effective.VIGIA_OPERATOR_PROXY_KEY_FILE)||effective.VIGIA_OPERATOR_TOKEN||secretValueFile(effective.VIGIA_OPERATOR_TOKEN_FILE);
  const releaseIdAssertion=String(effective.VIGIA_RELEASE_ID??'').trim();
  const codeStateHashAssertion=String(effective.VIGIA_CODE_STATE_HASH??'').trim(),operationalDataHashAssertion=String(effective.VIGIA_OPERATIONAL_DATA_HASH??'').trim(),releaseStatementHashAssertion=String(effective.VIGIA_APPROVED_RELEASE_STATEMENT_SHA256??'').trim();
  if(runtimeProfile==='remote_shadow'&&!releaseIdAssertion)throw new ProductionIntegrityViolation('remote_shadow_release_identity_required: VIGIA_RELEASE_ID must assert the immutable manifest release before startup.',{runtimeProfile});
  if(runtimeProfile==='remote_shadow'&&(!/^sha256:[a-f0-9]{64}$/.test(codeStateHashAssertion)||!/^sha256:[a-f0-9]{64}$/.test(operationalDataHashAssertion)||!/^sha256:[a-f0-9]{64}$/.test(releaseStatementHashAssertion)))throw new ProductionIntegrityViolation('remote_shadow_complete_release_identity_required',{runtimeProfile});
  if(runtimeProfile==='remote_shadow'&&operatorProxyKey.length<32)throw new ProductionIntegrityViolation('remote_shadow_operator_proxy_key_required',{runtimeProfile});
  const localOperatorSafe=runtimeProfile==='local_shadow'&&effective.NODE_ENV!=='production'&&['127.0.0.1','localhost','::1'].includes(effective.HOST||'127.0.0.1');
  if(localOperatorAutologin&&!localOperatorSafe)throw new ProductionIntegrityViolation('Local operator autologin requires VIGIA_RUNTIME_PROFILE=local_shadow, a loopback host, and a non-production NODE_ENV.',{runtimeProfile,host:effective.HOST||'127.0.0.1'});
  return Object.freeze({
    projectRoot, host: effective.HOST || '127.0.0.1', port: positiveInt(effective.PORT, 4173), openBrowser: effective.OPEN_BROWSER === '1', universe: 'production', runtimeProfile, releaseId:releaseIdAssertion || 'vigia-10.0.0', releaseIdAssertion:releaseIdAssertion||null,codeStateHashAssertion:codeStateHashAssertion||null,operationalDataHashAssertion:operationalDataHashAssertion||null,releaseStatementHashAssertion:releaseStatementHashAssertion||null,
    featureFlags: Object.freeze({ prevention: true, detection: true, livingFire: true, action: true, outcomes: false }),
    refreshMs: positiveInt(env.REFRESH_MS, 30_000), requestTimeoutMs: positiveInt(env.REQUEST_TIMEOUT_MS, 12_000),
    canonicalTwinProjectionBudgetMs:Math.max(1_000,positiveInt(effective.VIGIA_CANONICAL_TWIN_PROJECTION_BUDGET_MS,30_000)),
    agent1CompatibilityBudgetMs:Math.max(250,positiveInt(effective.VIGIA_AGENT1_COMPATIBILITY_STARTUP_BUDGET_MS,12_000)),
    stateFile, webRoot: path.join(projectRoot, 'apps/web'),
    acquisitionStateFile: path.resolve(env.VIGIA_ACQUISITION_STATE_FILE || path.join(path.dirname(stateFile), 'acquisition-state.json')),
    rawArchiveDir: path.resolve(env.VIGIA_RAW_ARCHIVE_DIR || path.join(path.dirname(stateFile), 'raw-source-products')),
    realityRuntimeDir:path.resolve(effective.VIGIA_REALITY_RUNTIME_DIR||path.join(projectRoot,'data/runtime/reality-network')),
    realityReportFile:path.resolve(effective.VIGIA_REALITY_REPORT_FILE||path.join(projectRoot,'data/validation/reality-network/latest-live-run.json')),
    forecastRuntimeDir:path.resolve(effective.VIGIA_FORECAST_RUNTIME_DIR||path.join(projectRoot,'data/runtime/forecasting')),
    forecastReportFile:path.resolve(effective.VIGIA_FORECAST_REPORT_FILE||path.join(projectRoot,'data/validation/forecasting/latest-shadow-run.json')),
    forecastQualityFile:path.resolve(effective.VIGIA_FORECAST_QUALITY_FILE||path.join(projectRoot,'data/validation/forecasting/forecast-quality.json')),
    forecastFuelPackManifest:effective.VIGIA_FORECAST_FUEL_PACK_MANIFEST?path.resolve(effective.VIGIA_FORECAST_FUEL_PACK_MANIFEST):'',forecastTerrainPackManifest:effective.VIGIA_FORECAST_TERRAIN_PACK_MANIFEST?path.resolve(effective.VIGIA_FORECAST_TERRAIN_PACK_MANIFEST):'',
    farsiteExecutable:effective.VIGIA_FARSITE_EXECUTABLE?path.resolve(effective.VIGIA_FARSITE_EXECUTABLE):'',flammapExecutable:effective.VIGIA_FLAMMAP_EXECUTABLE?path.resolve(effective.VIGIA_FLAMMAP_EXECUTABLE):'',windNinjaExecutable:effective.VIGIA_WINDNINJA_EXECUTABLE?path.resolve(effective.VIGIA_WINDNINJA_EXECUTABLE):'',farsiteArtifactHash:effective.VIGIA_FARSITE_ARTIFACT_SHA256||effective.VIGIA_FLAMMAP_ARTIFACT_SHA256||'',windNinjaArtifactHash:effective.VIGIA_WINDNINJA_ARTIFACT_SHA256||'',forecastRunnerTimeoutMs:Math.max(1_000,positiveInt(effective.VIGIA_FORECAST_RUNNER_TIMEOUT_MS,120_000)),
    livePhysicalStateFile:path.resolve(env.VIGIA_LIVE_PHYSICAL_STATE_FILE||path.join(path.dirname(stateFile),'live-physical-intelligence.json')),
    fieldnetCentralStateFile:path.resolve(env.VIGIA_FIELDNET_CENTRAL_STATE_FILE||path.join(path.dirname(stateFile),'fieldnet-central-reconciliation.json')),
    fieldCapacityAdmissionFile:path.resolve(env.VIGIA_FIELD_CAPACITY_ADMISSION_FILE||path.join(path.dirname(stateFile),'field-capacity-admissions.json')),
    fieldNetNodeRegistry:Object.freeze((()=>{try{const parsed=JSON.parse(effective.VIGIA_FIELDNET_NODE_REGISTRY_JSON||secretValueFile(env.VIGIA_FIELDNET_NODE_REGISTRY_FILE)||'{}');return Object.fromEntries(Object.entries(parsed).flatMap(([id,entry])=>{if(!entry||typeof entry!=='object'||Array.isArray(entry))return[];const key=entry.key,incidentIds=Array.isArray(entry.incidentIds)?entry.incidentIds.map(String).filter(Boolean):[],capabilities=Array.isArray(entry.capabilities)?entry.capabilities.map(String):[];return id&&typeof key==='string'&&key.length>=32&&incidentIds.length&&capabilities.includes('fieldnet:sync')?[[id,Object.freeze({key,incidentIds:Object.freeze(incidentIds),capabilities:Object.freeze(capabilities),status:entry.status??'active'})]]:[];}));}catch{return{};}})()),
    fieldNetCapacityTaskSocket:effective.VIGIA_FIELDNET_CAPACITY_TASK_SOCKET?path.resolve(effective.VIGIA_FIELDNET_CAPACITY_TASK_SOCKET):'',
    fieldNetCapacityTaskKey:effective.VIGIA_FIELDNET_CAPACITY_TASK_KEY||secretValueFile(effective.VIGIA_FIELDNET_CAPACITY_TASK_KEY_FILE),
    fieldNetCapacityTaskKeyId:String(effective.VIGIA_FIELDNET_CAPACITY_TASK_KEY_ID??'').trim(),
    fieldNetCapacityTaskIncidentScopes:Object.freeze(String(effective.VIGIA_FIELDNET_CAPACITY_TASK_INCIDENT_SCOPES??'').split(',').map((item)=>item.trim()).filter(Boolean)),
    fieldNetCapacityTaskNodeId:String(effective.VIGIA_FIELDNET_CAPACITY_TASK_NODE_ID??'').trim(),
    fieldNetCapacityTaskTimeoutMs:Math.max(250,positiveInt(effective.VIGIA_FIELDNET_CAPACITY_TASK_TIMEOUT_MS,2_000)),
    fieldSensorHardwareInventoryFile:path.resolve(env.VIGIA_FIELD_SENSOR_HARDWARE_INVENTORY_FILE||path.join(projectRoot,'data/validation/fieldnet/sensors/hardware-discovery.json')),
    databaseUrl: env.VIGIA_DATABASE_URL || secretValueFile(env.VIGIA_DATABASE_URL_FILE),
    databaseConnectionTimeoutMs: Math.max(250, positiveInt(env.VIGIA_DATABASE_CONNECTION_TIMEOUT_MS, 3_000)),
    databaseStatementTimeoutMs: Math.max(1_000, positiveInt(env.VIGIA_DATABASE_STATEMENT_TIMEOUT_MS, 15_000)),
    databaseLockTimeoutMs: Math.max(250, positiveInt(env.VIGIA_DATABASE_LOCK_TIMEOUT_MS, 3_000)),
    firmsMapKey, localSecretState:Object.freeze({state:localSecrets.state,fields:Object.freeze([...localSecrets.fields])}), currentYear: positiveInt(effective.VIGIA_HISTORY_YEAR, new Date().getUTCFullYear()),
    firmsPollIntervalMs: Math.max(60_000, positiveInt(env.VIGIA_FIRMS_POLL_INTERVAL_MS, 300_000)),
    firmsMaxBackoffMs: Math.max(300_000, positiveInt(env.VIGIA_FIRMS_MAX_BACKOFF_MS, 1_800_000)),
    spreadProviderUrl: env.VIGIA_SPREAD_PROVIDER_URL || '', spreadProviderApiKey: env.VIGIA_SPREAD_PROVIDER_API_KEY || '', sensorIngestToken: env.VIGIA_SENSOR_INGEST_TOKEN || '', sensorTaskToken: env.VIGIA_SENSOR_TASK_TOKEN || '',
    operatorProxyKey, operatorBearerToken:operatorProxyKey, operatorActorId: env.VIGIA_OPERATOR_ACTOR_ID || (localOperatorAutologin?'miguel-almeida':'vigia-operator'), operatorActorRole: env.VIGIA_OPERATOR_ROLE || (localOperatorAutologin?'administrator':'supervisor'), operatorActorName: env.VIGIA_OPERATOR_NAME || (localOperatorAutologin?'Miguel Almeida':'VIGIA operator'), operatorActorTitle: env.VIGIA_OPERATOR_TITLE || (localOperatorAutologin?'Shadow Operator':'Authenticated command operator'), operatorActorQualifications: String(env.VIGIA_OPERATOR_QUALIFICATIONS || '').split(',').map((item) => item.trim()).filter(Boolean), operatorIncidentScopes:String(env.VIGIA_OPERATOR_INCIDENT_SCOPES || '*').split(',').map((item)=>item.trim()).filter(Boolean),
    localOperatorSession:Object.freeze({enabled:localOperatorAutologin,profile:runtimeProfile,cookieName:'vigia_shadow_session',optOutCookieName:'vigia_shadow_signed_out',ttlSeconds:Math.max(900,positiveInt(effective.VIGIA_LOCAL_OPERATOR_SESSION_TTL_SECONDS,28_800)),operatorConsoleOrigin:effective.VIGIA_OPERATOR_CONSOLE_ORIGIN||'http://127.0.0.1:4190'}),
    automaticEvidenceRequestCreation: effective.VIGIA_AUTOMATIC_EVIDENCE_REQUESTS !== '0',
    sensorRegistryFile: path.resolve(env.VIGIA_SENSOR_REGISTRY_FILE || path.join(projectRoot, 'data/config/sensors.json')),
    observationOpportunityFile: path.resolve(env.VIGIA_OBSERVATION_OPPORTUNITY_FILE || path.join(projectRoot, 'data/config/observation-opportunities.json')),
    mtgFrpDir: env.VIGIA_MTG_FRP_DIR ? path.resolve(env.VIGIA_MTG_FRP_DIR) : '',
    mtgFrpJsonUrl: providerEndpoint(effective.VIGIA_MTG_FRP_JSON_URL,'VIGIA_MTG_FRP_JSON_URL'),
    highResStacUrl: providerEndpoint(effective.VIGIA_HIGHRES_STAC_URL,'VIGIA_HIGHRES_STAC_URL'), highResStacCollection: env.VIGIA_HIGHRES_STAC_COLLECTION || '', highResStacToken: env.VIGIA_HIGHRES_STAC_TOKEN || '', highResStacAssetHosts:String(env.VIGIA_HIGHRES_STAC_ASSET_HOSTS??'').split(',').map((value)=>value.trim()).filter(Boolean),
    alertStateFile: path.resolve(env.VIGIA_ALERT_STATE_FILE || path.join(path.dirname(stateFile), 'alerts-v10.json')), alertWebhookUrl: env.VIGIA_ALERT_WEBHOOK_URL || '',
    alertEmailProviderUrl:effective.VIGIA_ALERT_EMAIL_PROVIDER_URL||'',alertEmailToken:effective.VIGIA_ALERT_EMAIL_TOKEN||'',alertEmailFrom:effective.VIGIA_ALERT_EMAIL_FROM||'',alertEmailTo:effective.VIGIA_ALERT_EMAIL_TO||'',
    geoPython: env.VIGIA_GEO_PYTHON || (existsSync(managedPython) ? managedPython : 'python3'),
    geoProofStateFile: path.resolve(env.VIGIA_GEO_PROOF_STATE_FILE || path.join(path.dirname(stateFile), 'geo-integrity-proofs.json')),
    sentinel3FrpDir: env.VIGIA_SENTINEL3_FRP_DIR ? path.resolve(env.VIGIA_SENTINEL3_FRP_DIR) : '', sentinel3FrpJsonUrl: providerEndpoint(effective.VIGIA_SENTINEL3_FRP_JSON_URL,'VIGIA_SENTINEL3_FRP_JSON_URL'),
    cdseUsername, cdsePassword, cdseAccessToken, earthdataToken,eumetsatToken,
    effisToken:effective.VIGIA_EFFIS_TOKEN||'',camsToken:effective.VIGIA_CAMS_TOKEN||'',capPartnerUrl:providerEndpoint(effective.VIGIA_CAP_PARTNER_URL||effective.VIGIA_CAP_FEED_URL,'VIGIA_CAP_PARTNER_URL'),capPartnerToken:effective.VIGIA_CAP_PARTNER_TOKEN||effective.VIGIA_CAP_BEARER_TOKEN||'',capIncidentBindingsFile:effective.VIGIA_CAP_INCIDENT_BINDINGS_FILE?path.resolve(effective.VIGIA_CAP_INCIDENT_BINDINGS_FILE):'',
    cdseCollection,
    cdseSearchStart: env.VIGIA_SENTINEL3_SEARCH_START || '', cdseSearchEnd: env.VIGIA_SENTINEL3_SEARCH_END || '',
    cdseLookbackHours: Math.max(1, positiveInt(env.VIGIA_SENTINEL3_LOOKBACK_HOURS, 48)), cdseMaxProducts: Math.max(1, positiveInt(env.VIGIA_SENTINEL3_MAX_PRODUCTS, cdseCollection.endsWith('-ntc') ? 1 : 8)), cdseDownloadTimeoutMs: Math.max(20_000, positiveInt(env.VIGIA_SENTINEL3_DOWNLOAD_TIMEOUT_MS, 120_000)),
    // Governed NTC fallback anchored to an active, already-retained Portugal
    // replay case. It is a separate evidence universe from LIVE/NRT and can be
    // overridden without changing live source freshness semantics.
    cdseReplayCollection,
    cdseReplaySearchStart: env.VIGIA_SENTINEL3_REPLAY_START || '2024-09-17T22:10:00Z',
    cdseReplaySearchEnd: env.VIGIA_SENTINEL3_REPLAY_END || '2024-09-17T23:00:00Z',
    cdseReplayMaxProducts: Math.max(1, positiveInt(env.VIGIA_SENTINEL3_REPLAY_MAX_PRODUCTS, 2)),
    replayCorpusFile: path.resolve(env.VIGIA_REPLAY_CORPUS_FILE || path.join(projectRoot, 'data/replay/corpus/portugal-2024-official.json')),
    replaySourceManifestFile: path.resolve(env.VIGIA_REPLAY_SOURCE_MANIFEST_FILE || path.join(projectRoot, 'data/replay/corpus/portugal-2024-source-manifest.json')),
    replayBenchmarkFile: path.resolve(env.VIGIA_REPLAY_BENCHMARK_FILE || path.join(projectRoot, 'data/replay/results/portugal-2024-benchmark.json')),
    detectionBenchmarkFile: path.resolve(env.VIGIA_DETECTION_BENCHMARK_FILE || path.join(projectRoot, 'data/validation/detection/portugal-2023-v4-confirmatory-benchmark.json')),
    thermalSiteContextFile: path.resolve(env.VIGIA_THERMAL_SITE_CONTEXT_FILE || path.join(projectRoot, 'data/reference/portugal-thermal-context-v1.json')),
    smallFireOpportunityFile: path.resolve(env.VIGIA_SMALL_FIRE_OPPORTUNITY_FILE || path.join(projectRoot, 'data/validation/detection/portugal-2024-small-fire-opportunity.json')),
    physicalSensingHandoffFile: path.resolve(env.VIGIA_PHYSICAL_SENSING_HANDOFF_FILE || path.join(projectRoot, 'data/validation/physical-sensing/gold-specialist-handoff.json')),
    sentinel3ProductManifestFile: path.resolve(env.VIGIA_SENTINEL3_PRODUCT_MANIFEST_FILE || path.join(projectRoot, 'data/validation/detection/sentinel3-portugal-2024-product-manifest.json')),
    preventionReviewCorpusFile: path.resolve(env.VIGIA_PREVENTION_REVIEW_CORPUS_FILE || path.join(projectRoot, 'data/validation/prevention/portugal-sentinel2-review-corpus-v3.json')),
    preventionExpertReviewPackFile:path.resolve(env.VIGIA_PREVENTION_EXPERT_PACK_FILE||path.join(projectRoot,'data/validation/prevention/portugal-sentinel2-expert-review-pack-v1.json')),
    preventionExpertReviewKeyFile:path.resolve(env.VIGIA_PREVENTION_EXPERT_KEY_FILE||path.join(projectRoot,'data/validation/prevention/portugal-sentinel2-expert-review-key-v1.json')),
    preventionContextFile: path.resolve(env.VIGIA_PREVENTION_CONTEXT_FILE || path.join(projectRoot, 'data/reference/prevention-review-context-v1.json')),
    userAgent: 'VIGIA/10.0 physical-intelligence-core'
  });
}
