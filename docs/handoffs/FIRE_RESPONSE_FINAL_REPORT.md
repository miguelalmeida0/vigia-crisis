# Fire Activity and Response & Access

Implemented in the existing canonical operator console on 8 September 2026. Fire Activity replaces the former Intelligence page; Response & Access replaces the former Operations page. Navigation, contextual links and public URL hashes use the new names. Old links resolve to the replacements while preserving the incident selection. Internal API route identities remain compatible with the existing backend.

## What changed

Fire Activity combines dated station observations, compact condition signals, a live incident map, a typed source-labelled changes feed and measurement history. Thermal and active weather-notice modules render only when supported by the returned data. The history includes both date and UTC time, including across midnight.

Response & Access combines incident and station context with mapped facilities, category tabs, facility inspection and qualified OSRM road-network estimates. A short context panel explains the measurements and geography. The pages reuse canonical adapters, authentication, refresh and route-specific MapLibre scenes. Zoom, layer controls, keyboard inspection, browser history and mobile navigation remain available.

The layout follows the supplied references: near-white canvas, navy typography, restrained red selection, tinted compact signals, blue section icons and a dominant map beside a supporting rail. At narrower widths the map leads a single-column layout; signal cards and tables reflow. Other route presenters remain intact.

The former presenter files are compatibility re-exports, not retained old pages. Removing those tracked paths broke the existing release-manifest builder; retaining the two-line shims preserves that build contract.

## Data limits

- Station observations describe the named station, with measurement time and distance. Wind direction is where wind comes from, not a prediction of fire spread.
- A successful thermal query returning zero is shown as zero with its time window and radius. A failed or missing query does not become a zero count.
- Mapped facilities come from the existing response projection. Mapping and proximity do not establish staffing, opening, capacity or emergency availability. The compact route payload returns a limited cohort, not an exhaustive local inventory.
- OSRM times describe the returned facility-to-incident road-network estimate at its checked time. They do not establish live road closures, traffic, emergency access, safe evacuation or actual arrival time.
- No reference-image perimeter, spread speed, affected hectares, threatened population, shelter capacity or safe-route recommendation was fabricated. Unsupported modules are omitted rather than rendered as dead cards.
- A cold response projection initially timed out during development; the UI omitted those modules. The final validation result and warmup attempts are recorded in the canonical browser report.

## Validation and visual evidence

The root test suite completed with **1,334 passed, 8 skipped and 0 failed** (1,342 total). The focused UI suite completed with **34 passed and 0 failed**. The canonical build and full operator-console static verification passed after the final application changes.

The final canonical browser pass captured **21 native viewports across seven routes**: both replacements at 1672, 1440, 1280, 1024, 768, 430, 390 and 320 pixels, plus the five retained routes at 1672 × 941. It also captured both complete pages, facility inspection and 200%/400% equivalent CSS-viewport reflow. This checks reflow, not every browser's native zoom implementation.

All **15 interaction assertions** passed: zoom, map-label selection and Escape, measurement and facility keyboard inspection with focus return, facility categories, mobile navigation and reflow. Legacy-link normalization and back/forward history also passed. There was no horizontal page overflow or duplicate element ID at any captured viewport. Both replacement maps loaded successfully and retained distinct scene identities and initial zoom levels (Fire Activity 11; Response & Access 10).

The canonical run recorded one HTTP 503 for `/backend/api/v1/basemap/labels/6/32/24` on the retained National Awareness route, with the corresponding browser resource error. It is therefore not an error-free whole-app run. There were also ten software-WebGL/performance warnings in headless Chromium. The response-capability warmup succeeded on its first attempt.

The separate final frozen-canonical lane completed with **zero browser errors, zero failed requests and all maps ready**. All seven pairs of repeat screenshots were byte-identical. This lane fixes the clock and recorded operator responses, directly selects the recorded incident and rejects unrecorded operator requests; basemap tiles remain live. The previously failing National Awareness label tile loaded in this later run. An earlier fixture-harness pass made unrecorded startup requests; selecting the recorded incident directly resolved that harness issue before final evidence capture.

