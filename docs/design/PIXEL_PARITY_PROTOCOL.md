# Pixel Parity Protocol

Use when a screenshot or mockup is locked.

## Capture contract

- Exact CSS viewport and device scale.
- Fixed fonts, clock, locale, timezone, and data fixture.
- Animations disabled or settled.
- Caret hidden.
- Browser/runtime version recorded.
- Application viewport only, without browser chrome.

## Artifacts

For each route:

1. reference
2. runtime
3. 50% overlay
4. difference
5. pixel metrics
6. geometry report
7. computed-style report
8. responsive evidence
9. canonical/live-data screenshot

## Priorities

1. Missing region or wrong hierarchy.
2. Wrong bounding boxes.
3. Wrong typography and token colors.
4. Wrong table/panel rhythm.
5. Wrong controls and icons.
6. Fine visual differences.

Do not chase subpixel decoration while a required surface is missing.

## Dynamic regions

Dynamic map/media pixels may be masked only in canonical mode. Container geometry, controls, legends, labels, topology, typography, and state treatment remain unmasked.

## Acceptance

Project-specific thresholds govern. A passing global percentage never overrides a missing required component.
