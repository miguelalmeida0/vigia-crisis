import assert from "node:assert/strict";
import test from "node:test";

import { analyzeOperationsAndMaps } from "./anduril_operations_map_analysis.mjs";

const rows = (value) => (Array.isArray(value) ? value : []);
const section = (source, name) => source?.[name] ?? null;
const route = (mapScene) => ({ body: { mapScene } });
const scene = () => ({
  selectedIncidentId: "incident:test",
  focusIncidentId: "incident:test",
  layers: {
    responseCoverageRoutes: { value: [] },
    responseCoverageSurface: { value: [] },
    responseFacilities: { value: [] },
    thermalSupport: { value: [] },
    observedGeometry: { value: [] },
    terrain: { state: "READY", value: [{ id: "terrain:1" }] },
  },
});

const base = () => ({
  incidentRoutes: { detail: route(scene()), intelligence: route(scene()), operations: route(scene()) },
  section,
  rows,
  latestExercise: null,
  runtimeState: {},
  selectedResponse: {
    incident: { id: "incident:test" },
    facilities: { HOSPITAL: [{ id: "hospital:1" }], FIRE_STATION: [{ id: "fire:1" }] },
    resourceCoverageMap: {
      routeFeatures: { features: [] },
      facilityFeatures: { features: [] },
      responseCoverageSurface: { features: { features: [] } },
    },
  },
  selectedIncidentId: "incident:test",
  incidentRows: [],
  governedContext: {},
  iso: () => true,
  objectRows: () => [],
});

test("selected response map proof cannot pass through empty projection arrays", () => {
  const result = analyzeOperationsAndMaps(base());
  assert.equal(result.scenes.length, 3);
  assert.equal(result.routeCoverageSceneViolations.length, 3);
  assert.ok(result.routeCoverageSceneViolations.every((item) => item.reason === "RESPONSE_COVERAGE_MAP_LAYERS_MISSING_OR_CLASS_TRUNCATED"));
});

test("missing selected response cannot make route map proof vacuously pass", () => {
  const state = base();
  state.selectedResponse = null;
  const result = analyzeOperationsAndMaps(state);
  assert.equal(result.routeCoverageSceneViolations.length, 3);
});
