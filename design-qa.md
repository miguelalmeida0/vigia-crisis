# Design QA — Locked Frontend Transplant

Visual source of truth: `VIGIA_CODEX_FINALIZATION_HANDOFF_2026-08-27/01_LOCKED_TARGETS/*.png`

Locked target dimensions: **1672×941** for all six routes.

Current canonical release: `vigia-intelligence-fabric-e7f2efb88c2b9b1c`

## Objective comparison contract

The repository-owned harness is `scripts/release/locked_frontend_visual_qa.py`, exposed as `npm run operator:visual-qa`. For every route it writes:

- `reference.png`
- `runtime.png`
- `overlay-50.png`
- `difference.png`
- `metrics.json`

The metrics contain target/runtime dimensions, changed-pixel count and ratio, per-channel MAE, RMSE, changed bounding box, measured runtime landmark boxes, target landmark boxes, edge variance, client/scroll dimensions, horizontal overflow, map terminal state, semantic landmarks, tap-target measurements, console entries, and network failures.

The same harness covers 1672×941, 1440×900, 1280×800, 1024×768, 768×1024, 430×932, 390×844, and 320×568.

## Current measured browser evidence

The standard in-app Browser rendered and inspected all six routes during the pass. At its maximum available CSS viewport (1229×692), all six routes reported `ready`, zero horizontal overflow, and the real map terminal state `STALE_LAST_GOOD`. The canonical runtime status simultaneously reported `DEGRADED_PARTIAL · 3/32 layers`; the frontend retained governed last-good imagery and did not manufacture a healthy provider state.

Compact measurements after the responsive correction:

| Actual CSS viewport exposed by Browser | Routes measured | Horizontal overflow | Minimum visible interactive dimension |
|---:|---:|---:|---:|
| 564×753 | 6 | 0 px | 43.64–45.00 px |
| 316×685 | 6 | 0 px | 43.64–45.00 px |
| 286×620 | 6 | 0 px | 43.64–45.00 px |
| 235×417 | 6 | 0 px | 43.64–45.00 px |

The Browser window controller clamps requested viewport sizes; therefore these measurements are supplementary and are not substituted for the governed exact-size captures.

The final release was freshly admitted and rechecked across all six routes at the available 316×685 viewport. Every route reported `ready`, one `main`, one `h1`, zero duplicate IDs, zero missing image alternatives, zero unnamed visible controls, zero horizontal overflow, and a minimum visible target dimension of 44.37–45.00 px. The final console window after `2026-08-27T10:26:00Z` contained zero warnings and zero errors.

The following standard Browser interactions passed:

- five-route navigation and contextual Incident Detail;
- incident status and ordering filters;
- rapid A→B→C incident selection with C retained;
- mobile navigation drawer open by click and close by Escape;
- map zoom control;
- optional governed layer producing `DEGRADED_PARTIAL`;
- layer removal recovering to `STALE_LAST_GOOD`;
- no externally loaded Evidence preview images;
- zero horizontal overflow across all six routes at the compact widths above.

## Truth and architecture boundaries

- No React, TanStack, Tailwind, Nitro, Recharts, Lovable Vite configuration, Google Fonts, donor server, donor router, or donor query lifecycle was imported.
- `canonicalViewModel.js` remains a presentation adapter: it formats backend values and identifiers and returns unavailable values as unavailable.
- No target PNG or donor fixture is used as a runtime visual.
- Missing forecast, measurement, resource, evidence, and operational values retain explicit unavailable states rather than becoming zero.
- Canonical admission, release identity, request cancellation, API clients, backend services, map provider lifecycle, and full `local:*` lifecycle remain authoritative.

## Verification

- `npm run operator:verify:static`: passed — 58 modules; 6 routes; 57 buttons; zero dead controls; asset, proxy, admission, map, truth, intelligence, browser, and UX contracts passed.
- `npm run check`: passed — 1047 files inspected; 936 runtime/test modules valid and acyclic.
- `npm test`: passed — 954 tests; 946 passed; 8 skipped; 0 failed.
- Visual harness syntax and locked-PNG decoder: passed; every target decoded as 1672×941.

## Exact-size capture limitation

The exact governed artifacts are not claimed as complete in this sandbox. Repository Playwright reached a macOS Chromium launch denial:

`mach_port_rendezvous_mac.cc:158 ... bootstrap_check_in ... Permission denied (1100)`

The standard in-app Browser can capture the visible tab, but its viewport was capped below the 1672×941 golden size and cannot certify that exact viewport. Fresh one-time admission, navigation, DOM inspection, click, keyboard, responsive inspection, and screenshot capture all worked on the repository-owned origin.

Run the following once from a normal macOS Terminal while the canonical full stack is READY:

```sh
cd '/Users/malmeida/Documents/ChatGPT/VIGIA Integration' && npm run local:status && npm run operator:visual-qa
```

Final result: **blocked** — exact 1672×941 runtime, overlay, difference, and metrics artifacts require the one external harness run above. This is an environment capture limitation, not a certified product defect.
