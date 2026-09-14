# Reports & Analytics Information Architecture

## Shared report controls

All four report lenses share an authorized scope, explicit time range, previous-period comparison, and export control. The active lens is hash route state and does not leak into another route or trigger document navigation.

## Decision Summary

Answers: Which material decisions changed, what remains unresolved, and where did human correction occur?

It shows non-duplicated decision KPIs, time distribution, state breakdown, and latest meaningful changes with incident, transition, reason, consequence, and UTC time. Unavailable latency pipelines are presented as compact instrumentation gaps.

## Outcome Analysis

Answers: Are recorded actions producing measurable outcomes?

The only funnel is:

`Actions initiated → Acknowledged → Postcondition defined → Postcondition observed → Outcome measured`

Each count is based on a distinct persisted record identity. Derived resolution requirements, aliases, inferred acknowledgements, and repeated work rows are excluded. The 624 monitored resolution requirements therefore remain visible as separate work inventory and are not presented as action or outcome progress. When no intervention records exist, every funnel stage truthfully remains zero and the route explains the next record needed.

## System Performance

Answers: Is the platform meeting measurable user-facing service objectives?

Tile failures, map stabilization, first-base-tile latency, API p50/p95, and route visual response are evaluated independently. Severe tile/render failure forces a degraded or critical state even when other services are operational. Missing instrumentation is not green.

## Situation Quality

Answers: Which dimensions limit the quality of the operating picture?

Quality is split into explicit dimensions such as verification, source corroboration, freshness, and scientific admission. No opaque composite confidence score is created. Each dimension names its definition, numerator, denominator, coverage or affected proportion, and drill-down availability. Forecast admission is a separate scientific state with owner and next trigger.

## Progressive disclosure

Primary report content uses incident names, human state descriptions, operational consequences, and UTC time. Canonical IDs, hashes, schemas, source codes, and lineage details are confined to technical disclosures. Missing data is never replaced with fabricated values.
