# VIGIA Pilot Safety Case

## Decision sought

This safety case supports only five internal, supervised rehearsals of VIGIA as read-only or shadow decision support. It does not authorize operational deployment. Final approval depends on a code-bound release manifest, a passing running-browser certification, a fresh security scan with no high or pilot/runtime medium finding, and completion of every verification command in the release record.

## Intended use

VIGIA may help a trained operator inspect attributable wildfire evidence, distinguish physical observations from public reports, identify explicit unknowns, review prevention screening, and prepare an integrity-bound handoff. A human operator remains responsible for interpretation and every external action.

The rehearsal universe is bounded to the canonical Portugal dataset and locally controlled SHADOW records. Manual imports remain labelled `MANUAL IMPORT` and `MANUAL_SHADOW_NOT_LIVE_SYNCED`. FieldNet is a software persistence, reconciliation, and conflict-preservation proof; it is not evidence of radio coverage, mesh hardware, current field-node reachability, or delivery without acknowledgement. Upstream WebSocket sensor ingest is unavailable in the pilot runtime unless a separately supplied transport proves a 256 KiB or smaller pre-buffer payload limit; the built-in runtime does not claim that capability.

## Safety claims and evidence

| Claim | Control | Required evidence |
|---|---|---|
| Untrusted text cannot gain operator-origin execution | Central HTML escaping, strict CSP, no inline script execution | Hostile renderer suite and live CSP/XSS browser proof |
| Life-safety mutations are default-deny | Complete route-policy inventory, exact capability, incident scope, operator intent, authenticated session | Route inventory plus viewer, wrong-capability, wrong-scope, and valid-control tests |
| FieldNet callers and nodes are attributable | HMAC-SHA256 request envelopes, clock bounds, nonce replay protection, registered key, node ID, capability, incident scope, monotonic sequence | Adversarial FieldNet boundary suite and legitimate signed control |
| FieldNode capacity cannot be consumed as emergency authority | Post-authentication principal gates, caller-priority demotion, reserved mutation/storage capacity, hash-chained acknowledged-history compaction | Rate-boundary, priority, compaction, WAL headroom, and atomic rollback tests |
| Sensor setup fails closed before unbounded allocation | Bounded-transport capability requirement, DNS/setup deadline, one pending setup, exact WSS host policy | Unbounded-transport rejection, hanging-resolver, private-address, duplicate-socket, and oversized-message tests |
| Public imagery cannot become an internal-network fetch primitive | HTTPS/443, exact host allowlist, all-address DNS validation, per-hop redirect validation, MIME/size/concurrency/rate bounds | SSRF, redirect, private-address, MIME, streamed-size, and governed-host tests |
| Current and stale truth are never equivalent | Per-dependency `READY`/`STALE`/`FAILED`, last-good timestamps, fail-closed toasts and map state | Failure-contract tests and controlled live-browser injections |
| Physical evidence is not inferred from reports | Explicit evidence-kind classifier and shared selectors | Truth-boundary tests across Overview, Detect, Evidence, and Handoff |
| Prevention screening does not become treatment authority | Measurement-required withholding and explicit screening-only language | Truth test and live PREVENT browser proof |
| Handoff does not overwhelm or invent work | Shared unresolved selector and maximum twenty primary follow-up rows | Static selector tests and live handoff count |
| A certified run describes one exact product | Release ID and code-state hash agree across manifest, API, FieldNode, browser, DB contract, and migration head | Release handshake, route certification, DB doctor, browser certification |

## Human oversight

- A named facilitator controls the rehearsal and may stop it at any time.
- Operators must verify evidence provenance, timestamp, freshness, source family, contradictions, and missing evidence before using a VIGIA view in discussion.
- No VIGIA state is a substitute for incident command, dispatch, emergency communications, evacuation authority, personnel accountability, or qualified prevention engineering.
- Any `STALE`, `FAILED`, `UNAVAILABLE`, `MEASUREMENT REQUIRED`, `NOT CONFIGURED`, or identity contradiction is a stop condition for the affected task.
- No real external message, dispatch, alert transition, evidence acquisition, or incident-command mutation is part of these five rehearsals.

## Data, retention, provenance, and audit

Use isolated temporary rehearsal data. Preserve existing operational data. Every confirmed manual import must retain its sanitized filename, source-content hash, effective-envelope receipt hash, accepted and rejected counts, adapter, universe, source system, canonical bindings, mode, release identity, and receipt timestamp. Browser screenshots and certification JSON are generated release evidence, not source. Runtime databases, cookies, profiles, tokens, PIDs, and logs are never commit candidates.

## Residual and external limits

This safety case does not claim customer validation, physical sensor qualification, real radio/mesh operation, external CAD/AVL integration, real apparatus or personnel state, emergency-service adoption, or production availability. Rehearsal outcomes must be entered by the facilitator; none are prefilled or inferred.

## Approval record

Release verdict: **PENDING FINAL CERTIFICATION**  
Permitted population: internal trained participants only  
Permitted count: five supervised rehearsals  
Production authorization: **NOT GRANTED**
