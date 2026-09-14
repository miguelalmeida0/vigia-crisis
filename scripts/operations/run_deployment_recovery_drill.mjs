import { randomBytes } from 'node:crypto';import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteNoFollow, readFileNoFollow, verifyDirectoryChain } from '../release/safe_artifact.mjs';
import { RELEASE_IMAGE_MATERIALS, sha256 } from '../release/release_statement.mjs';
import { createComposeCrashProcess, createDeploymentTools, inspectComposeServiceState, sleep } from './deployment-drill-runtime.mjs';
import { createDetachedImageAttestation, imageInspectionRecord, verifyDetachedImageAttestation, verifyExtractedApplicationImage } from './deployment-image-attestation.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.join(root, '.tmp/operational-maturity-75/deployment-drill');
const composeFile = path.join(root, 'infra/docker-compose.remote-shadow.yml');
const project = `vigia-maturity-75-${process.pid}`;
const ports = { api: 5277, fieldnet: 5288, operator: 5290 };
const startedAt = new Date();
const dockerConfig = path.join(outputRoot, 'docker-config');
const dockerTemp = path.join(outputRoot, 'tmp');
const { command, compactCompose, json, waitFor } = createDeploymentTools({ root });
async function writeSecret(name, value) {
  const target = path.join(outputRoot, 'secrets', name);
  await atomicWriteNoFollow(target, `${value}\n`, { root });
  return target;
}
await verifyDirectoryChain(root, outputRoot);
await verifyDirectoryChain(root, path.join(dockerConfig, 'buildx'));
await verifyDirectoryChain(root, dockerTemp);
await atomicWriteNoFollow(path.join(dockerConfig, 'config.json'), `${JSON.stringify({ cliPluginsExtraDirs: ['/Applications/Docker.app/Contents/Resources/cli-plugins'] })}\n`, { root });
const manifest = JSON.parse(await readFileNoFollow(path.join(root, 'data/validation/release/current-release-manifest.json'), { root, encoding:'utf8' }));
const releaseDocumentPaths=['data/validation/release/current-release-manifest.json','data/validation/release/release-source-manifest.json','data/validation/release/release-statement.json'];
const releaseDocumentBytes=Object.fromEntries(await Promise.all(releaseDocumentPaths.map(async(name)=>[name,await readFileNoFollow(path.join(root,name),{root})]))),releaseSource=JSON.parse(releaseDocumentBytes['data/validation/release/release-source-manifest.json'].toString('utf8'));
const releaseDocumentHashes=Object.fromEntries(releaseDocumentPaths.map((name)=>[name,sha256(releaseDocumentBytes[name])]));
const commandProof = JSON.parse(await readFileNoFollow(path.join(root, 'data/validation/command-survival/controlled-exercise-proof.json'), { root, encoding:'utf8' }));
if (!manifest.releaseId || !manifest.codeStateHash) throw new Error('canonical_release_manifest_invalid');
const approvedStatementHash=String(process.env.VIGIA_APPROVED_RELEASE_STATEMENT_SHA256??'').trim(),approvedPostgisDigest=String(process.env.VIGIA_APPROVED_POSTGIS_IMAGE_DIGEST??'').trim();if(!/^sha256:[a-f0-9]{64}$/.test(approvedStatementHash)||approvedStatementHash!==manifest.releaseStatementHash||!/^sha256:[a-f0-9]{64}$/.test(approvedPostgisDigest))throw new Error('deployment_external_release_approval_required');
if (!commandProof.incidentId) throw new Error('command_survival_incident_unavailable');
const operatorBuildCommand=await command('node',['apps/operator-console/scripts/build.mjs']);const operatorBuild=JSON.parse(await readFileNoFollow(path.join(root,'apps/operator-console/dist/build-manifest.json'),{root,encoding:'utf8'}));if(operatorBuild.releaseId!==manifest.releaseId||operatorBuild.codeStateHash!==manifest.codeStateHash||operatorBuild.operatorSourceHash!==manifest.canonicalOperatorConsole?.sourceHash||!/^sha256:[a-f0-9]{64}$/.test(operatorBuild.assetDigest??''))throw new Error('operator_deployment_build_identity_invalid');const operatorAssetDigest=operatorBuild.assetDigest;
const postgresPassword = randomBytes(24).toString('base64url');
const operatorProxyKey = randomBytes(32).toString('base64url');
const operatorAccessToken = randomBytes(32).toString('base64url');
const fieldControlKey = randomBytes(32).toString('base64url');
const fieldNodeKey = randomBytes(32).toString('base64url');
const nodeId = 'field-node:deployment-drill';
const secretFiles = {
  postgres: await writeSecret('postgres-password', postgresPassword),
  database: await writeSecret('database-url', `postgresql://vigia:${postgresPassword}@postgis:5432/vigia`),
  providers: await writeSecret('provider-credentials.env', '# intentionally not configured in isolated deployment drill'),
  operator: await writeSecret('operator-proxy-key', operatorProxyKey),
  admission: await writeSecret('operator-access-token', operatorAccessToken),
  fieldControl: await writeSecret('fieldnet-control-key', fieldControlKey),
  fieldNode: await writeSecret('fieldnet-node-key', fieldNodeKey),
  fieldRegistry: await writeSecret('fieldnet-node-registry.json', JSON.stringify({
    [nodeId]: {
      key: fieldNodeKey,
      incidentIds: [commandProof.incidentId],
      capabilities: ['fieldnet:sync', 'fieldnet:command-survival'],
      status: 'active',
    },
  })),
};
const baseEnv = {
  DOCKER_CONFIG: dockerConfig,
  BUILDX_CONFIG: path.join(dockerConfig, 'buildx'),
  DOCKER_CLI_PLUGIN_EXTRA_DIRS: '/Applications/Docker.app/Contents/Resources/cli-plugins',
  TMPDIR: dockerTemp,
  TMP: dockerTemp,
  TEMP: dockerTemp,
  COMPOSE_PROJECT_NAME: project,
  VIGIA_RELEASE_ID: manifest.releaseId,
  VIGIA_CODE_STATE_HASH: manifest.codeStateHash,
  VIGIA_OPERATIONAL_DATA_HASH: manifest.operationalDataHash,
  VIGIA_APPROVED_RELEASE_STATEMENT_SHA256: approvedStatementHash,
  VIGIA_OPERATOR_SOURCE_HASH: manifest.canonicalOperatorConsole?.sourceHash,
  VIGIA_OPERATOR_ASSET_DIGEST: operatorAssetDigest,
  VIGIA_API_PORT: String(ports.api),
  VIGIA_FIELDNET_PORT: String(ports.fieldnet),
  VIGIA_SHADOW_PORT: String(ports.operator),
  VIGIA_FIELDNET_INCIDENT_SCOPE: commandProof.incidentId,
  VIGIA_FIELDNET_NODE_ID: nodeId,
  VIGIA_POSTGRES_PASSWORD_FILE: secretFiles.postgres,
  VIGIA_DATABASE_URL_FILE: secretFiles.database,
  VIGIA_PROVIDER_CREDENTIALS_FILE: secretFiles.providers,
  VIGIA_OPERATOR_PROXY_KEY_FILE: secretFiles.operator,
  VIGIA_OPERATOR_ACCESS_TOKEN_FILE: secretFiles.admission,
  VIGIA_FIELDNET_CONTROL_KEY_FILE: secretFiles.fieldControl,
  VIGIA_FIELDNET_NODE_KEY_FILE: secretFiles.fieldNode,
  VIGIA_FIELDNET_NODE_REGISTRY_FILE: secretFiles.fieldRegistry,
  VIGIA_API_IMAGE_REFERENCE: `vigia-api-${process.pid}:candidate`,
  VIGIA_OPERATOR_IMAGE_REFERENCE: `vigia-operator-${process.pid}:candidate`,
};
let deploymentEnv=baseEnv;
const compose = (...args) => command('docker', ['compose', '-f', composeFile, ...args], { env: deploymentEnv });
const exactCodeIdentity=(body)=>body?.releaseId===manifest.releaseId&&body?.codeStateHash===manifest.codeStateHash&&body?.operationalDataHash===manifest.operationalDataHash&&body?.releaseStatementHash===approvedStatementHash;
const exactApiIdentity=(body)=>exactCodeIdentity(body)&&body?.migrationHead===manifest.contracts?.migrationHead&&body?.schema?.deploymentIdentity?.state==='ready'&&body.schema.deploymentIdentity.releaseId===manifest.releaseId&&body.schema.deploymentIdentity.codeStateHash===manifest.codeStateHash&&body.schema.deploymentIdentity.operationalDataHash===manifest.operationalDataHash&&body.schema.deploymentIdentity.releaseStatementHash===approvedStatementHash&&body.schema.deploymentIdentity.migrationHead===manifest.contracts?.migrationHead;
const exactOperatorIdentity=(body)=>exactCodeIdentity(body)&&body?.sourceHash===manifest.canonicalOperatorConsole?.sourceHash&&body?.assetDigest===operatorAssetDigest;
async function inspectImage(reference){return JSON.parse((await command('docker',['image','inspect',reference],{env:deploymentEnv})).stdout)[0];}
async function imageIdentity(service){const containerId=(await compose('ps','-a','-q',service)).stdout.trim();if(!containerId)throw new Error(`deployment_container_unavailable:${service}`);const container=JSON.parse((await command('docker',['inspect',containerId],{env:deploymentEnv})).stdout)[0],image=await inspectImage(container.Image);return{service,containerId,imageId:image.Id,repoDigests:image.RepoDigests??[],configuredImage:container.Config?.Image??null};}
async function verifyCandidateImage({reference,profile}){
  const target=path.join(outputRoot,'image-inspection',profile);await rm(target,{recursive:true,force:true});await verifyDirectoryChain(root,target);
  const created=await command('docker',['create',reference],{env:deploymentEnv}),containerId=created.stdout.trim();if(!containerId)throw new Error(`deployment_image_inspection_container_missing:${profile}`);
  try{await command('docker',['cp',`${containerId}:/opt/vigia/.`,target],{env:deploymentEnv});return await verifyExtractedApplicationImage({extractedRoot:target,profile,releaseSource,expectedReleaseDocuments:profile==='api'?releaseDocumentHashes:{},expectedOperatorBuild:profile==='operator'?operatorBuild:null});}
  finally{await command('docker',['rm','-f',containerId],{env:deploymentEnv,allowFailure:true});await rm(target,{recursive:true,force:true});}
}
const crashProcess=createComposeCrashProcess({command,compose,composeFile,getEnv:()=>deploymentEnv});
const evidence = {
  schemaVersion: 'vigia.operational-deployment-recovery.v1',
  state: 'RUNNING',
  startedAt: startedAt.toISOString(),
  completedAt: null,
  project,
  ports,
  releaseId: manifest.releaseId,
  codeStateHash: manifest.codeStateHash,
  operationalDataHash:manifest.operationalDataHash,
  releaseStatementHash:approvedStatementHash,
  operatorAssetDigest,
  migration: manifest.contracts?.migrationHead ?? manifest.database?.migration ?? manifest.migration ?? null,
  secretInventory: Object.keys(secretFiles),
  secretValuesPersistedInEvidence: false,
  detachedImageAttestation:null,
  steps: [],
};
try {
  evidence.steps.push({step:'operator-build-identity',state:'PASS',command:compactCompose(operatorBuildCommand),assetDigest:operatorAssetDigest});
  const config = await compose('config', '--quiet');
  evidence.steps.push({ step: 'compose-config', ...compactCompose(config) });
  const imageBuildStarted=performance.now(),imageBuild=await compose('build','api','web');
  evidence.steps.push({step:'candidate-image-build',durationMs:Number((performance.now()-imageBuildStarted).toFixed(1)),...compactCompose(imageBuild)});
  const baseImage=await inspectImage(RELEASE_IMAGE_MATERIALS.node),apiImage=await inspectImage(baseEnv.VIGIA_API_IMAGE_REFERENCE),operatorImage=await inspectImage(baseEnv.VIGIA_OPERATOR_IMAGE_REFERENCE);
  const apiVerification=await verifyCandidateImage({reference:apiImage.Id,profile:'api'}),operatorVerification=await verifyCandidateImage({reference:operatorImage.Id,profile:'operator'});
  const release={releaseId:manifest.releaseId,codeStateHash:manifest.codeStateHash,operationalDataHash:manifest.operationalDataHash,releaseStatementHash:approvedStatementHash},imageAttestationKey=randomBytes(32),images={api:imageInspectionRecord({component:'api-fieldnode',image:apiImage,base:baseImage}),operator:imageInspectionRecord({component:'operator-console',image:operatorImage,base:baseImage})},verifications={api:apiVerification,operator:operatorVerification};
  const detachedImageAttestation=createDetachedImageAttestation({release,images,verifications,issuedAt:new Date().toISOString(),nonce:randomBytes(32).toString('hex')},imageAttestationKey);
  verifyDetachedImageAttestation(detachedImageAttestation,imageAttestationKey,{release,actualImageIds:{api:apiImage.Id,operator:operatorImage.Id}});
  evidence.detachedImageAttestation=detachedImageAttestation;
  evidence.steps.push({step:'detached-final-image-attestation',state:'PASS',apiImageId:apiImage.Id,operatorImageId:operatorImage.Id,verifications});
  deploymentEnv={...baseEnv,VIGIA_API_IMAGE_REFERENCE:apiImage.Id,VIGIA_OPERATOR_IMAGE_REFERENCE:operatorImage.Id};
  const pinnedConfig=await compose('config','--quiet');evidence.steps.push({step:'exact-image-compose-config',...compactCompose(pinnedConfig)});
  const deployStarted = performance.now();
  const deployed = await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '300');
  evidence.steps.push({ step: 'clean-deployment', durationMs: Number((performance.now() - deployStarted).toFixed(1)), ...compactCompose(deployed) });
  const runningImages=await Promise.all(['postgis','migration','api','fieldnet','web'].map(imageIdentity)),postgisImage=runningImages.find((item)=>item.service==='postgis');if(postgisImage?.imageId!==approvedPostgisDigest||postgisImage?.configuredImage!==`postgis/postgis:17-3.5@${approvedPostgisDigest}`)throw new Error('deployment_postgis_image_identity_mismatch');for(const service of ['migration','api','fieldnet'])if(runningImages.find((item)=>item.service===service)?.imageId!==apiImage.Id)throw new Error(`deployment_attested_image_mismatch:${service}`);if(runningImages.find((item)=>item.service==='web')?.imageId!==operatorImage.Id)throw new Error('deployment_attested_image_mismatch:web');verifyDetachedImageAttestation(detachedImageAttestation,imageAttestationKey,{release,actualImageIds:{api:apiImage.Id,operator:operatorImage.Id}});evidence.steps.push({step:'immutable-image-identities',state:'PASS',approvedPostgisDigest,images:runningImages,detachedAttestationVerified:true});
  const api = await waitFor(`http://127.0.0.1:${ports.api}/api/v10/release`, (value) => value.status === 200 && exactApiIdentity(value.body));
  const fieldnet = await waitFor(`http://127.0.0.1:${ports.fieldnet}/api/fieldnet/release`, (value) => value.status === 200 && exactCodeIdentity(value.body));
  const operator = await waitFor(`http://127.0.0.1:${ports.operator}/__operator/ready`, (value) => value.status === 200 && exactOperatorIdentity(value.body));
  evidence.steps.push({ step: 'release-convergence', state: 'PASS', api: api.body, fieldnet: fieldnet.body, operator: operator.body });
  const postgisStop = await compose('stop', 'postgis');
  evidence.steps.push({ step: 'postgis-interruption', ...compactCompose(postgisStop) });
  const duringDatabaseLoss = await waitFor(`http://127.0.0.1:${ports.api}/live`, (value) => value.status === 200, { timeout: 45_000 });
  evidence.steps.push({ step: 'listener-first-during-postgis-loss', state: 'PASS', response: duringDatabaseLoss.body });
  const postgisRecoveryStarted = performance.now();
  await compose('start', 'postgis');
  const postgisRecovered = await waitFor(`http://127.0.0.1:${ports.api}/api/v10/health`, (value) => value.status === 200, { timeout: 180_000 });
  evidence.steps.push({ step: 'postgis-forward-recovery', state: 'PASS', durationMs: Number((performance.now() - postgisRecoveryStarted).toFixed(1)), response: postgisRecovered.body });
  const badRelease = `${manifest.releaseId}-must-be-rejected`;
  const badEnv = { ...deploymentEnv, VIGIA_RELEASE_ID: badRelease };
  const failedRelease = await command('docker', ['compose', '-f', composeFile, 'up', '-d', '--force-recreate', '--no-deps', 'api'], { env: badEnv, allowFailure: true });
  await sleep(4_000);
  let badReleaseProbe;
  try {
    badReleaseProbe = await json(`http://127.0.0.1:${ports.api}/api/v10/release`, { timeout: 2_000 });
  } catch (error) {
    badReleaseProbe = { unavailable: true, errorClass: String(error?.name ?? 'Error') };
  }
  const badContainerState = await inspectComposeServiceState({command,composeFile,service:'api',env:badEnv});
  const badStatus = await command('docker', ['compose', '-f', composeFile, 'ps', '-a', '--format', 'json'], { env: badEnv, allowFailure: true });
  const badLogs = await command('docker', ['compose', '-f', composeFile, 'logs', '--no-color', '--tail', '120', 'api'], { env: badEnv, allowFailure: true });
  const successfulReleaseResponse=Number.isInteger(badReleaseProbe?.status)&&badReleaseProbe.status>=200&&badReleaseProbe.status<300;
  const badContainerReady=badContainerState.Running===true&&badContainerState.Health?.Status==='healthy';
  const mismatchRejected=/remote_shadow_release_identity_mismatch/.test(`${badLogs.stdout}\n${badLogs.stderr}`);
  if(successfulReleaseResponse)throw new Error('stale_release_served_successful_response');
  if(badContainerReady)throw new Error('stale_release_container_became_ready');
  if(!mismatchRejected)throw new Error('stale_release_rejection_not_proven');
  evidence.steps.push({
    step: 'failed-release-detection-and-stale-rejection',
    state: 'PASS',
    attemptedReleaseId: badRelease,
    command: compactCompose(failedRelease),
    probe: badReleaseProbe,
    rejection:{mismatchRejected,containerReady:badContainerReady,state:badContainerState.Status??null,running:badContainerState.Running===true,restarting:badContainerState.Restarting===true,exitCode:badContainerState.ExitCode??null,health:badContainerState.Health?.Status??null},
    composeState: compactCompose(badStatus),
    logs:compactCompose(badLogs),
  });
  const forwardStarted = performance.now();
  const forward = await compose('up', '-d', '--force-recreate', '--no-deps', 'api');
  const recoveredApi = await waitFor(`http://127.0.0.1:${ports.api}/api/v10/release`, (value) => value.status === 200 && exactApiIdentity(value.body), { timeout: 180_000 });
  const compatibility = {
    api: recoveredApi.body,
    fieldnet: (await waitFor(`http://127.0.0.1:${ports.fieldnet}/api/fieldnet/release`, (value) => value.status === 200 && exactCodeIdentity(value.body))).body,
    operator: (await waitFor(`http://127.0.0.1:${ports.operator}/__operator/ready`, (value) => value.status === 200 && exactOperatorIdentity(value.body))).body,
  };
  evidence.steps.push({ step: 'forward-recovery-and-compatibility', state: 'PASS', durationMs: Number((performance.now() - forwardStarted).toFixed(1)), command: compactCompose(forward), compatibility });
  const apiCrash = await crashProcess('api');
  const crashRecoveryStarted = performance.now();
  const crashRecovered = await waitFor(`http://127.0.0.1:${ports.api}/api/v10/release`, (value) => value.status === 200 && exactApiIdentity(value.body), { timeout: 180_000 });
  evidence.steps.push({ step: 'api-crash-auto-recovery', state: 'PASS', durationMs: Number((performance.now() - crashRecoveryStarted).toFixed(1)), command: compactCompose(apiCrash.crash), restartCountBefore:apiCrash.restartCountBefore, restartCountAfter:apiCrash.restartCountAfter, releaseId: crashRecovered.body.releaseId });
  const fieldCrash = await crashProcess('fieldnet');
  const fieldRecoveryStarted = performance.now();
  const fieldRecovered = await waitFor(`http://127.0.0.1:${ports.fieldnet}/api/fieldnet/release`, (value) => value.status === 200 && exactCodeIdentity(value.body), { timeout: 180_000 });
  evidence.steps.push({ step: 'fieldnet-crash-auto-recovery', state: 'PASS', durationMs: Number((performance.now() - fieldRecoveryStarted).toFixed(1)), command: compactCompose(fieldCrash.crash), restartCountBefore:fieldCrash.restartCountBefore, restartCountAfter:fieldCrash.restartCountAfter, releaseId: fieldRecovered.body.releaseId });
  const webCrash = await crashProcess('web');
  const webRecoveryStarted = performance.now();
  const webRecovered = await waitFor(`http://127.0.0.1:${ports.operator}/__operator/ready`, (value) => value.status === 200 && exactOperatorIdentity(value.body), { timeout: 180_000 });
  evidence.steps.push({ step: 'frontend-crash-auto-recovery', state: 'PASS', durationMs: Number((performance.now() - webRecoveryStarted).toFixed(1)), command: compactCompose(webCrash.crash), restartCountBefore:webCrash.restartCountBefore, restartCountAfter:webCrash.restartCountAfter, releaseId: webRecovered.body.releaseId });
  const disk = await command('docker', ['compose', '-f', composeFile, 'exec', '-T', 'api', 'df', '-Pk', '/opt/vigia/data'], { env: deploymentEnv });
  const resources = await command('docker', ['stats', '--no-stream', '--format', 'json'], { env: deploymentEnv });
  const logs = await command('docker', ['compose', '-f', composeFile, 'logs', '--no-color', '--tail', '300'], { env: deploymentEnv });
  evidence.steps.push({ step: 'disk-archive-resource-observability', state: 'PASS', disk: compactCompose(disk), resources: compactCompose(resources), logs: compactCompose(logs) });
  evidence.state = 'PASS';
} catch (error) {
  evidence.state = 'FAIL';
  evidence.failure = { message: String(error?.message ?? error), command: error?.result ? compactCompose(error.result) : null };
  const diagnostics = await command('docker', ['compose', '-f', composeFile, 'logs', '--no-color', '--tail', '500'], { env: deploymentEnv, timeout: 60_000, allowFailure: true });
  evidence.failure.diagnostics = compactCompose(diagnostics);
  throw error;
} finally {
  evidence.completedAt = new Date().toISOString();
  evidence.durationMs = new Date(evidence.completedAt).getTime() - startedAt.getTime();
  await atomicWriteNoFollow(path.join(outputRoot, 'deployment-recovery-proof.json'), `${JSON.stringify(evidence, null, 2)}\n`, { root });
  const cleanup = await command('docker', ['compose', '-f', composeFile, 'down', '--volumes', '--remove-orphans'], { env: deploymentEnv, timeout: 5 * 60_000, allowFailure: true });
  await atomicWriteNoFollow(path.join(outputRoot, 'cleanup-proof.json'), `${JSON.stringify({ state: cleanup.state, project, completedAt: new Date().toISOString(), command: compactCompose(cleanup) }, null, 2)}\n`, { root });
}
process.stdout.write(`${JSON.stringify({ state: evidence.state, releaseId: evidence.releaseId, project, durationMs: evidence.durationMs, output: path.relative(root, path.join(outputRoot, 'deployment-recovery-proof.json')) })}\n`);
