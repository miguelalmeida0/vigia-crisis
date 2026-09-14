import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod,lstat,mkdir,mkdtemp,readFile,rm,symlink,writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { HttpAcquirer } from '../src/modules/acquisition/http-acquirer.mjs';
import { rasterSourceAuthenticity } from '../src/modules/observations/geo-integrity-service.mjs';
import { normalizeContentChecksum,normalizeSha256Checksum } from '../src/shared/content-checksum.mjs';
import { buildLocalDatabaseUrl,ensureLocalPostgresPassword } from '../../../scripts/local_database_secret.mjs';

const projectRoot=fileURLToPath(new URL('../../..',import.meta.url));

test('catalogue SHA-256 formats normalize and mismatched provider bytes are rejected before archival',async()=>{
  const body=Buffer.from('governed-provider-body'),digest=createHash('sha256').update(body).digest('hex');
  const md5=createHash('md5').update(body).digest('hex');assert.equal(normalizeSha256Checksum(`sha256:${digest}`),digest);assert.equal(normalizeSha256Checksum(`1220${digest}`),digest);assert.equal(normalizeSha256Checksum(`urn:sha256:${digest}`),digest);assert.deepEqual(normalizeContentChecksum(`d50110${md5}`),{algorithm:'md5',digest:md5,encoding:'multihash',strength:'legacy_provider_integrity'});assert.throws(()=>normalizeSha256Checksum(`md5:${md5}`),/upstream_checksum_unsupported/);
  let archived=0,failures=0;const store={recordAttempt:async()=>{},recordFailure:async()=>{failures+=1;},archiveReceivedProduct:async()=>{archived+=1;return{product:{id:'raw:1'},duplicate:false};},acceptProduct:async()=>({product:{id:'raw:1'},checkpoint:{}}),recordProductRejected:async()=>{}};
  const acquirer=new HttpAcquirer({store,fetchImpl:async()=>new Response(body)});
  await assert.rejects(()=>acquirer.text({sourceId:'checksum',provider:'provider',url:'https://provider.test/data',expectedSha256:'0'.repeat(64),describe:async()=>({})}),/upstream_checksum_mismatch/);assert.equal(archived,0);assert.equal(failures,1);
  await acquirer.text({sourceId:'checksum-ok',provider:'provider',url:'https://provider.test/data',expectedSha256:`1220${digest}`,describe:async()=>({})});assert.equal(archived,1);
  await acquirer.text({sourceId:'checksum-md5',provider:'provider',url:'https://provider.test/data',expectedChecksum:`d50110${md5}`,describe:async()=>({})});assert.equal(archived,2);
});

