# Prohibited Use

VIGIA is not authorized to:

- issue, recommend, or independently execute dispatch, evacuation, Mayday, PAR, personnel-safety, containment, suppression, treatment, or resource-allocation decisions;
- act as incident command, dispatch/EOC, an emergency communications channel, an accountability roster, or an authoritative apparatus/crew availability system;
- present public reports as physical confirmation, repeated observations from one family as independent corroboration, screening estimates as validated measurements, or cached data as current;
- claim live CAD, AVL, apparatus, personnel, radio, LoRa, Meshtastic, mesh, sensor hardware, or field-node availability without a separately governed and proven integration;
- connect FieldNode to caller-selected network destinations or use FieldNet acknowledgement as proof of physical delivery;
- claim upstream WebSocket sensor availability unless the configured transport enforces a pre-buffer payload ceiling of 256 KiB or less; the pilot runtime intentionally reports `BOUNDED_TRANSPORT_NOT_CONFIGURED` otherwise;
- import records as live or synchronized; all allowed rehearsal imports are manual SHADOW imports with provenance-bound receipts;
- continue an affected workflow after an identity contradiction, authorization failure, missing release identity, stale/failed critical dependency, missing qualified evidence, or measurement-required state;
- run an unsupervised rehearsal, a public demonstration that implies operational readiness, or any production emergency operation under this safety case.

These prohibitions override convenience, schedule, and operator expectation. The facilitator must stop the affected task, preserve evidence, and record the condition without inventing a workaround or result.
