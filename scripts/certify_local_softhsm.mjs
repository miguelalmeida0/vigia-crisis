import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { semanticHash } from '../packages/domain/src/intelligence/shared.mjs';
import { writeJsonAtomic } from '../apps/api/src/shared/json-file.mjs';

const execute = promisify(execFile), root = process.cwd(), image = process.env.VIGIA_SOFTHSM_IMAGE ?? 'debian:bookworm-slim', userPin = randomBytes(12).toString('hex'), soPin = randomBytes(12).toString('hex'), startedAt = new Date().toISOString();
const script = `
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq softhsm2 opensc openssl >/dev/null
mkdir -p /tokens
printf 'directories.tokendir = /tokens\nobjectstore.backend = file\nlog.level = ERROR\n' >/tmp/softhsm2.conf
export SOFTHSM2_CONF=/tmp/softhsm2.conf
softhsm2-util --init-token --free --label vigia-certification-v1 --so-pin "$SO_PIN" --pin "$USER_PIN" >/dev/null
MODULE=$(find /usr/lib -name libsofthsm2.so -print -quit)
printf 'VIGIA immutable certification statement v1' >/tmp/message
openssl dgst -sha256 -binary /tmp/message >/tmp/digest
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --keypairgen --key-type rsa:2048 --id 01 --label vigia-cert-v1 >/dev/null 2>&1
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --sign --mechanism RSA-PKCS --id 01 --input-file /tmp/digest --output-file /tmp/signature-v1 >/dev/null 2>&1
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --verify --mechanism RSA-PKCS --id 01 --input-file /tmp/digest --signature-file /tmp/signature-v1 >/dev/null 2>&1
echo 'VIGIA_STEP initial_sign_verify PASS'
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --keypairgen --key-type rsa:2048 --id 02 --label vigia-cert-v2 >/dev/null 2>&1
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --sign --mechanism RSA-PKCS --id 02 --input-file /tmp/digest --output-file /tmp/signature-v2 >/dev/null 2>&1
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --verify --mechanism RSA-PKCS --id 02 --input-file /tmp/digest --signature-file /tmp/signature-v2 >/dev/null 2>&1
echo 'VIGIA_STEP rotated_key_sign_verify PASS'
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --verify --mechanism RSA-PKCS --id 01 --input-file /tmp/digest --signature-file /tmp/signature-v1 >/dev/null 2>&1
echo 'VIGIA_STEP historical_signature_after_rotation PASS'
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --delete-object --type privkey --id 01 >/dev/null 2>&1
if pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --sign --mechanism RSA-PKCS --id 01 --input-file /tmp/digest --output-file /tmp/revoked-signature >/dev/null 2>&1; then exit 41; fi
echo 'VIGIA_STEP revoked_key_sign_rejected PASS'
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --verify --mechanism RSA-PKCS --id 01 --input-file /tmp/digest --signature-file /tmp/signature-v1 >/dev/null 2>&1
echo 'VIGIA_STEP historical_signature_after_revocation PASS'
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --delete-object --type pubkey --id 01 >/dev/null 2>&1
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --delete-object --type privkey --id 02 >/dev/null 2>&1
pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --delete-object --type pubkey --id 02 >/dev/null 2>&1
COUNT=$(pkcs11-tool --module "$MODULE" --login --pin "$USER_PIN" --list-objects 2>/dev/null | grep -c '^Public Key Object\|^Private Key Object' || true)
test "$COUNT" = 0
echo 'VIGIA_STEP key_objects_destroyed PASS'
`;

let result, error = null;
try { result = await execute('docker', ['run', '--rm', '--env', `USER_PIN=${userPin}`, '--env', `SO_PIN=${soPin}`, image, 'sh', '-ceu', script], { timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }); } catch (cause) { error = String(cause.stderr || cause.message || cause).slice(0, 2000); }
const steps = Object.fromEntries(String(result?.stdout ?? '').split('\n').map((line) => line.match(/^VIGIA_STEP ([a-z_]+) (PASS)$/)).filter(Boolean).map((match) => [match[1], match[2]])), required = ['initial_sign_verify', 'rotated_key_sign_verify', 'historical_signature_after_rotation', 'revoked_key_sign_rejected', 'historical_signature_after_revocation', 'key_objects_destroyed'], imageIdentity = await execute('docker', ['image', 'inspect', image, '--format', '{{index .RepoDigests 0}}'], { timeout: 30_000 }).then((value) => value.stdout.trim()).catch(() => null), core = { schemaVersion: 'vigia.local-softhsm-certification.v1', startedAt, completedAt: new Date().toISOString(), evidenceClass: 'ENGINEERING_ONLY_LOCAL_HSM_BOUNDARY', actualCloudKmsEvidence: false, implementation: { boundary: 'SoftHSM2 PKCS#11 inside ephemeral Docker container', image, imageIdentity, keyAlgorithm: 'RSA-2048', signingMechanism: 'RSA-PKCS over SHA-256 digest', pinOrKeyMaterialRecorded: false }, steps, required, error, cleanup: { container: 'AUTO_REMOVED_BY_DOCKER_RM', tokenDirectory: 'EPHEMERAL_CONTAINER_FILESYSTEM_DESTROYED', keyObjectsExplicitlyDeletedBeforeContainer_EXIT: steps.key_objects_destroyed === 'PASS', recoverability: 'TEST_KEYS_INTENTIONALLY_DESTROYED' }, qualification: 'This proves the VIGIA key-management lifecycle against a local PKCS#11 HSM boundary; it is not live AWS/GCP/Azure KMS evidence.' }, report = { ...core, passed: !error && required.every((name) => steps[name] === 'PASS'), fingerprint: semanticHash('local-softhsm-certification', core) };
await writeJsonAtomic(path.join(root, 'data/validation/evidence-war-room/local-softhsm-certification.json'), report); process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); if (!report.passed) process.exitCode = 2;
