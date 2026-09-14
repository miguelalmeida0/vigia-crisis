import path from 'node:path';
import { runGeospatialProcess } from './geospatial-process.mjs';

export class ScientificRuntimeService {
  constructor({ projectRoot, python = 'python3', timeoutMs = 20_000, runner = runGeospatialProcess, clock = () => new Date() } = {}) { Object.assign(this, { python, timeoutMs, runner, clock }); this.script = path.join(projectRoot, 'scripts/geo_doctor.py'); this.state = { state: 'not_checked', checkedAt: null, ok: false, details: null }; }
  async refresh() {
    let result = await this.runner({ python: this.python, script: this.script, input: {}, timeoutMs: this.timeoutMs });
    let attempts = 1;
    if (result?.error === 'geospatial_worker_timeout') {
      result = await this.runner({ python: this.python, script: this.script, input: {}, timeoutMs: this.timeoutMs });
      attempts += 1;
    }
    this.state = { state: result.ok === true ? 'ready' : 'unavailable', checkedAt: this.clock().toISOString(), ok: result.ok === true, details: { ...result, attempts } };
    return this.snapshot();
  }
  snapshot() { return structuredClone(this.state); }
}
