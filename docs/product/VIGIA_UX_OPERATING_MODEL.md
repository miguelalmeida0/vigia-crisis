# VIGIA UX Operating Model

## Purpose

VIGIA is one persistent wildfire operating picture. Each route answers one operational question while incident identity, map selection, data freshness, and work state remain continuous.

| Route | Primary question | Primary interaction |
| --- | --- | --- |
| Command Overview | What needs attention now? | Inspect a priority incident without leaving the map. |
| Incidents | Which event should I inspect next? | Search, filter, select, and inspect an incident. |
| Incident Detail | What is true, what changed, what is at risk, and what happens next? | Switch incident in place and review its current decision frame. |
| Intelligence | What may happen next and what could change the decision? | Read Now → Next → Watch → Uncertainty → Decision and spatially inspect admitted artifacts. |
| Operations | What is being handled, blocked, or needs a person? | Work a prioritized queue through a selected-action inspector. |
| Reports & Analytics | Are decisions, systems, and outcomes improving? | Change the report lens without leaving the route. |
| Global Awareness | Where are material conditions changing? | Filter the authorized incident universe and fit the map to the result. |

## Interaction rules

- A first incident selection opens contextual Quicklook; navigation is a second deliberate action.
- Incident Detail, Intelligence, and Operations share one searchable incident switcher. The selected incident is written after the hash, retained across incident-scoped routes, and loaded with latest-request-wins protection.
- Map instances persist across route renders. Selection, filter, and artifact focus update sources and camera state without remounting or reloading the style.
- Every control must produce visible proof: changed content, changed selection, changed map focus, or a disabled explanation. A toast is supplementary only.
- Technical IDs, hashes, provider codes, and admission internals live in collapsed technical disclosures.

## State semantics

VIGIA never uses a single generic state to imply unrelated facts.

- Platform: Operational, Degraded, Offline, Connecting.
- Data freshness: Live, Fresh, Aging, Stale, Historical, No recent data.
- Verification: Confirmed, Corroborating, Unverified, Conflicting, Closed.
- Scientific admission: Admitted, Withheld, Not eligible, Re-evaluating.
- Work: Running, Waiting on external source, Needs human decision, Scheduled, Completed, Failed.
- Map transport: Live, Retained while refreshing, Partial, Unavailable.

An operational provider can serve a stale artifact; both conditions are shown separately. All operational timestamps are presented in UTC with a relative age where useful.

## Truth and measurement boundaries

- Thermal observations never become perimeter geometry.
- Forecast geometry is shown only after scientific admission. Withheld geometry leaves thermal history, weather, terrain, watch conditions, and decisions usable.
- Outcome funnel stages count distinct persisted record identities only. Resolution requirements are work inventory, not initiated actions or observed outcomes.
- Missing measurements are named as instrumentation gaps, not rendered as healthy zeroes.
- Global filters operate only on returned authorized data and never synthesize a match.

## Accessibility and responsive behavior

Primary controls provide a 44 by 44 pixel target. Status chips use a single inline-flex geometry and cannot wrap their dot away from the label. Map incidents have an equivalent keyboard-reachable list. Inspectors and Quicklook become expandable bottom sheets on narrow screens, preserve visible map area, expose visible focus, and honor reduced motion.
