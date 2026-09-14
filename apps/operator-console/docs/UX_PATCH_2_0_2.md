# Mission Dark 2.0.2 UX patch

This patch changes presentation behavior only. Canonical VIGIA at 127.0.0.1:4177 remains authoritative.

## DETECT
- Selecting an event returns to the map-first view instead of preserving a previously-open dense detail state.
- Incident Detail is reduced from map + facts + duplicate insight panels to map + one decision inspector.
- NOW / NEXT / WHY are real controls and expose separate canonical decision context.
- Queue scroll survives event selection rerenders.

## Navigation
- Sidebar scroll position survives route changes.
- Navbar links use History API route changes instead of default fragment-anchor navigation, avoiding scroll-to-top jumps.
- Per-route/list scroll keys are preserved across rerenders.

## PREVENT
- Removes the duplicated right rail.
- Keeps the canonical screening queue and makes the selected real scene pair the primary surface.
- Before/after divider now moves via slider, click, or drag.
- Compare and Decision are real views, not cosmetic tabs.
- Decision view uses only persisted/canonical finding and observation data; no treatment authority or synthetic operational state is introduced.
