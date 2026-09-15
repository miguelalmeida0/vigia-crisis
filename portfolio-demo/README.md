# Controlled portfolio build

This directory is a separate public-demo boundary for source revision
`bc62f62662c8a62affa4e054d1d122d1e1f7f084`. It does not change the operational
release, authentication, providers, or production build verification.

## Design read

- Product: the real VIGIA console with synthetic inputs, not an emergency service.
- Visitor: a recruiter exploring the product without wildfire-domain training.
- Task: see what a road report changes for services, missions, and planning.
- Dominant object: the existing route-specific map/work surface.
- Hierarchy: affected service and next inspection; map and missions; provenance.
- Direction: preserve the approved light canvas, flat surfaces, restrained red,
  typography, and existing route components. Variance 1/10, motion 1/10,
  density 7/10. Operational subject matter; no operational authority.
- Orientation: one persistent synthetic-demo label and compact scenario/reset
  utilities using existing controls. No modal tutorial or new dashboard.
- Responsive strategy: retain the console's existing responsive shell; scenario
  utilities wrap in document order, with 44px touch targets. Verify all repository
  viewport gates before release.

## Scenario boundary

`scenario.mjs` runs the existing mission, consequence, causal, resource, and
operational-period engines. Its coordinates, facilities, resources, timings, and
observations are deliberately synthetic. The fixed clock is a scenario clock,
never a claim about current conditions. Scenario transitions select explicit
inputs; their conclusions are computed by the domain engines.

Each visitor gets an independent in-memory session. There are no storage,
network, database, ingestion, model, dispatch, or authentication calls here.
Reset constructs the original inputs again. Unknown actions are rejected before
state changes. Returned snapshots are detached from the session's private state.

The operational-period example is a separate planning question within the same
synthetic setting. A road blockage is NOT claimed to alter its schedule: XIII's
period perturbation implementation does not apply road availability. Only the
implemented resource-delay perturbation is exposed to period planning.

## Current status

Scenario foundation only. The console transport adapter, static build, deployed
media, visual acceptance, security artifact audit, and release are outstanding.
Do not publish this directory as a complete product or count it as browser proof.

## Browser compatibility and verification

The source imports Node's SHA-256 through `world-knowledge.mjs`. The dedicated
build adapter replaces only that exact hash boundary with `@noble/hashes`, pinned
in this directory. JSON/string hashes are checked against Node, and every pair
of supported actions is compared between the bundled and original engines.
Binary inputs are outside this public scenario contract. No global crypto shim
or changes to the operational source are required.

15 September 2026 checks:

- 154 existing domain tests plus 9 demo/bundle tests: 163 passed, none skipped.
- Browser-target engine bundle: 107,600 bytes, 42 modules, no external imports.
- Isolated JavaScript execution without Node globals, network or storage: passed.
- Actual rendered browser, responsive checks and deployed media: blocked/not run.
- Existing XIII build warning: duplicate `capability` key in
  `packages/domain/src/period/schedule-generation.mjs:139`. Preserved and reported;
  no operational algorithm was changed to silence it.

This bundle size is not whole-app transfer, LCP, CLS, INP, or a performance pass.

Run `npm ci --ignore-scripts` in this directory, then `npm test`.
Full combined check from repository root:

```sh
node --test --test-concurrency=1 packages/domain/test/consequences/*.test.mjs packages/domain/test/planning/*.test.mjs packages/domain/test/period/*.test.mjs portfolio-demo/*.test.mjs
```