test('local PostGIS secret is random, mode-0600, reusable and rejects a symlink target',async()=>{
  const parent=path.join(projectRoot,'.tmp','test');await mkdir(parent,{recursive:true});const root=await mkdtemp(path.join(parent,'vigia-db-secret-'));try{
    const secretFile=path.join(root,'.tmp','release','local-postgres-password'),first=await ensureLocalPostgresPassword({projectRoot:root,secretFile}),second=await ensureLocalPostgresPassword({projectRoot:root,secretFile}),metadata=await lstat(secretFile);
    assert.equal(first,second);assert.match(first,/^[A-Za-z0-9_-]{43}$/);assert.equal(metadata.mode&0o077,0);assert.equal((await readFile(secretFile,'utf8')).trim(),first);assert.match(buildLocalDatabaseUrl(first),/^postgresql:\/\/vigia:[A-Za-z0-9_-]{43}@127\.0\.0\.1:55432\/vigia$/);
    await rm(secretFile);const outside=path.join(root,'outside');await writeFile(outside,'x');await chmod(outside,0o600);await symlink(outside,secretFile);await assert.rejects(()=>ensureLocalPostgresPassword({projectRoot:root,secretFile}),/local_postgres_secret_file_invalid/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('canonical release isolates FieldNode from Operator and provider environments',async()=>{
  const source=await readFile(path.join(projectRoot,'scripts/release/local_release.mjs'),'utf8'),fieldStart=source.slice(source.indexOf('const fieldEnvironment='),source.indexOf('fieldIdentity=await waitRelease'));
  assert.match(fieldStart,/inheritEnvironment:false/);assert.doesNotMatch(fieldStart,/VIGIA_OPERATOR_TOKEN|NASA_FIRMS|CDSE_|EARTHDATA|VIGIA_DATABASE_URL|\.\.\.shared/);assert.match(source,/base=inheritEnvironment\?process\.env:/);assert.match(source,/services:true,timeout:240_000/);
});

test('canonical local deployment has no active repository-known database password and console transport is bounded',async()=>{
  const deployment=await Promise.all(['infra/docker-compose.shadow.yml','scripts/db_up.mjs','scripts/db_doctor.mjs','scripts/run_local_shadow.mjs','scripts/release/local_release.mjs'].map((file)=>readFile(path.join(projectRoot,file),'utf8'))),consoleSource=await readFile(path.join(projectRoot,'apps/operator-console/server.mjs'),'utf8');
  assert.equal(deployment.join('\n').includes(['vigia','local','only'].join('-')),false);assert.match(deployment[0],/VIGIA_LOCAL_POSTGRES_PASSWORD:\?set VIGIA_LOCAL_POSTGRES_PASSWORD/);
  for(const marker of ['server.maxConnections=128','server.headersTimeout=10_000','server.requestTimeout=50_000','server.keepAliveTimeout=5_000','server.maxRequestsPerSocket=100',"server.on('clientError'",'req.destroy(inboundTimeout)'])assert.ok(consoleSource.includes(marker),marker);
  assert.doesNotMatch(consoleSource,/\['accept','content-type','cookie','authorization'/);assert.doesNotMatch(consoleSource,/headers\.authorization=/);assert.match(consoleSource,/signOperatorProxyRequest\(/);assert.match(consoleSource,/VIGIA_OPERATOR_PROXY_KEY/);
});

test('mutable-workspace rehearsal cannot claim certification and sealed release checks bind every identity component',async()=>{
  const[local,serverCertification,browserCertification,finalVerifier,finalizer,listener,dockerignore,apiDockerfile,sourceVerifier,imageVerifier]=await Promise.all(['scripts/release/local_release.mjs','scripts/release/certify_running_release.mjs','scripts/release/run_operator_certification.mjs','scripts/release/verify_final_release.mjs','scripts/release/finalize_release.mjs','scripts/release/listener_ownership.mjs','.dockerignore','infra/Dockerfile.api','scripts/release/verify_deployment_source.mjs','scripts/operations/deployment-image-attestation.mjs'].map((file)=>readFile(path.join(projectRoot,file),'utf8')));
  assert.match(local,/state:'REHEARSAL_UNSEALED'/);assert.match(local,/certificationEligible:false/);assert.doesNotMatch(local,/certify_running_release\.mjs|trusted_operator_certification\.sh/);
  assert.match(serverCertification,/certification_requires_sealed_remote_shadow_runtime/);assert.match(browserCertification,/browser_certification_requires_sealed_remote_shadow_runtime/);assert.match(browserCertification,/releaseSourceHashes/);assert.doesNotMatch(browserCertification,/digest\(aggregate/);
  assert.match(serverCertification,/state:'RECUT_REQUIRED'/);assert.match(browserCertification,/state:'RECUT_REQUIRED'/);assert.doesNotMatch(browserCertification,/refreshSafeStagingManifest/);
  assert.match(serverCertification,/bindCertificationEvidence/);assert.match(browserCertification,/bindCertificationEvidence/);
  assert.match(finalVerifier,/verifyReleaseBundle/);assert.match(finalVerifier,/verifyCertificationEvidenceBindings/);assert.match(finalVerifier,/requireExternal:true/);assert.match(finalVerifier,/runtimeProfile==='remote_shadow'/);assert.match(finalVerifier,/canonicalOperatorConsole\.assetDigest/);assert.doesNotMatch(finalVerifier,/atomicWriteNoFollow|writeFile|refreshReleaseStatement|refreshSafeStagingManifest/);
  assert.match(finalVerifier,/certification\.browser\.cases===browserEvidence\.cases\?\.length/);
  assert.match(finalVerifier,/fetchImpl=null/);assert.match(finalVerifier,/parsed\.protocol==='http:'\?httpRequest/);assert.doesNotMatch(finalVerifier,/fetchImpl=fetch/);
  assert.ok(finalizer.indexOf('verifyFinalRelease(options)')<finalizer.indexOf('refreshSafeStagingManifest(manifest)'));assert.ok(finalizer.indexOf('refreshSafeStagingManifest(manifest)')<finalizer.indexOf('atomicWriteNoFollow(proofFile'));
  assert.equal((finalizer.match(/verifyFinalRelease\(options\)/g)??[]).length,2);assert.match(finalizer,/assertStableVerification/);
  for(const field of ['releaseId','codeStateHash','operationalDataHash','releaseStatementHash'])assert.ok(listener.includes(field),field);
  assert.match(dockerignore,/!data\/validation\/release\/release-statement\.json/);
  for(const governedArtifact of ['data/validation/measurement-debt','data/validation/fieldnet','data/validation/pilot','data/validation/prevention/consensus-topology-evaluation-v1.json']){
    assert.ok(apiDockerfile.includes(governedArtifact),`api image missing ${governedArtifact}`);
    assert.ok(dockerignore.includes(`!${governedArtifact}`),`docker context excludes ${governedArtifact}`);
    assert.ok(sourceVerifier.includes(governedArtifact),`deployment source verification omits ${governedArtifact}`);
    assert.ok(imageVerifier.includes(governedArtifact),`deployment image attestation omits ${governedArtifact}`);
  }
});

test('EOX imagery composition uses the DNS-pinned provider transport',async()=>{
  const source=await readFile(path.join(projectRoot,'apps/api/src/application/create-services.mjs'),'utf8');
  assert.match(source,/const imageryService = new ImageryService\(\{ fetchImpl:pinnedProviderFetch \}\)/);
  assert.doesNotMatch(source,/new ImageryService\(\{ fetchImpl:networkFetch \}\)/);
});

test('raster authenticity distinguishes governed local evidence from origin-only continuity',()=>{
  assert.deepEqual(rasterSourceAuthenticity({href:'/tmp/governed.tif',brokerOrigin:null},null),{verified:true,mode:'governed_local_asset'});
  assert.deepEqual(rasterSourceAuthenticity({href:'http://127.0.0.1:42001/raster/token',brokerOrigin:'http://127.0.0.1:42001'},{schemaVersion:'vigia.raster-byte-range-binding.v2'}),{verified:false,mode:'allowlisted_origin_continuity_only'});
  assert.deepEqual(rasterSourceAuthenticity({href:'http://127.0.0.1:42001/raster/token',brokerOrigin:'http://127.0.0.1:42001'},{sourceAuthenticity:{verified:true,mode:'signed_range_manifest'}}),{verified:true,mode:'signed_range_manifest'});
});

test('malformed absolute-form request target is contained and the API listener stays alive',async(t)=>{
  const child=spawn(process.execPath,['apps/api/src/server.mjs'],{cwd:projectRoot,env:{...process.env,HOST:'127.0.0.1',PORT:'0',OPEN_BROWSER:'0',VIGIA_LOCAL_SECRETS_DISABLED:'1',VIGIA_DATABASE_URL:'postgresql://invalid:invalid@127.0.0.1:1/invalid'},stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout.on('data',(chunk)=>output+=chunk);child.stderr.on('data',(chunk)=>errors+=chunk);t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
  const deadline=Date.now()+10_000;let port=null;while(Date.now()<deadline&&!port){const match=output.match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match)port=Number(match[1]);else if(child.exitCode!==null)throw new Error(`api_test_child_exited:${child.exitCode}:${errors.slice(-500)}`);else await new Promise((resolve)=>setTimeout(resolve,30));}if(!port)throw new Error('api_test_listener_timeout');
  const response=await new Promise((resolve,reject)=>{const socket=net.createConnection({host:'127.0.0.1',port},()=>socket.end('GET http://localhost:99999/ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'));let data='';socket.setEncoding('utf8');socket.on('data',(chunk)=>data+=chunk);socket.once('error',reject);socket.once('close',()=>resolve(data));});
  assert.match(response,/^HTTP\/1\.1 400 /);assert.equal(child.exitCode,null);const live=await fetch(`http://127.0.0.1:${port}/live`);assert.equal(live.status,200);
});
