# 05 — End-of-Day Report Template

Use this exact structure.

# VIGIA Operational Truth and Action Recovery

## 1. Release identity

- Release:
- Code-state hash:
- Operational-data hash:
- Statement hash:
- Runtime profile:
- Dirty/staged/committed state:

## 2. Executive result

- Previous overall operator-value score:
- Final evidence-based score:
- P0 gates passed:
- P0 gates blocked:
- Exact external blockers:

## 3. Operational scope

| Class | Before | After | Rule |
|---|---:|---:|---|
| Verified current | | | |
| Detection candidates | | | |
| Needs revalidation | | | |
| Historical/closed | | | |
| Total canonical | | | |

## 4. Contradictions eliminated

List every previous contradiction and its canonical fix.

Attach `invariant-report.json` and prove contradiction count 0.

## 5. Source-resolution engine

- Jobs created:
- Jobs with identified source:
- Jobs attempted:
- Jobs resolved:
- Jobs escalated:
- Oldest job:
- Median next-check delay:
- Providers activated:
- Retry/circuit-breaker proof:

## 6. Route value

### Command Overview

What changed, why it is now operationally useful, screenshot.

### Incidents

Classification, priority rationale, selection/camera proof.

### Incident Detail

Freshness, source strength, risk, resolution, next decision.

### Intelligence

Now/Next/Watch/Uncertainty/Decision and spatial-action proof.

### Operations

Source Resolution versus Response Operations, human decision, protection flow.

### Reports & Analytics

Decision, Outcomes, Performance, Situation Quality drill-downs.

### Global Awareness

Filter effects, geolocation coverage, marker semantics, Quicklook.

## 7. Protection flow

- Universe: LIVE / SHADOW_EXERCISE / CERTIFIED_REPLAY
- Incident:
- Exposure basis:
- Threshold:
- Recommendation:
- Authority:
- Approval:
- Dispatch/draft:
- Acknowledgement:
- Update/cancel/expire:
- Safety proof:

## 8. Outcome chain

Provide distinct IDs and timestamps for:

- action;
- acknowledgement;
- expected postcondition;
- observed postcondition;
- outcome classification.

State whether it is live or certified replay. Do not claim causal success beyond evidence.

## 9. Performance

| Metric | Before | After | Target | Result |
|---|---:|---:|---:|---|
| API p95 | | | <1,000 ms | |
| Map stable render p95 | | | <1.5 s warm | |
| Cold map stable render | | | <2.5 s | |
| Tile failure rate | | | <1% | |
| Blank frames | | | 0 | |
| Map remounts | | | 0 | |

## 10. Quality coverage

Report operational subset denominators, not total historical universe only.

| Dimension | Before | After | Target |
|---|---:|---:|---:|
| Fresh/current | | | ≥80% |
| Geolocated | | | ≥95% |
| Independent or official | | | ≥70% |
| Source state explicit | | | 100% |
| Priority rationale | | | 100% |
| Resolver job linked | | | 100% |

## 11. Tests

- Domain:
- API:
- FieldNet isolation:
- Source resolution:
- Protection:
- Outcomes:
- Browser interactions:
- Responsive:
- Accessibility:
- Performance:
- Cold starts:

## 12. Remaining limitations

Only genuine external/scientific/authority limitations. Do not call an implementation gap an external blocker.

## 13. Changed files

Group by domain, API, operator console, runtime, tests, validation.

## 14. Final phrase

VIGIA_OPERATIONAL_TRUTH_AND_ACTION_RECOVERY_READY

or

VIGIA_OPERATIONAL_TRUTH_AND_ACTION_RECOVERY_BLOCKED: <precise blocker>
