import {
  GOLDEN_SCENARIO_CONTRACTS,
  GOLDEN_SCENARIO_DIAGNOSTIC_PREFIX,
  GOLDEN_SCENARIO_RECEIPT_SCHEMA,
  evidenceFingerprint,
  finiteIso,
  nonempty,
  rows,
} from "./anduril_integrity_shared.mjs";

export function parseNodeTap(tapText = "") {
  const tests = [];
  const summary = {
    tests: null,
    pass: null,
    fail: null,
    cancelled: null,
    skipped: null,
    todo: null,
    durationMs: null,
  };
  const durationByName = new Map();
  let currentSubtest = null;
  for (const rawLine of String(tapText).split(/\r?\n/)) {
    const line = rawLine.trim();
    const subtest = line.match(/^# Subtest:\s+(.+)$/);
    if (subtest) {
      currentSubtest = subtest[1].trim();
      continue;
    }
    const duration = line.match(/^duration_ms:\s+([0-9.]+)$/);
    if (duration && currentSubtest) {
      const durationMs = Number(duration[1]);
      durationByName.set(currentSubtest, durationMs);
      const observed = tests.findLast((item) => item.name === currentSubtest);
      if (observed) observed.durationMs = durationMs;
    }
    const result = line.match(/^(not )?ok\s+\d+\s+-\s+(.+?)(?:\s+#\s+.*)?$/);
    if (result) {
      const name = result[2].trim();
      tests.push({
        name,
        state: result[1] ? "FAIL" : "PASS",
        durationMs: durationByName.get(name) ?? null,
      });
      currentSubtest = name;
      continue;
    }
    const summaryEntry = line.match(/^#\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)$/);
    if (summaryEntry) summary[summaryEntry[1]] = Number(summaryEntry[2]);
    const totalDuration = line.match(/^#\s+duration_ms\s+([0-9.]+)$/);
    if (totalDuration) summary.durationMs = Number(totalDuration[1]);
  }
  return { schemaVersion: "vigia.node-tap-derived-results.v1", tests, summary };
}

export function createGoldenScenarioReceipt(input = {}) {
  const transitions = rows(input.transitions).map((transition, index) => ({
    sequence: index + 1,
    objectType: transition?.objectType ?? null,
    objectId: transition?.objectId ?? null,
    fromState: transition?.fromState ?? null,
    toState: transition?.toState ?? null,
    occurredAt: transition?.occurredAt ?? input.recordedAt ?? null,
    persisted: transition?.persisted === true,
    source: transition?.source ?? null,
    receiptReference: transition?.receiptReference ?? null,
  }));
  const claims = rows(input.claims).map((claim) => ({
    code: claim?.code ?? null,
    state: claim?.state ?? "PROVEN",
    evidenceReferences: rows(claim?.evidenceReferences),
  }));
  const core = {
    schemaVersion: GOLDEN_SCENARIO_RECEIPT_SCHEMA,
    scenarioId: input.scenarioId ?? null,
    testName: input.testName ?? null,
    universe: input.universe ?? "ISOLATED_TEST_FIXTURE",
    productionTruth: input.productionTruth === true,
    incidentId: input.incidentId ?? null,
    service: input.service ?? null,
    serviceEvidence: {
      beforeFingerprint: input.serviceEvidence?.beforeFingerprint ?? null,
      afterFingerprint: input.serviceEvidence?.afterFingerprint ?? null,
    },
    repository: {
      kind: input.repository?.kind ?? null,
      scope: input.repository?.scope ?? null,
      beforeRevision: input.repository?.beforeRevision ?? null,
      afterRevision: input.repository?.afterRevision ?? null,
      persisted: input.repository?.persisted === true,
    },
    transitions,
    claims,
    resultState: input.resultState ?? "PASS",
    recordedAt: input.recordedAt ?? null,
    truthBoundary: input.truthBoundary ?? null,
  };
  const fingerprint = evidenceFingerprint(core);
  return Object.freeze({
    ...core,
    receiptId: `golden-receipt:${String(core.scenarioId ?? "unknown").toLowerCase()}:${fingerprint.slice("sha256:".length, "sha256:".length + 24)}`,
    fingerprint,
  });
}

export function encodeGoldenScenarioReceiptDiagnostic(receipt) {
  return `${GOLDEN_SCENARIO_DIAGNOSTIC_PREFIX}${Buffer.from(JSON.stringify(receipt), "utf8").toString("base64url")}`;
}

export function parseGoldenScenarioReceiptDiagnostics(tapText = "") {
  const receipts = [];
  const parseErrors = [];
  for (const rawLine of String(tapText).split(/\r?\n/)) {
    const marker = rawLine.indexOf(GOLDEN_SCENARIO_DIAGNOSTIC_PREFIX);
    if (marker < 0) continue;
    const encoded = rawLine
      .slice(marker + GOLDEN_SCENARIO_DIAGNOSTIC_PREFIX.length)
      .trim()
      .split(/\s/)[0];
    try {
      receipts.push(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    } catch (error) {
      parseErrors.push({
        code: "GOLDEN_RECEIPT_DIAGNOSTIC_INVALID",
        error: String(error?.message ?? error),
      });
    }
  }
  return { receipts, parseErrors };
}
