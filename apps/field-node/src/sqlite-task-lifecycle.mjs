const parse = (value) => value ? JSON.parse(value) : null;

export function projectPersistedTaskLifecycle({ db, task, clock }) {
  if (!task) return null;
  const rows = db.prepare(`
    SELECT m.id mutation_id,m.type,m.wall_clock_at,q.state sync_state,q.attempts,q.next_attempt_at,q.last_error,q.updated_at
    FROM mutation m LEFT JOIN sync_queue q ON q.mutation_id=m.id
    WHERE m.incident_id=? AND (
      json_extract(m.payload,'$.taskId')=? OR
      json_extract(m.payload,'$.task.taskId')=?
    ) ORDER BY m.local_sequence
  `).all(task.incidentId, task.taskId, task.taskId);
  const pending = rows.filter((row) => row.sync_state && row.sync_state !== 'SENT');
  const completion = rows.findLast((row) => row.type === 'TASK_UPDATED');
  const totalAttempts = rows.reduce((sum, row) => sum + Number(row.attempts ?? 0), 0);
  const attemptedRows = rows.filter((row) => Number(row.attempts ?? 0) > 0);
  const now = clock().toISOString();
  const deadlinePassed = Number.isFinite(Date.parse(task.dueAt ?? '')) && Date.parse(task.dueAt) <= Date.parse(now);
  const locallyCompleted = task.state === 'COMPLETED';
  const completionReconciled = locallyCompleted && (completion?.sync_state === 'SENT' || task.lastCompletion?.syncState === 'ACKNOWLEDGED_CENTRAL');
  return Object.freeze({
    schemaVersion: 'vigia.fieldnet-task-lifecycle.v1',
    taskId: task.taskId,
    incidentId: task.incidentId,
    taskState: task.state,
    attemptCount: totalAttempts,
    lastAttempt: attemptedRows.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0]?.updated_at ?? null,
    nextAttempt: pending.map((row) => row.next_attempt_at).filter(Boolean).sort()[0] ?? null,
    backoff: pending.some((row) => row.next_attempt_at) ? { state: 'WAITING_FOR_RETRY_WINDOW', nextAttempt: pending.map((row) => row.next_attempt_at).filter(Boolean).sort()[0] } : { state: pending.length ? 'READY_TO_SYNC' : 'NOT_REQUIRED', nextAttempt: null },
    deadline: task.dueAt ?? null,
    escalation: deadlinePassed && !completionReconciled
      ? { state: 'DUE', escalateTo: 'INCIDENT_COMMAND', reason: locallyCompleted ? 'Local completion is not centrally reconciled by the task deadline.' : 'The evidence task is not locally complete by its deadline.' }
      : { state: 'MONITORING', escalateTo: 'INCIDENT_COMMAND', reason: 'Escalate if evidence is not locally completed and centrally reconciled by the deadline.' },
    localPersistence: { state: 'PERSISTED_LOCAL', taskVersion: task.version },
    localCompletion: locallyCompleted
      ? { state: completionReconciled ? 'COMPLETED_AND_RECONCILED' : 'COMPLETED_LOCAL_PENDING_SYNC', completedAt: task.completedAt ?? null, evidence: task.completionEvidence ?? [] }
      : { state: 'NOT_COMPLETED', completedAt: null, evidence: [] },
    centralReconciliation: completionReconciled
      ? { state: 'CENTRAL_RECONCILED', reconciledAt: completion?.updated_at ?? task.lastCompletion?.centralReconciledAt ?? null }
      : { state: 'LOCAL_ONLY_PENDING_SYNC', pendingMutationCount: pending.length, lastError: pending.findLast((row) => row.last_error)?.last_error ?? null },
    completionCriteria: task.completionCriteria ?? null,
    truthBoundary: 'Lifecycle state is derived from durable local mutations and central sync receipts. It does not prove report admission, capacity, dispatch, authority, arrival, or outcome.'
  });
}
