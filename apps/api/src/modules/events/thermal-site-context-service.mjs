import { readFile } from 'node:fs/promises';
import { buildThermalContextResolver } from '../../../../../packages/domain/src/thermal-site-context.mjs';

export class ThermalSiteContextService {
  #resolve = null;
  constructor({ filePath = '' } = {}) { this.filePath = filePath; this.state = { state: filePath ? 'loading' : 'not_configured', filePath: filePath || null, datasetHash: null, featureCount: 0, error: filePath ? null : 'No thermal site-context index is configured.' }; }
  async initialize() {
    if (!this.filePath) return this.state;
    try {
      const value = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (value?.schema !== 'vigia.thermal-site-context-index.v1' || !Array.isArray(value.features) || !value.portugalBoundary) throw new Error('invalid_thermal_site_context_index');
      this.#resolve = buildThermalContextResolver(value);
      this.state = { state: 'ready', filePath: this.filePath, datasetHash: value.datasetHash ?? null, featureCount: value.features.length, error: null, qualification: value.referenceQualification ?? null };
    } catch (error) { this.#resolve = null; this.state = { state: 'unavailable', filePath: this.filePath, datasetHash: null, featureCount: 0, error: String(error.message ?? error) }; }
    return this.state;
  }
  resolve(coordinate) { return this.#resolve ? this.#resolve(coordinate) : { insidePortugal: null, heatContext: null, state: this.state.state }; }
  status() { return { ...this.state }; }
}
