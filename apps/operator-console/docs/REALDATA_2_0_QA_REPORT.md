# VIGIA Mission Dark — Canonical Data Patch 2.0

## Why this patch exists

The previous standalone Mission Dark build regressed VIGIA into a fixture-backed visual prototype. It bundled synthetic operational imagery, fixture incidents, fixture fleet records, and route state that did not follow the selected canonical event. That is not acceptable for VIGIA.

Patch 2.0 changes the contract: **Mission Dark is presentation only. Canonical VIGIA on `127.0.0.1:4177` is the sole operational source of truth.**

## Fixed

- Detect uses `/api/v10/events` and `/api/v10/events/:id?projection=operator`.
- Selecting a different event changes the selected event model, map bounds, evidence detail, and Respond incident projection.
- Event queues are intersected with the monitored Portugal territory and point-in-polygon tested against the canonical territory geometry.
- Detect/Overview/Respond use the real basemap proxy and configured thermal-overlay endpoint.
- PREVENT uses governed observation resolution and observation preview/proxy URLs. No generated comparison image is substituted.
- Replay uses the canonical replay corpus/cases and preserves its archival/synthetic qualification.
- Respond uses the selected event's canonical operations projection. No fixture Alpha/Mayday state is invented.
- Resources fails closed when a governed CAD/AVL/apparatus feed is absent. Monitored OSM assets are labelled as context, not apparatus or connected telemetry.
- Accountability exposes only canonical SHADOW roster identities when available. It does not invent firefighters or live locations.
- Dispatch/EOC uses canonical alerts/evidence needs/context and explicitly reports missing integrations instead of inventing ETA/resource state.
- FieldNet reports only the canonical software ledger/reconciliation status. Physical independent mesh capability remains **NOT PROVEN**.
- System Proof reads runtime/operations/benchmark/source state from canonical VIGIA.
- The package contains **zero bundled operational map/evidence/fleet raster substitutes**.
- If canonical `4177` is unavailable, the frontend shows a backend-unavailable state; it never falls back to demo fires.

## Verification gates

`npm run verify` runs:

1. JavaScript syntax verification.
2. 14-route smoke verification.
3. Interaction contract — every rendered enabled button has an action.
4. Persistent presentation-state serialization.
5. Real-data contract, including Portugal filtering and event-selection propagation.
6. Proxy contract for JSON and binary canonical responses.
7. Browser real-data workflow using a deterministic fake upstream **only inside the test harness**.

The build container has a managed Chromium policy with `URLBlocklist: ["*"]`, so the browser test is intentionally skipped there with an explicit diagnostic. On the target Mac, `npm run test:browser` must execute the complete browser flow.

## Truth boundaries

- Mission Dark does not create current wildfire detections.
- Mission Dark does not create satellite observations or image products.
- Mission Dark does not create apparatus, crew, water, CAD/AVL, containment, ETA, or public-warning state.
- Missing canonical information is rendered as missing/degraded/unconfigured.
- Test fixtures exist only under `tests/`; they are not runtime fallback data.
