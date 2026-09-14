# 03 — Acceptance Gates

No subjective `READY` statement overrides these gates.

## Gate group 1 — Semantic integrity

- Cross-route semantic contradictions: **0**.
- Total canonical, operational current, candidate, revalidation, and historical counts reconcile exactly.
- Stale non-official records counted as active: **0**.
- Manual/human escalation present while attention counts are zero: **0**.
- Evidence requirements counted as response actions: **0**.
- Weather association contradictions: **0**.
- Selected incident/map mismatch: **0**.
- Raw internal enums in primary UI: **0**.

## Gate group 2 — Operational subset quality

For `VERIFIED_CURRENT` incidents:

- Valid observation/official timestamp: **100%**.
- Fresh within operational window or officially current: **≥80%**.
- Usable geolocation/geometry: **≥95%**.
- At least one admitted source object: **100%**.
- Independent corroboration OR current official confirmation: **≥70%**.
- Explicit verification state: **100%**.
- Explicit source coverage state: **100%**.
- Priority items with rationale: **100%**.
- Critical unresolved fields linked to a resolver job: **100%**.

If the full 173-record universe cannot meet these gates, reduce the operational subset by governed classification. Do not change the thresholds.

## Gate group 3 — Source resolution

For every active resolver job:

- required source class identified: **100%**;
- owner identified: **100%**;
- last attempt state available: **100%**;
- next attempt timestamp available: **100%**;
- retry policy available: **100%**;
- deadline/escalation rule available: **100%**;
- decision impact available: **100%**;
- completion condition available: **100%**.

Generic `waiting for external source` without a named requirement/provider class: **0**.

## Gate group 4 — Command and triage

- Primary Command metrics use governed lifecycle classes.
- `Needs Attention` equals canonical human-decision workload.
- One-click map/list selection opens useful Quicklook.
- Every priority item explains why ranked.
- `context` as a priority value: **0 occurrences**.
- No stale record is visually indistinguishable from a current verified incident.

## Gate group 5 — Maps

- Map stable render p95: **<1.5 s** on warm path and **<2.5 s** cold local path.
- API response p95 for critical operator projections: **<1,000 ms**.
- Tile failure rate: **<1%**; target **0** for governed local certification.
- Blank map frames during filter/selection/refresh: **0**.
- Map remounts during filter/selection/drag: **0**.
- Style reloads during filter/selection: **0**.
- Parent-label upscaling artifacts: **0**.
- Trackpad/wheel/touch/keyboard navigation: **PASS**.
- A→B→C incident camera/source synchronization: **PASS**.
- Operational subset geolocation: **≥95%**.

## Gate group 6 — Intelligence

- Now/Next/Watch/Uncertainty/Decision are semantically distinct.
- Watchpoints with current value, threshold, trend, freshness, consequence: **100% where backend data exists**.
- Displayed weather carries association scope: **100%**.
- Mappable artifact actions cause visible spatial focus/highlight: **100%**.
- Disabled non-mappable actions explain why.
- Withheld geometry never causes the rest of Intelligence to become an empty warning page.

## Gate group 7 — Operations and protection

- Source-resolution work and response operations are separated.
- Response-operation rows that are merely evidence requirements: **0**.
- Every critical response action has owner and next check/deadline: **100%**.
- Human decision queue is canonical and drillable.
- Governed Protect workflow exists end-to-end in live or isolated `SHADOW_EXERCISE` mode.
- No external alert/send occurs without authority and explicit configuration.

## Gate group 8 — Outcomes

- At least one persisted certified chain exists:

```text
action → acknowledgement → expected postcondition → observed postcondition → outcome classification
```

- Production and replay/exercise results are visually and structurally separated.
- No resolution requirement is counted as an action/outcome stage.
- Every funnel stage count drills down to distinct records.
- Causal claims without evidence: **0**.

## Gate group 9 — Reports

- All four tabs change content and URL without unrelated remounts.
- Every measured quality dimension has a functional incident drill-down.
- Performance states use SLOs, not process availability.
- Decision rows include reason and consequence or explicit resolver ownership.
- Export reflects current scope/time/filter.
- Duplicate/repeated vanity metrics: **0**.

## Gate group 10 — Accessibility and responsive integrity

- Zero horizontal page overflow at mandated viewports.
- 200% zoom: no clipped status chips, tables, Quicklooks, selectors, or critical text.
- Critical text ellipsis: **0**.
- Keyboard route, selector, queue, tabs, Quicklook, dialogs, and map controls: **PASS**.
- Focus return on close: **PASS**.
- Touch targets: **≥44×44 px** where appropriate.
- Status meaning is not color-only.

## Gate group 11 — Runtime and release

Two cold starts must reach:

```text
Database READY
Central API READY
FieldNet READY
Operator READY
```

API, FieldNet, Operator, and manifest release identities must agree.

Component READY must match each component's own readiness payload.

No runtime data reset. No staging. No commit.
