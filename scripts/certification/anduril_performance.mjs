export async function measureApiPerformance({ selectedIncidentId, basePaths, incidentPaths, request, usefulApiSample, percentile, variance, writeJson }) {
  const performancePaths = selectedIncidentId
    ? {
        command: basePaths.command,
        incidents: basePaths.incidents,
        detail: incidentPaths.detail,
        intelligence: incidentPaths.intelligence,
        operations: incidentPaths.operations,
        reports: basePaths.reports,
        global: basePaths.global,
        responseCapability: incidentPaths.responseCapability,
      }
    : basePaths;
  const performanceRunCount = 3;
  const performanceRoundsPerRoute = 20;
  const performanceRuns = [];
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const settleWarmRoute = async (name, route) => {
    const attempts = [];
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const result = await request(route);
      const refreshing = result.body?.delivery?.state === 'LAST_GOOD_REFRESHING';
      attempts.push({ name, route, status: result.status, durationMs: result.durationMs, bytes: result.bytes, refreshing });
      if (usefulApiSample(result) && !refreshing) return { ...attempts.at(-1), attempts: attempts.length, settled: true };
      await wait(250);
    }
    return { ...attempts.at(-1), attempts: attempts.length, settled: false };
  };
  for (let run = 1; run <= performanceRunCount; run += 1) {
    const warmups = [];
    for (const [name, route] of Object.entries(performancePaths)) {
      warmups.push(await settleWarmRoute(name, route));
    }
    const samples = [];
    for (let round = 0; round < performanceRoundsPerRoute; round += 1) {
      for (const [name, route] of Object.entries(performancePaths)) {
        const result = await request(route);
        samples.push({
          run,
          round: round + 1,
          name,
          route,
          status: result.status,
          durationMs: result.durationMs,
          bytes: result.bytes,
        });
      }
    }
    const routes = Object.fromEntries(
      Object.keys(performancePaths).map((name) => {
        const routeSamples = samples.filter((item) => item.name === name);
        const successful = routeSamples.filter(usefulApiSample).map((item) => item.durationMs);
        return [
          name,
          {
            expectedSamples: performanceRoundsPerRoute,
            attemptedSamples: routeSamples.length,
            successfulSamples: successful.length,
            p50Ms: percentile(successful, 0.5),
            p95Ms: percentile(successful, 0.95),
            maxMs: percentile(successful, 1),
            varianceMs2: variance(successful),
            rawSamplesMs: successful,
            failures: routeSamples.filter((item) => !usefulApiSample(item)),
          },
        ];
      }),
    );
    const useful = samples.filter(usefulApiSample).map((item) => item.durationMs);
    const warmupsPass = warmups.length === Object.keys(performancePaths).length && warmups.every((item) => usefulApiSample(item) && item.settled === true);
    const routesPass = Object.values(routes).every(
      (item) =>
        item.attemptedSamples === performanceRoundsPerRoute &&
        item.successfulSamples === performanceRoundsPerRoute &&
        item.p95Ms !== null &&
        item.p95Ms < 1_000,
    );
    performanceRuns.push({
      run,
      warmups,
      expectedSamples: performanceRoundsPerRoute * Object.keys(performancePaths).length,
      attemptedSamples: samples.length,
      successfulSamples: useful.length,
      p50Ms: percentile(useful, 0.5),
      p95Ms: percentile(useful, 0.95),
      maxMs: percentile(useful, 1),
      varianceMs2: variance(useful),
      routes,
      samples,
      state: warmupsPass && routesPass && useful.length === samples.length && percentile(useful, 0.95) < 300 ? "PASS" : "FAIL",
    });
  }
  const performanceSamples = performanceRuns.flatMap((item) => item.samples);
  const performanceByRoute = Object.fromEntries(
    Object.keys(performancePaths).map((name) => {
      const values = performanceSamples.filter((item) => item.name === name && usefulApiSample(item)).map((item) => item.durationMs);
      return [
        name,
        {
          expectedSamples: performanceRunCount * performanceRoundsPerRoute,
          samples: values.length,
          p50Ms: percentile(values, 0.5),
          p95Ms: percentile(values, 0.95),
          maxMs: percentile(values, 1),
          varianceMs2: variance(values),
          rawSamplesMs: values,
        },
      ];
    }),
  );
  const usefulValues = performanceSamples.filter(usefulApiSample).map((item) => item.durationMs);
  const missingRouteRuns = performanceRuns.flatMap((run) =>
    Object.entries(run.routes)
      .filter(([, route]) => route.attemptedSamples !== performanceRoundsPerRoute || route.successfulSamples !== performanceRoundsPerRoute)
      .map(([name, route]) => ({
        run: run.run,
        name,
        attemptedSamples: route.attemptedSamples,
        successfulSamples: route.successfulSamples,
        expectedSamples: performanceRoundsPerRoute,
      })),
  );
  const performanceProof = {
    schemaVersion: "vigia.anduril-crisis-os-performance.v2",
    generatedAt: new Date().toISOString(),
    measurement: "Authenticated canonical API request through complete decision-useful JSON response body after one warm request per route.",
    cacheState: "WARM_CANONICAL_PROJECTION",
    hardwarePath: "LOCAL_NODE_HTTP; browser GPU pointer-to-paint is certified separately by browser acceptance evidence.",
    requiredRuns: performanceRunCount,
    completedRuns: performanceRuns.length,
    roundsPerRoutePerRun: performanceRoundsPerRoute,
    expectedSamples: performanceRunCount * performanceRoundsPerRoute * Object.keys(performancePaths).length,
    samples: usefulValues.length,
    p50Ms: percentile(usefulValues, 0.5),
    p95Ms: percentile(usefulValues, 0.95),
    maxMs: percentile(usefulValues, 1),
    varianceMs2: variance(usefulValues),
    routes: performanceByRoute,
    runs: performanceRuns,
    missingRouteRuns,
    targets: {
      warmUsefulContentP95Ms: 300,
      criticalApiP95Ms: 1_000,
      quicklookP95Ms: 500,
      incidentSwitchP95Ms: 750,
    },
    state:
      performanceRuns.length === performanceRunCount &&
      performanceRuns.every((run) => run.state === "PASS") &&
      missingRouteRuns.length === 0 &&
      usefulValues.length === performanceRunCount * performanceRoundsPerRoute * Object.keys(performancePaths).length &&
      percentile(usefulValues, 0.95) < 300 &&
      Object.values(performanceByRoute).every((item) => item.samples === item.expectedSamples && item.p95Ms !== null && item.p95Ms < 1_000)
        ? "PASS"
        : "FAIL",
  };
  await writeJson("performance/api-useful-content.json", performanceProof);
  return {
    performancePaths,
    performanceRunCount,
    performanceRoundsPerRoute,
    performanceRuns,
    performanceSamples,
    performanceByRoute,
    usefulValues,
    missingRouteRuns,
    performanceProof,
  };
}
