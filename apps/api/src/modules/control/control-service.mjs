import { capabilitiesFor } from '../../../../../packages/domain/src/authorization.mjs';

export class ControlService {
  constructor({ repository }) { this.repository = repository; }

  snapshot() {
    const state = this.repository.snapshot();
    return { organizations: state.organizations, workspaces: state.workspaces, territories: state.territories, actors: state.actors };
  }

  actor(id) {
    const actor = typeof this.repository.actor === 'function' ? this.repository.actor(id) : (this.repository.snapshot().actors ?? []).find((item) => item.id === id) ?? null;
    return actor ? { ...actor, capabilities: capabilitiesFor(actor.role) } : null;
  }
}
