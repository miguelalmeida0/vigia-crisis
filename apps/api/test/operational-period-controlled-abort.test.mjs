import test from 'node:test';
import assert from 'node:assert/strict';

import { OperationalPeriodService } from '../src/modules/operator/operational-period-service.mjs';

const INCIDENT_ID = 'incident:vqa-abort';
const AT = '2026-09-04T16:00:00.000Z';
const ENDS_AT = '2026-09-04T20:00:00.000Z';
const actor = (id = 'administrator:vqa') => ({ id, role: 'administrator', incidentScopes: [INCIDENT_ID] });
const memory = () => {
  let state = { operationalPeriods: [], operationalPeriodAfterActionPackages: [], audit: [] };
  return {
    snapshot: () => structuredClone(state),
    async mutate(mutator) { state = await mutator(structuredClone(state)); return structuredClone(state); }
  };
};
const exerciseInput = (namespace, periodId = 'period:vqa') => ({
  periodId,
  shift: namespace,
  commander: `Exercise Controller ${namespace}`,
  endsAt: ENDS_AT,
  incidentOwners: [{ incidentId: INCIDENT_ID, owner: `Exercise Controller ${namespace}` }],
  roles: [{ role: 'Exercise Controller', person: `Exercise Controller ${namespace}` }],
  authorityMatrix: [{ role: 'Exercise Controller', capability: 'Run isolated VQA exercise', scope: namespace }],
  exerciseMode: true,
  executionMode: 'HUMAN_OPERATOR_WORKFLOW',
  participantType: 'HUMAN_ROLE_PLAY',
  facilitator: `Exercise Controller ${namespace}`
});

test('owned VQA controlled exercise aborts terminally without deleting its partial record and unblocks a fresh period', async () => {
  const repository = memory();
  const service = new OperationalPeriodService({ repository, clock: () => new Date(AT) });
  const namespace = 'VQA-CONTROLLED-EOC-release-20260904T160000Z';
  await service.start(actor(), exerciseInput(namespace));

  const aborted = await service.abortControlledExercise(actor(), 'period:vqa', {
    namespace,
    reason: 'Browser certification interrupted after a persisted partial exercise step.'
  });

  assert.equal(aborted.state, 'ABORTED');
  assert.equal(aborted.universe, 'CONTROLLED_EOC_EXERCISE');
  assert.equal(aborted.exerciseAbort.productionTruth, false);
  assert.equal(aborted.exerciseAbort.externalEffect, false);
  assert.equal(aborted.exerciseAbort.namespace, namespace);
  assert.match(aborted.exerciseAbort.fingerprint, /^sha256:/);
  assert.equal(repository.snapshot().operationalPeriods.length, 1);
  assert.equal(repository.snapshot().operationalPeriods[0].history.at(-1).state, 'ABORTED');
  assert.equal(service.snapshot(actor()).current, null);

  const next = await service.start(actor(), exerciseInput('VQA-CONTROLLED-EOC-release-20260904T160100Z', 'period:vqa-retry'));
  assert.equal(next.state, 'ACTIVE');
});

test('controlled abort fails closed for LIVE, foreign namespace, and foreign actor', async () => {
  const liveRepository = memory();
  const liveService = new OperationalPeriodService({ repository: liveRepository, clock: () => new Date(AT) });
  await liveService.start(actor(), {
    periodId: 'period:live', shift: 'Live operational period', commander: 'Duty commander', endsAt: ENDS_AT,
    incidentOwners: [{ incidentId: INCIDENT_ID, owner: 'Duty commander' }]
  });
  await assert.rejects(
    liveService.abortControlledExercise(actor(), 'period:live', { namespace: 'VQA-CONTROLLED-EOC-forged', reason: 'forbidden' }),
    /live_operational_period_abort_forbidden/
  );
  assert.equal(liveRepository.snapshot().operationalPeriods[0].state, 'ACTIVE');

  const exerciseRepository = memory();
  const exerciseService = new OperationalPeriodService({ repository: exerciseRepository, clock: () => new Date(AT) });
  const namespace = 'VQA-CONTROLLED-EOC-release-20260904T160000Z';
  await exerciseService.start(actor(), exerciseInput(namespace));
  await assert.rejects(
    exerciseService.abortControlledExercise(actor(), 'period:vqa', { namespace: 'VQA-CONTROLLED-EOC-other', reason: 'forbidden' }),
    /controlled_exercise_abort_namespace_mismatch/
  );
  await assert.rejects(
    exerciseService.abortControlledExercise(actor('administrator:other'), 'period:vqa', { namespace, reason: 'forbidden' }),
    /controlled_exercise_abort_actor_mismatch/
  );
  assert.equal(exerciseRepository.snapshot().operationalPeriods[0].state, 'ACTIVE');
});
