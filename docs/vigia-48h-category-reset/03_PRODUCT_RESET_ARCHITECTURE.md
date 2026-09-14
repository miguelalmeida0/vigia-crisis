# Product Reset Architecture

## 1. Domain model

The existing product over-centers `FireEvent`.

The new product needs a superclass concept:

## TerritorySignal

A territory signal is something that deserves operator attention but is not necessarily a fire.

Kinds:

- `PRE_IGNITION_FINDING`
- `THERMAL_FIRE_CANDIDATE`
- `FIRE_EVENT`
- `REPORT_ONLY_INCIDENT`

Each kind has different evidence semantics.

Do not force them into one misleading schema.

---

# 2. Bounded domains

## Acquisition

Responsibilities:

- source scheduler
- provider authentication
- raw product download
- checkpoint
- retry
- source health

## Raw Evidence

Responsibilities:

- content-addressed archive
- checksum
- provenance
- licensing metadata
- immutable metadata

## Observation

Responsibilities:

- canonical physical observation
- geospatial support
- source-native quality
- timestamps
- source family / independence group

## Prevention

Responsibilities:

- EO scene selection
- comparable scene
- change features
- detector findings
- calibration/validation status

## Event Identity

Responsibilities:

- fire candidate
- canonical fire
- association hypotheses
- merge/split/reject
- ambiguity/abstention

## Physical State

Responsibilities:

- living thermal frame
- freshness
- FRP history
- observed support
- movement

## Work

Responsibilities:

- EvidenceNeed
- ObservationOpportunity
- EvidenceRequest
- owner/SLA
- acknowledgement
- closure

## Response Context

Responsibilities:

- official incident status
- personnel/resources
- burned area
- public response progression

Never classify this as physical sensing.

## Environmental Context

Responsibilities:

- temperature
- RH
- wind
- fire danger
- forecast context

## Operator API

BFF composition only.

No domain truth in rendering/controller code.

---

# 3. Data plane

Target:

PostgreSQL + PostGIS

Important entities:

- raw_source_products
- source_checkpoints
- physical_observations
- prevention_findings
- fire_events
- event_observations
- association_decisions
- response_snapshots
- environmental_snapshots
- evidence_needs
- observation_opportunities
- evidence_requests
- assignments
- resources
- audit_events

Use transactions for multi-entity state transitions.

---

# 4. Evidence graph

All consequential product objects should be traceable.

Examples:

PreIgnitionFinding
→ model run
→ current EO observation
→ comparison EO observation
→ raw source products

FireEvent
→ physical observations
→ raw thermal products
→ reports
→ response snapshots

Action
→ EvidenceNeed
→ event/finding
→ missing quantity
→ selected observation opportunity
→ evidence result

---

# 5. Product API principles

No endpoint should return a generic "confidence" without semantic type.

Separate:

- providerConfidence
- associationFit
- sourceQuality
- modelCalibrationState
- physicalFreshness

Avoid overloaded scores.

---

# 6. Production modes

## Shadow Live

Real current sources.

No synthetic operational data.

## Historical Replay

Real archived historical products under controlled clock.

## Test

Synthetic/adversarial fixtures allowed.

No demo runtime.

---

# 7. UI architecture

Primary lifecycle surfaces:

- Territory Command
- Prevent
- Detect
- Fire
- Action

Secondary:

- Replay
- Source Health
- Validation
- Provenance

The precise nav may combine Territory Command and Detect if the operator flow is stronger, but lifecycle semantics must remain clear.

---

# 8. Scalability

Do not microservice prematurely.

Modular monolith + specialized geospatial/acquisition workers.

Separate service deployment only when justified by:

- different resource profile
- failure isolation
- security boundary
- independent scaling
- provider scheduling

---

# 9. Observability

Correlate:

acquisitionRunId
→ rawProductId
→ observationId
→ finding/eventId
→ evidenceNeedId
→ requestId

High-value metrics:

- source success/failure
- acquisition lag
- normalization failures
- duplicate rejection
- detector output
- association/abstention
- physical freshness
- unowned EvidenceNeeds
- SLA breaches
