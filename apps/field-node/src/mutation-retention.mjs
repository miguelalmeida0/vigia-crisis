import { sha256, stableId } from '../../../packages/domain/src/fieldnet/contracts.mjs';

export function compactAcknowledgedMutations({ db, nodeId, clock, maxRetainedMutations }) {
  const retained = Number(db.prepare('SELECT count(*) count FROM mutation').get().count);
  const trigger = Math.max(1, Math.floor(maxRetainedMutations * .8));
  if (retained < trigger) return { compacted: 0, checkpointId: null };

  const target = Math.max(0, Math.floor(maxRetainedMutations * .5));
  const limit = Math.max(0, retained - target);
  const protectedRetention = "AND NOT EXISTS (SELECT 1 FROM mutation m2 WHERE m2.id=m.id AND m2.priority IN ('P0_LIFE_SAFETY','P1_COMMAND'))";
  const ordinary = db.prepare(`SELECT m.id,m.local_sequence,m.payload_hash,q.id queue_id FROM mutation m LEFT JOIN sync_queue q ON q.mutation_id=m.id WHERE m.sync_state='ACKNOWLEDGED' AND (q.id IS NULL OR q.state='SENT') ${protectedRetention} ORDER BY m.local_sequence LIMIT ?`).all(limit);
  const rows=ordinary;
  if (!rows.length) return { compacted: 0, checkpointId: null };

  const prior = db.prepare('SELECT record_hash FROM mutation_compaction_checkpoint ORDER BY sequence DESC LIMIT 1').get();
  const createdAt = clock().toISOString();
  const payloadHash = sha256(rows.map(({ id, local_sequence, payload_hash }) => ({ id, localSequence: local_sequence, payloadHash: payload_hash })));
  const first = Number(rows[0].local_sequence), last = Number(rows.at(-1).local_sequence);
  const id = stableId('field-mutation-compaction', nodeId, first, last, payloadHash);
  const material = { id, previousHash: prior?.record_hash ?? null, payloadHash, firstLocalSequence: first, lastLocalSequence: last, mutationCount: rows.length, createdAt };
  const recordHash = sha256(material), deleteQueue = db.prepare('DELETE FROM sync_queue WHERE id=?'), deleteMutation = db.prepare('DELETE FROM mutation WHERE id=?');
  for (const row of rows) { if(row.queue_id)deleteQueue.run(row.queue_id); deleteMutation.run(row.id); }
  db.prepare('INSERT INTO mutation_compaction_checkpoint(id,previous_hash,payload_hash,record_hash,first_local_sequence,last_local_sequence,mutation_count,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, material.previousHash, payloadHash, recordHash, first, last, rows.length, createdAt);
  return { compacted: rows.length, checkpointId: id, recordHash, firstLocalSequence: first, lastLocalSequence: last };
}
