import { AlertTransport } from '../src/modules/protection/cap-alert-transport.mjs';

export const ACTOR = { id: 'supervisor:exercise', role: 'supervisor', incidentScopes: ['*'] };
export const START = '2026-09-04T12:00:00.000Z';
export const TARGET = { type: 'EXERCISE_CONTROL', id: 'exercise-control:eoc-1', label: 'EOC exercise controller' };
export const CAP = {
  sender: 'exercise-authority@example.invalid',
  urgency: 'Immediate',
  severity: 'Severe',
  certainty: 'Possible',
  headline: 'Exercise wildfire protection notice',
  instruction: 'Exercise only. Take no public action.'
};

export function repository(initial = {}) {
  let state = structuredClone(initial);
  return {
    snapshot: () => structuredClone(state),
    async mutate(mutator) {
      state = await mutator(structuredClone(state));
      return structuredClone(state);
    }
  };
}

export class ProbeTransport extends AlertTransport {
  constructor({ enabled = true } = {}) {
    super({ id: 'probe-external-transport', enabled });
    this.sent = [];
  }

  async send(message) {
    this.sent.push(structuredClone(message));
    return { receiptId: `external:${this.sent.length}` };
  }
}

export function workflowInput(workflowId, universe = 'EXERCISE') {
  return {
    workflowId,
    universe,
    targetPopulationOrArea: {
      areaDesc: 'Governed exercise control area',
      geocode: [{ valueName: 'EXERCISE_ONLY', value: `zone:${workflowId}` }]
    },
    exposureAssessment: 'Exercise-only attributable exposure context.',
    protectionThreshold: 'Exercise controller threshold reached.',
    recommendation: 'Prepare an isolated exercise CAP message.',
    authorityRequirement: 'Named exercise protection authority',
    authorityOwner: 'Exercise duty authority',
    authorityValidUntil: '2026-09-04T13:30:00.000Z',
    expiresAt: '2026-09-04T14:00:00.000Z',
    expectedPostcondition: 'The isolated exercise controller records the lifecycle receipt.',
    provenanceRefs: ['exercise:evidence:threshold']
  };
}

export async function prepare(service, incidentId, workflowId, universe = 'EXERCISE') {
  await service.create(ACTOR, incidentId, workflowInput(workflowId, universe));
  await service.transition(ACTOR, incidentId, workflowId, { state: 'REVIEW' });
  const approval = await service.transition(ACTOR, incidentId, workflowId, { state: 'APPROVED' });
  await service.transition(ACTOR, incidentId, workflowId, { state: 'DISPATCH_ELIGIBLE' });
  return approval;
}
