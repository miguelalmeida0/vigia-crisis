# Mega IX — mission command and field network

## Design read

VIGIA is a crisis decision-support product for operators and responders under pressure. The primary task is to see which watched objective changed, understand the named consequence, and contact the team. The map remains the dominant geographic work surface. Existing six-route navigation, typography, colors and controls remain authoritative.

Operate mode. Design variance 2/10, motion 1/10, density 7/10. Operational risk is high. This is an expansion inside the established visual world, explicitly authorized by the Mega IX brief; it does not replace the product identity.

Command uses its map-adjacent area for Important now, a maximum of five Watching rows, and three Recent entries. Incident Detail and Response & Access expose the same incident-scoped command area. A selected mission replaces those rows with objective, end time, state, route, alternative, cause and next action. Reports, confirmation and team conversation use progressive navigation in that same area. Existing Operational Picture, replay and support remain accessible. No generic metrics are added above the map.

Desktop uses connected rows and hairlines. Below 1200px the rail stacks below the map. Mobile uses one column, wrapped actions, 44px controls and no horizontal data tables. Native form labels, visible focus and persistent drafts are required. Missing route, missing address, delayed receipt and failed sync remain explicit without false success.

## Implementation boundaries

- Reuse the retained Situation service and its qualified facility/route data. Facility-to-community estimates must not be described as community-to-hospital trips.
- Private watched objectives are distinct from the legacy public Mission summary. Mission command is authenticated and incident scoped.
- Field reports remain human observations, including after two-person confirmation; they do not enter official restriction history.
- Durable encrypted envelopes, membership, device signatures, exact recipient acknowledgements and replay protection own team messaging.
- Existing FieldNet remains the owner of governed observation admission and incident packages. The new team collaboration stream does not silently promote its reports into that admission system.
- Controlled field tests use a separate persisted lane and conspicuous label. They cannot modify operational situations or official history.
- Native radio adapters expose capability boundaries; no browser Bluetooth/Nearby/LoRa claim without hardware proof.

## Acceptance ledger

Functional: mission lifecycle, expiry, geometry intersection, alternatives, report/receipt clocks, distinct confirmations, conflicting replies, durable queues, reload, retry/dedup, relay TTL, exact recipient receipts, revocation and private membership.

Rendered: all six canonical routes; 1672×941 through 320×568; desktop/mobile mission and chat; 14 requested capture states; keyboard, focus, overflow and console errors. Reference overlays apply to preserved composition; new authorized composition is compared to this contract, not falsely certified against obsolete anatomy.

Current execution constraint: browser access to the local console was rejected by a saved user permission. No alternate browser or indirect capture will be attempted. Rendered acceptance and screenshots remain NOT RUN until that setting permits access. Git branch creation was also rejected by read-only Git metadata. Neither restriction prevents source implementation and non-browser verification.
