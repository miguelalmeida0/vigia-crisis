import assert from 'node:assert/strict';
import { createOneTimeAdmission,verifyOneTimeAdmission } from '../admission.mjs';

const secret='operator-admission-contract-secret-at-least-32-bytes';
const now=Date.parse('2026-08-23T20:00:00Z'),used=new Set(),token=createOneTimeAdmission(secret,{now,nonce:'a'.repeat(48)}),claim=verifyOneTimeAdmission(token,secret,{now,usedNonces:used});
assert.equal(claim.aud,'vigia-operator-console');assert.equal(used.has('a'.repeat(48)),true);
assert.throws(()=>verifyOneTimeAdmission(token,secret,{now,usedNonces:used}),/replayed/);
assert.throws(()=>verifyOneTimeAdmission(`${token}x`,secret,{now}),/rejected/);
assert.throws(()=>verifyOneTimeAdmission(token,secret,{now:now+121_000}),/expired/);
console.log('One-time admission contract passed: signed, bounded, replay-resistant, and expiry-enforced.');