Browser: Chromium 139.0.7258.5, device scale 1, en-GB, UTC, reduced motion, with font readiness awaited. The capture scripts and JSON reports are retained alongside the screenshots for reproducibility.

- [Final screenshot gallery](/Users/malmeida/.codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/fire-response/screenshots.html)
- [Canonical browser report](/Users/malmeida/.codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/fire-response/qa.json)
- [Frozen-canonical capture and stability report](/Users/malmeida/.codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/fire-response/golden/capture.json)
- [Native comparison diagnostics](/Users/malmeida/.codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/fire-response/comparisons/index.json)

The reference comparisons are deliberately unmasked, native-size diagnostics. Exact pixel parity is not certified: the real geography, available measurements, facility names and content differ from the illustrative references. Four retained-route comparisons use the previous canonical screenshots as regression baselines, explicitly labelled as such; they are not presented as newly supplied approved designs.

Each of the six compared routes has fresh reference, runtime, 50% overlay, absolute difference, geometry and computed-style artifacts. Fire Activity's map panel is approximately 3px right and 10px below the manual reference boundary, with width within 4px and height within 6px. Response & Access starts approximately 22px lower because its real facility names require taller signal cards. Its rail is longer to retain readable facility names, dated estimates and road-access qualifications. These are recorded adaptations, not a declaration of exact reference fidelity.

The one bounded Impeccable detector pass returned no findings. Independent visual review identified the missing timeline dates, durable design record and final comparison evidence. The reviewer marked all three **resolved**, inspected matching runtime hashes and issued **disposition: ship**, with no material regressions from the fix batch observed. That disposition covers the three scored fixes; it is not whole-product certification or exact reference pixel parity. No broad additional polish cycle or unsupported risk graphics were introduced.

Final `local:status` reported Database, FieldNet, Operator and incident truth **READY**, with **257 canonical incidents**.

## Commands

Run from `/Users/malmeida/Documents/ChatGPT/VIGIA Integration`:

```bash
npm run local:up
npm run build
npm test
npm run operator:verify:static
node --test apps/operator-console/tests/fire-response.mjs apps/operator-console/tests/approved-integration.mjs apps/operator-console/tests/signal-composition.mjs
npm run local:status
```

The full verification script belongs to the operator-console package; its root alias is `operator:verify:static`. A root invocation of `verify:static` has no script and was corrected to the alias above.

Canonical browser capture:

```bash
docker run --rm --init --add-host host.docker.internal:host-gateway \
  -v '/Users/malmeida/Documents/ChatGPT/VIGIA Integration:/workspace:ro' \
  -v '/Users/malmeida/.codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259:/output:rw' \
  --entrypoint python vigia-visual-qa:playwright-1.54.0 \
  /output/fire-response/capture.py
```

Run the same Docker command with `/output/fire-response/capture-golden.py` for the read-only frozen-canonical comparison lane. It intercepts requests only inside the test browser; the production console has no new demo or fixture fallback.

Generate native comparison artifacts:

```bash
'/Users/malmeida/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3' \
  '/Users/malmeida/.codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/fire-response/compare.py'
```

Logs are under `.tmp/fire-response/`. Local startup logs may contain a one-time admission link and are intentionally not included in the visual gallery. This is the canonical local rehearsal runtime; no cloud deployment or release sealing is claimed.

## Changed files

The exact task-scoped list with SHA-256 values is in [fire-response-changed-files.json](fire-response-changed-files.json). It is based on a pre-task content snapshot, so unrelated pre-existing working-tree changes are not attributed to this work. Generated build and local release metadata are not UI source changes. Product and design decisions are recorded in [FIRE_RESPONSE_DESIGN.md](FIRE_RESPONSE_DESIGN.md), [PRODUCT.md](../../PRODUCT.md) and [DESIGN.md](../../DESIGN.md).
