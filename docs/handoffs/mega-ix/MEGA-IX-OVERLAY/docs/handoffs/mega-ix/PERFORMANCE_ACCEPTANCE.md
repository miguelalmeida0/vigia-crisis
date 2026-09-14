# MEGA IX acceptance follow-up — 14 September 2026

MEGA IX remains incomplete. This pass preserved the implementation and addressed measured Command Overview CPU work. Browser acceptance, the multi-person UI journey, the 30-second comprehension study, screenshots and committing remain blocked.

## Measured changes

- Prepare station history once per physical-world projection instead of parsing and filtering all samples for every incident. Bind location and subject separately for each incident; preserve station ranking, duplicates, conflicts, zero values, freshness and provenance.
- Build the dependency node lookup once per impact projection.
- Compute the existing portfolio sections without constructing, cloning and hashing incident-detail sections which the portfolio discards. The full incident-detail path still produces immutable temporal sections and hashes.
- Read only operational-period and recovery collections through the repository's existing isolated snapshot API.
- Parse each timestamp once instead of twice.

No new dataset, interface pattern, loader, cache lifetime, authorization scope, or observation-freshness policy was introduced.

## Evidence and method

The existing report recorded about 9.5 seconds for the first Command Overview projection. A fresh CPU-instrumented reproduction took 10,982 ms over HTTP. After weather preparation and dependency indexing it took 6,810 ms; after avoiding discarded incident-detail projections it took 4,949 ms. Instrumented timings include profiling and evidence-writing overhead, so these are diagnostics, not browser timings.

For uncached measurements, a temporary Node import hook constructed a new CanonicalOperatorApiService with empty route/twin caches for each signed request to the actual backend. The services, database, actor, 96 returned overview rows and 326 retained incident records remained real. No network provider was substituted. Each response had a new generation time; cached hits did not count. This is a cold projection benchmark with initialized services, not 20 fresh process launches.

Twenty requests after the summary optimization: first 2,205 ms, median 1,929 ms, p95 3,008 ms, maximum 4,662 ms. The final twenty-request run after narrowing the recovery snapshot: first 3,072 ms, median 2,385.5 ms, p95 3,904 ms, maximum 3,919 ms. The snapshot change does not establish a measured latency improvement under this run's variance. **The requested <2.5-second p95 gate is not met.** No profiler or cold-cache hook remains in the normal runtime launcher.

Full output comparisons passed for 200 incident locations using 3,178 retained station samples and 200 adversarial weather histories. The retained-data weather comparison took 1,320 ms before and 57 ms after, excluding one-time preparation. Complete portfolio output also matched full-detail aggregation across all 326 retained incidents (548 ms before, 58 ms after in the isolated comparison). These domain comparisons are not operational mission or browser acceptance.

`performance-evidence.json` records timings and boundaries. `acceptance-regression-tests.txt` contains the fresh 153-test run. `acceptance-static-verification.txt` records production/static verification separately. Historical 117-test evidence is preserved; the counts are not added together because suites overlap.

The restored normal runtime, without either profiling hook, returned its first overview request in **4,305 ms**. Its following 19 responses were cached (15–277 ms); those cached times do not satisfy the startup gate. The production build and complete static verification passed.

## Access failures and unfinished acceptance

The browser tool again rejected `http://127.0.0.1:4191` under a saved user permission. Its rejection explicitly prohibits alternate browsers, raw CDP, indirect capture or another workaround. No such workaround was attempted. Photo/audio/map selection, real multi-person receipt behavior, offline/reconnect interaction and responsive visual checks remain unoperated in a browser.

Git branch creation again failed when creating `/Users/malmeida/Documents/Development/vigia/.git/refs/heads/vigia/mega-ix-mission-command-field-network.lock`: `Operation not permitted`. The repository is already owned by `malmeida:staff`; this is the session's read-only Git metadata restriction, not an ownership mismatch. No chmod/chown, reset, stash, alternate Git directory, commit or push was used to evade it.

The requested branch remains `vigia/mega-ix-mission-command-field-network`; the current branch remains `vigia/operational-intelligence-v1`. There is no acceptance commit SHA.

All 15 required captures are listed in `CAPTURE_LEDGER.json` as NOT_RUN. The six canonical route comparison sets are also NOT_RUN. Required viewport widths: 1672, 1440, 1280, 1024, 430, 390 and 320. No fresh-user comprehension result exists, and no screenshot or visual ship verdict is claimed.
