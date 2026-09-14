import { immutable, requiredText, semanticHash } from '../intelligence/shared.mjs';
import { TASK_STATES, TERMINAL_TASK_STATES } from './constants.mjs';

const ALLOWED = Object.freeze({ PLANNED: ['READY', 'CANCELLED'], READY: ['RUNNING', 'CANCELLED', 'SUPERSEDED'], RUNNING: ['WAITING', 'RETRYABLE', 'BLOCKED', 'QUARANTINED', 'COMPLETED', 'FAILED', 'CANCELLED'], WAITING: ['READY', 'BLOCKED', 'CANCELLED'], RETRYABLE: ['READY', 'BLOCKED', 'FAILED', 'CANCELLED'], BLOCKED: ['SUPERSEDED'], QUARANTINED: ['READY', 'SUPERSEDED'], COMPLETED: ['SUPERSEDED'], FAILED: ['READY', 'SUPERSEDED'], CANCELLED: ['SUPERSEDED'], SUPERSEDED: [] });

export function createPipelineTask(input = {}) {
  const identity = { definitionId: requiredText(input.definitionId, 'pipeline_definition_required'), operation: requiredText(input.operation, 'pipeline_operation_required'), inputFingerprint: requiredText(input.inputFingerprint, 'pipeline_input_fingerprint_required'), scope: structuredClone(input.scope ?? {}) };
  const taskId = semanticHash('pipeline-task', identity), now = new Date(input.createdAt ?? Date.now()).toISOString();
  const task = { schemaVersion: 'vigia.pipeline-task.v1', taskId, ...identity, state: 'PLANNED', attempt: 0, maxAttempts: Number(input.maxAttempts ?? 3), notBefore: now, executionBudget: structuredClone(input.executionBudget ?? { maxRuntimeMs: 120_000, maxBytes: 64 * 1024 * 1024 }), checkpoint: null, failure: null, history: [{ from: null, to: 'PLANNED', at: now, reason: 'TASK_CREATED' }], createdAt: now, updatedAt: now };
  if (!Number.isInteger(task.maxAttempts) || task.maxAttempts < 1) throw new Error('pipeline_max_attempts_invalid');
  return immutable(task);
}

export function transitionPipelineTask(task, to, { at = new Date().toISOString(), reason = 'STATE_TRANSITION', checkpoint, failure, backoffMs = 0 } = {}) {
  if (!TASK_STATES.includes(to) || !(ALLOWED[task.state] ?? []).includes(to)) throw new Error(`pipeline_transition_invalid:${task.state}:${to}`);
  const attempt = to === 'RUNNING' ? task.attempt + 1 : task.attempt;
  if (to === 'READY' && task.attempt >= task.maxAttempts) throw new Error('pipeline_retry_budget_exhausted');
  return immutable({ ...task, state: to, attempt, checkpoint: checkpoint ?? task.checkpoint, failure: failure ?? (to === 'COMPLETED' ? null : task.failure), notBefore: new Date(Date.parse(at) + backoffMs).toISOString(), history: [...task.history, { from: task.state, to, at: new Date(at).toISOString(), reason }], updatedAt: new Date(at).toISOString() });
}

export function recoverPipelineTasks(tasks = [], now = new Date().toISOString()) {
  return immutable(tasks.map((task) => task.state === 'RUNNING' ? transitionPipelineTask(task, task.attempt < task.maxAttempts ? 'RETRYABLE' : 'FAILED', { at: now, reason: 'CRASH_RECOVERY', failure: { code: 'WORKER_INTERRUPTED' } }) : task));
}

export function runnableTasks(tasks = [], now = Date.now(), limit = 2) {
  return immutable(tasks.filter((task) => task.state === 'READY' && Date.parse(task.notBefore) <= now && !TERMINAL_TASK_STATES.includes(task.state)).sort((a, b) => a.taskId.localeCompare(b.taskId)).slice(0, limit));
}
