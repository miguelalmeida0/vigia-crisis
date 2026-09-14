# Incident Quicklook Contract

## Intent

`IncidentQuicklook` is the shared, immediate incident-inspection surface for Command Overview, Incidents, and Global Awareness. It must reveal decision-useful context on the first marker or compact-list action without navigating or replacing the map.

## Required content

Quicklook is rendered from returned incident, detail, work, and scene projections. It includes:

- incident name and locality;
- lifecycle or verification state;
- last observation, freshness, and source coverage;
- latest material change;
- top known risk, or an explicit statement that none was returned;
- top unresolved uncertainty;
- current VIGIA resolution activity;
- human decision need;
- next decision or evaluation.

Raw IDs, source enums, hashes, and admission internals are available only in the collapsed technical disclosure.

## Interaction contract

1. `Inspect` selects the incident, visibly selects its marker/list row, and opens Quicklook in the current route.
2. The map instance, style, route, document, and camera context remain intact.
3. `Back to priorities` or `Back to results` restores the prior rail.
4. `Open full incident`, `Open Intelligence`, and `Open Operations` are explicit second actions.
5. The first shell is rendered from available inventory immediately; incident projections enrich it when they arrive.
6. The latest incident request wins. A late A or B response cannot overwrite a later C selection.

## Responsive and accessible behavior

Desktop Quicklook occupies the route's established right rail. On mobile it is a half-height bottom sheet with Expand and Collapse controls while the map remains usable above it. Marker features have equivalent list actions for keyboard users. All actions are native buttons, have visible focus, and remain usable at 200% zoom.

## Observability

The browser records shell and data latency, selected incident, map instance before and after, map-remount delta, document identity, and timestamp in `window.__VIGIA_EXECUTIVE_UX_RUNTIME__.quicklook`. Certification requires:

- cached/uncached shell under 100 ms;
- local data target under 500 ms;
- zero map remounts;
- zero document navigations;
- Quicklook visible after the first action.
