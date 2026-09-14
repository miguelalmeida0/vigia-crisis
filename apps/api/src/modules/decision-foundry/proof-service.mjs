import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { createRevocationRegistry, createSignedStatement, createTrustRootRegistry, exportPublicKey, signProofEnvelope, verifyProofEnvelope } from '../../../../../packages/domain/src/proof-plane/index.mjs';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { decisionFoundryPaths } from './decision-foundry-paths.mjs';

const issuerId = 'vigia-decision-foundry', principalId = 'machine:decision-foundry-compiler', keyId = 'decision-foundry-ed25519-v1';
async function keyMaterial(projectRoot) {
  const directory = decisionFoundryPaths(projectRoot).keys, privatePath = path.join(directory, 'private.pem'); await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  try { return await readFile(privatePath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const pair = generateKeyPairSync('ed25519'), value = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  try { await writeFile(privatePath, value, { mode: 0o600, flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; return readFile(privatePath, 'utf8'); }
  await chmod(privatePath, 0o600); return value;
}

export async function signDecisionPacket(packet, { projectRoot = process.cwd() } = {}) {
  const privateKey = await keyMaterial(projectRoot), publicKey = exportPublicKey(privateKey), issuedAt = packet.knowledgeTime, expiresAt = new Date(Date.parse(issuedAt) + 86_400_000).toISOString(), nonce = semanticHash('decision-packet-proof-nonce', packet.replayFingerprint).split(':').at(-1);
  const statement = createSignedStatement({ statementType: 'CRISIS_DECISION_PACKET', issuerId, principalId, organizationId: 'VIGIA', subjectId: packet.incident.id, payload: { requestFingerprint: packet.replayFingerprint, packetFingerprint: packet.replayFingerprint }, scope: { incidentIds: [packet.incident.id], resourceTypes: ['CRISIS_DECISION_PACKET'], actionClasses: ['COMPILE_DECISION_PACKET'] }, issuedAt, expiresAt, nonce, sequence: 0, keyId });
  const proof = signProofEnvelope(statement, privateKey), trustRoots = createTrustRootRegistry([{ issuerId, organizationId: 'VIGIA', keyId, publicKey, usages: ['CRISIS_DECISION_PACKET'], validFrom: '2020-01-01T00:00:00.000Z', validUntil: '2035-01-01T00:00:00.000Z' }]), verification = verifyProofEnvelope(proof, { trustRoots, revocations: createRevocationRegistry([]), at: issuedAt, expectedStatementHash: packet.replayFingerprint, expectedScope: statement.scope, usage: 'CRISIS_DECISION_PACKET' });
  return { proof, verification, publicTrust: { schemaVersion: trustRoots.schemaVersion, fingerprint: trustRoots.fingerprint, roots: trustRoots.roots.map(({ publicKey: key, ...root }) => ({ ...root, publicKeyFingerprint: semanticHash('public-key', key) })) } };
}
