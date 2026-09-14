# Validation and Metrics

# Principle

Never use a clean screenshot as evidence that a hazard detector works.

Never convert architecture readiness into operational performance.

---

# 1. Pre-Ignition Detector

## Minimum evaluation

For Fuel Continuity:

- candidate precision after expert/human adjudication
- false candidate taxonomy
- abstention rate
- source-quality strata
- land-cover strata
- detector version
- geographic holdout where possible

If recall cannot be established due missing exhaustive truth:
say so.

Do not invent recall.

## Error taxonomy

False candidates may include:

- seasonal vegetation change
- crop/agriculture
- forestry operations
- cloud/shadow artifact
- registration error
- recent clearing
- road-edge vegetation
- mapping asset error

Track them.

---

# 2. Physical ignition

Metrics:

- physical-first cases
- observation→report interval
- candidate→report association
- false physical candidates
- current physical coverage
- stale event count

Do not call observation→report "detection lead" unless provider availability/latency semantics justify that phrase.

---

# 3. Event identity

Primary held-out metrics:

- observation association
- report join
- canonical fragmentation
- canonical false merge
- abstention
- unjustified ID changes

Regression set:
clearly labelled.

---

# 4. Selective prediction

Abstention is allowed.

Where labels support it, report:

- accuracy among accepted
- coverage
- abstention
- error among accepted

Do not drive association rate upward by forcing bad joins.

---

# 5. Physical state

Measure:

- percentage active events with fresh physical observation
- median age of physical evidence
- time to verified physical state
- number of source families
- state expiration correctness

---

# 6. Action

Measure:

- EvidenceNeeds created
- unowned needs
- time to owner
- acknowledgement SLA
- time to new evidence
- resolved unknowns
- no-path rate

---

# 7. Product proof

The product should eventually support defensible evidence lines such as:

> On N held-out Portuguese incidents, event association achieved X% accepted accuracy at Y% coverage with Z% abstention.

and, only if supported:

> N physical satellite observations preceded public report timestamps by a median of X minutes.

Never use the 433-minute case as ignition lead unless ignition and provider availability support it.

---

# 8. No benchmark gaming

- do not repeatedly tune held-out cases
- preserve evaluation manifests
- version thresholds
- store run IDs
- store code commit
- store data hashes
