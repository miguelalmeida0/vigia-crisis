# Release Gates

A "major release" must pass these gates.

# Gate A — Mission

- Territory Command is no longer a report-first page.
- Pre-ignition findings are first-class.
- Physical fire candidates are first-class.
- Fire events are physical phenomena, not only reports.
- Action resolves uncertainty.

# Gate B — Fuel Continuity

- real Sentinel-2 native pixels
- comparison scene
- cloud/SCL handling
- geospatial binding
- candidate polygon
- area/span
- asset proximity
- provenance
- persisted detector version
- screening label
- no fake confidence

# Gate C — Ignition

- real thermal observation path
- physical candidate
- stable event ID
- report association
- raw provenance
- restart persistence
- duplicate rejection

If live key missing:
historical real evidence must prove domain path and blocker must be explicit.

# Gate D — Living Fire

- temporal frame model
- real observation arrival
- current vs historical support clear
- FRP synchronized
- freshness correct
- no fake perimeter

# Gate E — Action

- compact sign-in
- authenticated actor
- EvidenceNeed
- observation opportunity
- EvidenceRequest
- owner/SLA
- durable persistence
- explicit terminal states

# Gate F — UX

- no giant map labels
- fewer redundant cards
- no backend jargon in primary UX
- incident understandable in 10s
- map changes information density based on evidence
- desktop QA
- tablet QA
- mobile critical flows

# Gate G — Integrity

- zero synthetic operational observations
- replay future leakage zero
- geospatial fail-closed tests
- no null→zero measurement rendering
- API 404 behavior
- provenance complete

# Gate H — Validation

- detector evaluation artifact
- held-out association artifact
- abstention visible
- unmeasured fields explicit
- run/version hashes

# Gate I — Engineering

- full tests pass
- architecture pass
- PostGIS integration pass
- provider failure pass
- restart pass
- browser E2E pass
- console clean
- working tree clean

# Final visual gate

Compare pre-sprint and post-sprint screenshots.

If an outsider says:

> "It is still basically the same fire-report dashboard."

FAIL THE RELEASE.
