# Adversarial QA

# EO / Prevention

- catalogue bbox correct, raster georef wrong
- one band wrong CRS
- SCL mismatched grid
- crop AOI partial
- cloud contamination
- seasonal agriculture false change
- scene date invalid
- same scene used as current and prior
- missing native pixels
- browse JPEG accidentally passed to model
- detector returns no candidates
- detector returns giant invalid polygon

Expected:
abstain/fail closed.

---

# Thermal / Event

- duplicate VIIRS observation
- out-of-order observation
- two fires nearby
- large source footprint intersects two events
- report arrives before physical
- report arrives after physical
- stale observation
- industrial-like thermal observation
- multiple correlated source records
- source confidence low
- provider unavailable

Expected:
stable identity or explicit ambiguity.

---

# Work

- EvidenceNeed with no opportunities
- future remote opportunity only
- no field resources
- owner becomes unavailable
- SLA overdue
- API restart
- duplicate request creation
- acknowledgement race

Expected:
durable explicit state.

---

# UI

- no current physical fires
- only pre-ignition findings
- only report-only incidents
- 100+ queue items
- long Portuguese locality names
- empty weather
- missing response resources
- slow provider
- map zoom/pan while data updates
- tablet
- mobile
- reduced motion
- keyboard timeline

---

# Security / integrity

- forged operator role in client
- raw-source URL unauthorized
- secret accidentally logged
- unknown `/api/*`
- malformed provider response
- replay synthetic provenance
- manual correction persistence

---

# Release drill

1. Start clean database.
2. Run migrations.
3. Start application with one source missing.
4. Verify degraded mode.
5. Ingest real source product.
6. Kill worker mid-ingest.
7. Restart.
8. Verify idempotency.
9. Create evidence request.
10. Kill API.
11. Restart.
12. Verify owner/SLA/action.
13. Run browser walkthrough.
