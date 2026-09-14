# VIGIA product metrics framework

## Product outcome

The primary outcome is **time to defensible operational comprehension**: elapsed time from opening a current operational state to correctly stating NOW, NEXT, WHY, the material evidence gap, and what VIGIA does not know.

This is not a claim that faster is always safer. A fast but incorrect interpretation is a failure.

## Core metrics

| Metric | Definition | Guardrail |
|---|---|---|
| Defensible comprehension rate | Sessions where the operator correctly states NOW/NEXT/WHY, evidence gap, and unknowns without assistance | Any false-certainty answer is reviewed separately, not averaged away. |
| Time to defensible comprehension | Time to the first complete, correct situation statement | Report median and distribution by role; exclude unexecuted tasks. |
| Correct first action rate | First chosen action matches the governed next step or a safe investigation step | Never reward escalation unsupported by evidence. |
| Incident continuity rate | Cross-route journeys retaining the intended canonical event | A single wrong-incident transition is safety-critical. |
| Evidence interpretation accuracy | Correct separation of report, physical observation, corroboration, contradiction, freshness, and missing evidence | Numeric zero must not represent missing measurement. |
| Degraded-mode task completion | Core tasks completed with a failed tile or evidence preview | Structured truth must remain available. |
| Handoff completeness | Required alert, evidence, source, measurement, incident, and unknown-state elements identified | Command or assignment data may only count when linked. |
| Interaction latency | Route and event-selection response time measured in the certified frontend | Track p50/p95 and payload volume; do not hide cold-start results. |
| Detection lead time | First attributable physical observation to the governed external incident/report reference | Report only where the reference clock and observation opportunity are complete. |
| Independent corroboration time | First physical observation to the first attributable observation from an independent family | Repeated observations from one family do not count. |
| Observation-to-operator latency | Provider observation time to first operator-visible canonical state | Preserve acquisition, ingest, persistence, projection, and render clocks separately. |
| Operator acknowledgement time | First visible governed work item to attributable operator acknowledgement | Missing identity or failed writes remain unmeasured, not zero. |
| Multi-source evidence coverage | Incidents with defensible independent physical families divided by eligible incidents | Publish the eligibility denominator and freshness policy. |
| Evidence-acquisition closure time | Evidence need opened to attributable closure or explicit terminal outcome | Duplicate, unobtainable, and expired outcomes remain distinct. |
| Source availability / freshness | Usable provider time and age distribution by source | A healthy zero-result provider remains healthy and must not count as positive evidence. |
| Incident-switch decision time | Event selection to correct operator statement of changed identity and state | Pair latency with correctness; a fast wrong-incident interpretation fails. |
| Handoff comprehension time | Handoff open to a correct statement of current work and unknowns | Report by role and preserve safety-critical misunderstandings individually. |
| Degraded-connectivity continuity | Core tasks completed under declared image/network failure conditions | Name the exact degraded condition and structured state retained. |
| False escalation rate | Escalations unsupported by the governed evidence state divided by eligible decisions | Requires attributable decision outcomes; do not infer from UI clicks alone. |

## Adoption and safety signals

- Assisted-task rate and repeated wrong turns
- Safety-relevant misunderstandings per session, kept as individually reviewable events
- Operator confidence paired with correctness
- Source-state misclassification rate
- Frequency of “unavailable” correctly understood without support
- Abandonment or fallback to another system, with reason
- Accessibility completion by keyboard and at supported viewport sizes

## Instrumentation boundaries

Instrument route transitions, event-selection latency, drawer open/close, comparator position changes, setting save confirmation, image-load failure state, and explicit operator actions. Use opaque session/participant IDs. Do not capture free-text operational notes, personal identity, precise live locations beyond existing governed records, or raw evidence URLs in product analytics.

## Pilot reporting

Report sample size, roles, release identity, scenario execution counts, cold/warm conditions, and missing data. Separate browser acceptance results from human validation. Proposed thresholds are hypotheses until baseline sessions exist; do not label the product pilot-ready from automated checks alone.
