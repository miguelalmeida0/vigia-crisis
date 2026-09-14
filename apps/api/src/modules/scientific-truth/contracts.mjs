import { createHash } from 'node:crypto';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';

export const CLOSURE_SCHEMA = 'vigia.scientific-truth-closure.v1';
export const OPPORTUNITY_STATES = Object.freeze(['VALID_CLEAR_OBSERVATION', 'VALID_PROBABLY_CLEAR_OBSERVATION', 'CLOUD_CONTAMINATED', 'PROBABLY_CLOUDY', 'CLOUDY', 'OUTSIDE_COVERAGE', 'OUTSIDE_USEFUL_VIEW_GEOMETRY', 'PRODUCT_UNAVAILABLE', 'PROVIDER_UNAVAILABLE', 'QUALITY_INSUFFICIENT', 'NO_DATA', 'UNKNOWN']);
export const NEGATIVE_LABELS = Object.freeze(['NO_QUALIFYING_GOES_FIRE_DETECTION', 'NO_QUALIFYING_VIIRS_FIRE_DETECTION', 'NO_DETECTABLE_ACTIVE_WILDFIRE_UNDER_DEFINED_DOCTRINE', 'VALID_NO_OFFICIAL_WILDFIRE_INCIDENT', 'REAL_FIRE_NOT_WILDFIRE', 'AMBIGUOUS_THERMAL_EVENT', 'NO_VALID_OBSERVATION_OPPORTUNITY', 'UNKNOWN']);
export const PERIMETER_CLASSES = Object.freeze(['AUTHORITATIVE_OPERATIONAL_PERIMETER', 'OFFICIAL_REFERENCE_PERIMETER', 'DERIVED_SENSOR_PROGRESSION', 'RETROSPECTIVE_FINAL_PERIMETER', 'UNUSABLE']);
export const HORIZON_DOCTRINE = Object.freeze({ version: 'vigia.perimeter-horizon-tolerance.v1', hours: { '1h': [45, 90], '3h': [150, 240], '6h': [300, 450], '12h': [600, 900], '24h': [1200, 1800] }, interpolationAllowed: false, identicalStateAllowed: false, correctionOnlyAllowed: false });
export const GOES_NEGATIVE_DOCTRINE = Object.freeze({ version: 'vigia.goes-negative-doctrine.v1', requiredConsecutiveScans: 3, maximumScanSeparationMinutes: 15, geometryRadiusKm: 2, permittedCloudStates: ['VALID_CLEAR_OBSERVATION', 'VALID_PROBABLY_CLEAR_OBSERVATION'], maximumLocalZenithDegrees: 70, permittedFireDqf: [0, 1], permittedCloudDqf: [0], strongCrossSourceLabelRequires: ['official-source absence', 'FIRMS/VIIRS/MODIS absence', 'prescribed/managed-fire absence', 'persistent-anomaly absence'], sensorSpecificClaimOnly: true });

export const closurePaths = (root) => {
  const runtime = path.join(root, 'data/runtime/scientific-truth-closure'), validation = path.join(root, 'data/validation/scientific-truth-closure');
  return {
    runtime, validation,
    goes: path.join(validation, 'goes-observation-opportunities.json'), negatives: path.join(validation, 'goes-negative-packets.json'), hardNegatives: path.join(validation, 'hard-negative-product.json'),
    binding: path.join(validation, 'canada-incident-binding.json'), fuel: path.join(validation, 'canada-fuel-packs.json'), terrain: path.join(validation, 'canada-terrain-packs.json'), weather: path.join(validation, 'canada-weather-packs.json'),
    perimeterArchive: path.join(runtime, 'perimeter-campaign.json'), sensorProgression: path.join(validation, 'goes-sensor-progression.json'), perimeterStatus: path.join(validation, 'perimeter-campaign-status.json'), labels: path.join(validation, 'near-term-perimeter-labels.json'),
    decisionAudit: path.join(validation, 'decision-learning-evidence-audit.json'), outcomes: path.join(validation, 'realized-decision-outcomes.json'), corpora: path.join(validation, 'scientific-task-corpora.json'), evaluation: path.join(validation, 'scientific-evaluation.json'),
    release: path.join(validation, 'release-images.json'), verification: path.join(validation, 'verification.json'), report: path.join(validation, 'scientific-truth-closure-report.json'), historicalWeatherOrder: path.join(validation, 'eccc-historical-weather-order-manifest.json')
  };
};

export function fingerprint(kind, value) { return `${kind}:sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }
export function artifact(kind, core) { const stable = structuredClone(core); delete stable.generatedAt; return { ...core, fingerprint: fingerprint(kind, stable) }; }
export async function readArtifact(file, fallback = null) { return readJson(file, fallback); }
export async function writeArtifact(file, kind, core) { const value = artifact(kind, core); await writeJsonAtomic(file, value); return value; }
export const km = (a, b) => { const p = Math.PI / 180, dLat = (b[1] - a[1]) * p, dLon = (b[0] - a[0]) * p, q = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * p) * Math.cos(b[1] * p) * Math.sin(dLon / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)); };
export const pointOf = (geometry) => geometry?.type === 'Point' && geometry.coordinates?.length >= 2 ? geometry.coordinates.slice(0, 2).map(Number) : null;
export const sorted = (values) => [...new Set(values.filter(Boolean))].sort();
export function assertRights(rights) { if (rights?.permitScientificRetention !== true || !rights.licenceId) throw new Error('scientific_truth_rights_not_permitted'); return rights; }
export function redactCredentialState(env = process.env) { const names = ['EARTHDATA_TOKEN', 'LAADS_TOKEN', 'NASA_EARTHDATA_TOKEN']; return { configured: names.some((name) => Boolean(env[name])), inspectedNames: names, valuesRecorded: false, requirement: names.some((name) => Boolean(env[name])) ? null : 'Provide an Earthdata/LAADS bearer token through EARTHDATA_TOKEN, LAADS_TOKEN, or NASA_EARTHDATA_TOKEN; the value is never persisted or printed.' }; }
