# VIGIA → Claude Code Handoff

## READ FIRST

This repository is a snapshot of the CURRENT uncommitted VIGIA working tree after Mega Intelligence VII.

Do not restart the project.
Do not redesign VIGIA.
Do not remove existing intelligence.
Do not replace real data with fixtures.
Do not weaken security/readiness checks to make them green.

Before changing anything, read:

- `docs/internal/automation/AGENTS.override.md`
- `docs/handoffs/mega-vii/REPORT.md`

## CURRENT PRODUCT

VIGIA now includes:

- Operational Picture
- qualified Operational Support
- significant-road dependency intelligence
- EM527 shared-corridor analysis
- direct road/facility failure testing
- simultaneous failure scenarios
- community intelligence
- healthcare/fire/reception coverage
- limited-support-redundancy analysis
- causal operational history
- Mission Replay
- bounded deterministic Stress Test
- Intelligence Gaps
- grounded Ask VIGIA map actions
- canonical facilities
- source provenance
- qualified capabilities
- persistent history

Preserve all of it.

## CURRENT BLOCKERS

### 1. MAP/API TAIL LATENCY

Latest reported p95:

- Cold: 7.282 s
- Detail → Fire: 1.056 s
- Fire → Response: 1.944 s
- Cached revisit: 669 ms
- Incident switch: 20.289 s
- Overview: 7.941 s
- National: 15.898 s

All performance gates remain failed.

Do real critical-path profiling.

Do not hide latency with loaders.

Target:

- cold ≤2.5s p95
- Detail → Fire ≤1s
- Fire → Response ≤1s
- cached ≤400ms
- incident switch ≤1.5s
- Overview ≤2.5s
- National ≤2.5s

### 2. FREE LOCAL AI

There is currently NO qualified AI model.

Qwen 3.5 2B MLX failed because the previous agent environment could not expose a Metal device.

This MUST be retested on the actual physical M3 Mac.

Llama 3.2 3B CPU:
- 23/104 completed
- 81 timeouts
- 14.42% task accuracy
- 50% tool-intent accuracy
- rejected

Preferred direction:

- Apple-Silicon-native MLX
- small 2B–4B model
- separate inference process
- no paid inference
- no model calls during normal map usage

Model role ONLY:

- natural language → approved VIGIA tool
- Portuguese document candidate extraction
- source-change interpretation
- grounded short explanation

The deterministic VIGIA world model remains authoritative.

### 3. READINESS

`/ready` remains 503.

Known blockers:

- `audit_chain = invalid`
- `physical_source_families = insufficient`

Never fabricate audit signatures.
Never rewrite chronology just to pass.
Never count fixtures/model output as physical sensing.

Investigate the exact legitimate repair boundary.

## EXECUTION ORDER

1. Verify Mega VII still works.
2. Profile and fix map/API tail latency.
3. Test local AI directly on the physical Mac.
4. Qualify or reject the model using real corpus results.
5. Repair legitimate readiness defects.
6. Run full Mega VII regression.

## ABSOLUTE PRODUCT RULES

No source → no claim.

No road restriction returned ≠ road confirmed safe.

Hospital ≠ verified emergency department.

Designation ≠ activation.

Geographic nearest ≠ qualified nearest.

Scenario ≠ current reality.

Historical state ≠ current state.

Census population ≠ people currently present.

The UI must remain simpler than the intelligence underneath it.

## FINISH THE WORK

Do not return another planning document.

Implement, measure, verify, and return:

- exact performance before/after
- exact AI qualification results
- exact readiness state
- Mega VII regression results
- remaining blockers
