import { resolutionPolicyFor } from '../../../../../packages/domain/src/sensor-resolution-policy.mjs';

const IMPLEMENTED_SCREENS = Object.freeze([
  { id: 'sentinel2-spectral-change-v2', label: 'Sentinel-2 spectral change screen', state: 'implemented_unvalidated', decisionType: 'landscape_spectral_change', evidenceTypes: ['native_sentinel2_bands'], output: 'polygon', implementation: 'workers/geospatial/spectral_change.py' },
  { id: 'sentinel2-fuel-continuity-v1', label: 'Sentinel-2 fuel-continuity change screen', state: 'implemented_unvalidated', decisionType: 'fuel_continuity', evidenceTypes: ['native_sentinel2_bands','mapped_structure_context'], output: 'polygon', implementation: 'workers/geospatial/fuel_continuity.py' }
]);
export class DetectorRegistry {
  constructor({ clock = () => new Date() } = {}) { this.clock = clock; }
  models() {
    return IMPLEMENTED_SCREENS.map((model) => ({ ...model, resolutionPolicy: resolutionPolicyFor(model.decisionType), operational: false, calibrated: false, notice: 'Source implementation exists, but Portugal validation and prospective evidence do not. Output remains a screening candidate.' }));
  }
  findings() { return []; }
}
