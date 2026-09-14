# VIGIA — 48-Hour Category Reset

## Mission

VIGIA must stop behaving like a sophisticated fire-report console and return to the original thesis:

> **Detect dangerous physical conditions before ignition, detect ignition from the physical world, maintain one evidence-grounded fire identity, understand how the physical event changes, and turn uncertainty into accountable action.**

The current event identity, provenance, replay, PostGIS, geospatial-integrity, and evidence-lifecycle work is not discarded. It becomes the **backplane** underneath the real product.

## The product we are building

Four primary operator surfaces:

1. **PREVENT** — What dangerous physical conditions are emerging before ignition?
2. **DETECT** — What new physical fire signals exist now, including unreported candidates?
3. **FIRE** — What is physically happening to this fire, how do we know, and how is it changing?
4. **ACTION** — What evidence or human action must happen next?

Secondary technical surfaces:

- Replay
- Validation
- Source Health
- Provenance

These support the product; they do not define it.

## The 48-hour rule

Do not spend this sprint on:

- outcome dashboards
- speculative consequence UI
- broad alerting
- marketing pages
- AI chat
- generic risk scores
- cosmetic replay polish
- new demo fixtures
- provider abstractions with no working source
- additional provenance detail unless it directly supports a new detector

Every hour must improve at least one of:

- **pre-ignition hazard detection**
- **physical ignition detection**
- **physical-event coverage**
- **fire evolution**
- **time to verified physical state**

## Safety boundary

This sprint may produce an exceptional **shadow-operations / engineering intelligence** product. It must not claim autonomous emergency authority, validated evacuation guidance, or proven life-safety performance without external institutional validation.

## How to use this folder

The top agent should read in this order:

1. `01_MASTER_EXECUTION_PROMPT.md`
2. `02_48_HOUR_WAR_PLAN.md`
3. `03_PRODUCT_RESET_ARCHITECTURE.md`
4. `04_DETECTION_ENGINES.md`
5. `05_TERRITORY_COMMAND_UX.md`
6. `06_REAL_SOURCE_ACQUISITION.md`
7. `07_VALIDATION_AND_METRICS.md`
8. `08_RELEASE_GATES.md`
9. `09_ADVERSARIAL_QA.md`
10. `10_VC_PROOF_AND_PORTFOLIO.md`
11. `11_AGENT_HANDOFF_CHECKLIST.md`

Do not treat these documents as independent wish lists. They describe one vertical product transformation.

## Non-negotiable end state

At the end of the sprint, the product must make this difference obvious without explanation:

### Before

public report → marker → unknown physical state → evidence diagnostics

### After

territory → physical hazard / ignition signal → canonical event → evolving evidence → unknown → next observation/action

If screenshots still look like "fire reports in a nice UI," the sprint failed.
