import assert from 'node:assert/strict';
import { defaultState } from '../src/storage.js';

const state=structuredClone(defaultState);
Object.assign(state,{selectedIncidentId:'incident:phase-b',selectedEvidenceId:'evidence:phase-b',incidentSearch:'perimeter',incidentStateFilter:'OPEN',incidentSort:'CHANGED',incidentTab:'forecast',intelligenceTab:'lineage',debtSearch:'authority',debtFilter:'BLOCKED',operationsTab:'receipts',authorityTab:'delegations',controlTab:'budgets',reportsTab:'performance',globalRegion:'AUTHORIZED',mapZoom:8,mapThermal:true});
const roundTrip=JSON.parse(JSON.stringify(state));
for(const [key,value] of Object.entries(state))assert.deepEqual(roundTrip[key],value,`${key} failed persistence round trip`);
assert.equal(defaultState.selectedIncidentId,null);
assert.equal(defaultState.selectedEvidenceId,null);
assert.equal(defaultState.mapThermal,false,'optional external thermal raster must be opt-in; canonical thermal observations remain independently visible');
console.log('Phase B persistent-state serialization passed.');
