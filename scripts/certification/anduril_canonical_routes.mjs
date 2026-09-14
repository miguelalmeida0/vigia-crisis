import { readFile } from "node:fs/promises";
import path from "node:path";
import { signOperatorProxyRequest } from "../../packages/domain/src/operator-proxy/request-auth.mjs";
import { governedCanonicalIncidentCount, sweepCanonicalIncidentTruth } from "./anduril_integrity.mjs";
import { auditGovernedStaticFacilityCoverage } from "./anduril_static_facility_audit.mjs";

export async function collectCanonicalRoutes({ root, apiOrigin, operatorOrigin, identity, manifest, rows, section, sectionState, readJson, writeJson }) {
  const tokenPath = path.join(root, ".tmp/release/operator-token");
  const operatorKey = await readFile(tokenPath, "utf8")
    .then((value) => String(value).trim())
    .catch(() => null);
  const calls = [];
  async function request(route) {
    if (!operatorKey)
      return {
        ok: false,
        status: 0,
        route,
        durationMs: null,
        bytes: 0,
        body: null,
        error: "operator_token_unavailable",
      };
    const bodyBytes = Buffer.alloc(0);
    const headers = {
      accept: "application/json",
      origin: operatorOrigin,
      "sec-fetch-site": "same-origin",
      "x-vigia-ui-proxy": "mission-dark-realdata-2.0",
      ...signOperatorProxyRequest({
        key: operatorKey,
        releaseId: identity.releaseId,
        method: "GET",
        path: route,
        bodyBytes,
      }),
    };
    const started = performance.now();
    try {
      const response = await fetch(`${apiOrigin}${route}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      const raw = await response.text();
      const durationMs = Number((performance.now() - started).toFixed(2));
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
      const result = {
        ok: response.ok,
        status: response.status,
        route,
        durationMs,
        bytes: Buffer.byteLength(raw),
        body,
        error: response.ok ? null : (body?.error ?? body?.message ?? "request_failed"),
      };
      calls.push({
        route,
        status: result.status,
        durationMs,
        bytes: result.bytes,
      });
      return result;
    } catch (error) {
      const result = {
        ok: false,
        status: 0,
        route,
        durationMs: Number((performance.now() - started).toFixed(2)),
        bytes: 0,
        body: null,
        error: String(error?.message ?? error),
      };
      calls.push({
        route,
        status: 0,
        durationMs: result.durationMs,
        bytes: 0,
        error: result.error,
      });
      return result;
    }
  }
  const basePaths = {
    command: "/api/v10/operator/command-overview",
    incidents: "/api/v10/operator/incidents",
    reports: "/api/v10/operator/reports",
    global: "/api/v10/operator/global-situational-awareness",
    operationalPeriods: "/api/v10/operator/operational-periods",
  };
  const base = {};
  for (const [name, route] of Object.entries(basePaths)) base[name] = await request(route);
  const canonicalIncidentProjection = section(base.incidents.body, "canonicalIncidents");
  const incidentRows = rows(canonicalIncidentProjection?.incidents);
  const canonicalIncidentCountContract = governedCanonicalIncidentCount(canonicalIncidentProjection, {
    projectionHash: base.incidents.body?.sourceProjection?.governedProjectionHash,
  });
  const expectedCanonicalIncidentCount = canonicalIncidentCountContract.expectedCount;
  const canonicalTruthSweep = sweepCanonicalIncidentTruth(incidentRows, {
    expectedCount: expectedCanonicalIncidentCount,
  });
  canonicalTruthSweep.countContract = canonicalIncidentCountContract;
  await writeJson("baseline/canonical-truth-invariant-sweep.json", canonicalTruthSweep);
  const selectedIncidentId = incidentRows[0]?.incident?.id ?? null;
  const activeIncidentIds = incidentRows
    .filter((item) => item?.operationalTruth?.classification === "VERIFIED_CURRENT" && item?.operationalTruth?.countsAsActive === true)
    .map((item) => item?.incident?.id)
    .filter(Boolean);
  const governedGeolocatedIncidentIds = [
    ...new Set(
      incidentRows
        .filter((item) => {
          const coverage = item?.operationalTruth?.axes?.incidentCoverage;
          const coordinate = coverage?.coordinate ?? item?.incident?.coordinate;
          return ["GEOLOCATED", "AREA_GEOMETRY"].includes(coverage?.state) && Array.isArray(coordinate) && coordinate.length === 2 && coordinate.every(Number.isFinite);
        })
        .map((item) => item?.incident?.id)
        .filter(Boolean),
    ),
  ];
  const incidentPaths = selectedIncidentId
    ? {
        detail: `/api/v10/operator/incidents/${encodeURIComponent(selectedIncidentId)}`,
        intelligence: `/api/v10/operator/incidents/${encodeURIComponent(selectedIncidentId)}/intelligence`,
        operations: `/api/v10/operator/incidents/${encodeURIComponent(selectedIncidentId)}/operations`,
        responseCapability: `/api/v10/operator/incidents/${encodeURIComponent(selectedIncidentId)}/response-capability`,
      }
    : {};
  const incidentRoutes = {};
  for (const [name, route] of Object.entries(incidentPaths)) incidentRoutes[name] = await request(route);
  const governedStaticFacilityAudit = await auditGovernedStaticFacilityCoverage({ root, incidentRows });
  await writeJson("baseline/governed-static-response-facility-audit.json", governedStaticFacilityAudit);
  const governedResponse = [];
  const activeResponse = [];
  const directAutopilots = ["detail", "intelligence", "operations"].map((name) => section(incidentRoutes[name]?.body, "crisisAutopilot")).filter(Boolean);
  const portfolios = ["command", "reports", "global"].map((name) => ({
    name,
    value: section(base[name]?.body, "crisisAutopilot"),
    state: sectionState(base[name]?.body, "crisisAutopilot"),
  }));
  const detailAutopilot = section(incidentRoutes.detail?.body, "crisisAutopilot");
  const responseEmbedded = ["detail", "intelligence", "operations"].map((name) => ({
    name,
    value: section(incidentRoutes[name]?.body, "responseCapability"),
    state: sectionState(incidentRoutes[name]?.body, "responseCapability"),
  }));
  const planningEmbedded = ["detail", "intelligence", "operations"].map((name) => ({
    name,
    value: section(incidentRoutes[name]?.body, "crisisPlanning"),
    state: sectionState(incidentRoutes[name]?.body, "crisisPlanning"),
  }));
  const standaloneResponse = incidentRoutes.responseCapability?.body;
  const operationalPeriods = section(base.operationalPeriods?.body, "operationalPeriod") ?? base.operationalPeriods?.body ?? {};
  const latestExercise =
    operationalPeriods.latestExercise ??
    rows(operationalPeriods.periods)
      .filter((item) => item.universe === "CONTROLLED_EOC_EXERCISE")
      .at(-1) ??
    null;
  const runtimeState = await readJson(path.join(root, "data/runtime/production-v1.json"), {});
  const governedContext = await readJson(path.join(root, "data/reference/operational-proof/governed-incident-context.json"), {});
  return {
    operatorKey,
    calls,
    request,
    basePaths,
    base,
    canonicalIncidentProjection,
    incidentRows,
    canonicalIncidentCountContract,
    expectedCanonicalIncidentCount,
    canonicalTruthSweep,
    selectedIncidentId,
    activeIncidentIds,
    governedGeolocatedIncidentIds,
    governedStaticFacilityAudit,
    incidentPaths,
    incidentRoutes,
    activeResponse,
    governedResponse,
    directAutopilots,
    portfolios,
    detailAutopilot,
    responseEmbedded,
    planningEmbedded,
    standaloneResponse,
    operationalPeriods,
    latestExercise,
    runtimeState,
    governedContext,
  };
}
