import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectTimestamp } from '../src/timestamp-firewall.mjs';

const now = new Date('2026-08-07T12:00:00Z');
test('timestamp firewall rejects missing, epoch and future values', () => {
  assert.equal(inspectTimestamp(null, { now }).reason, 'missing');
  assert.equal(inspectTimestamp('1970-01-01T00:00:00Z', { now }).reason, 'implausibly_old');
  assert.equal(inspectTimestamp('2027-01-01T00:00:00Z', { now }).reason, 'future');
  assert.equal(inspectTimestamp('2026-08-07T11:00:00Z', { now }).valid, true);
});
