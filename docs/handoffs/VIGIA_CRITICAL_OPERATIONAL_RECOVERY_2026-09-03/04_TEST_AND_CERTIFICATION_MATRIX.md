# 04 — Test and Certification Matrix

## 1. Baseline capture

Before changes, preserve:

- release identity;
- runtime status;
- route screenshots at 1672×941;
- mobile and tablet captures;
- performance trace;
- contradiction report;
- operational/candidate/revalidation/history counts;
- selected incident state;
- map transport/layer state;
- source-resolution inventory;
- outcome-chain inventory.

## 2. Domain and contract tests

### Classification

- fresh official incident → VERIFIED_CURRENT;
- fresh multi-source incident → VERIFIED_CURRENT;
- single-source thermal signal → DETECTION_CANDIDATE;
- stale non-official incident → NEEDS_REVALIDATION;
- extinguished/archive → HISTORICAL_CLOSED;
- shuffled source/event order → identical classification;
- no timestamp → cannot be current active;
- contradictory official states → fail closed and create resolver job.

### Cross-route invariants

For a fixture incident, compare Command, Incidents, Detail, Intelligence, Operations, Reports, and Global fields.

Expected zero differences for shared semantics.

### Workload consistency

- human escalation produces Needs Attention and Needs You;
- resolved decision removes it;
- unresolved high-impact produces attention;
- evidence requirement does not increment response-action count.

### Source resolution

- deterministic source selection;
- immediate attempt;
- bounded retry/backoff;
- nextAttemptAt persisted;
- circuit breaker;
- idempotent restart;
- escalation after deadline;
- completion on qualifying source;
- audit history preserved.

### Protection

- recommendation requires exposure/threshold basis;
- authority required before approval;
- no dispatch before approval;
- acknowledgement linked;
- update/cancel/expire transitions;
- exercise cannot call production delivery;
- unauthorized send rejected.

### Outcomes

- distinct identities per stage;
- correct lineage;
- missing stage not inferred;
- replay separated from live;
- duplicate acknowledgement idempotent;
- observed postcondition does not imply positive outcome;
- insufficient evidence remains indeterminate.

## 3. Browser task tests

### Command

- click five markers and five priority rows;
- useful Quicklook appears in one action;
- Quicklook data matches route classification;
- open Detail/Intelligence/Operations;
- back returns with map camera and selection retained.

### Incidents

- search insertion/caret/IME/paste;
- lifecycle filters;
- freshness filters;
- priority/rationale;
- row/map/URL synchronization;
- Bragança selection moves to Bragança;
- A→B→C rapid selection; C wins.

### Detail

- incident switcher A→B→C;
- current situation/freshness/sources/risk/resolution update atomically;
- stale state visually explicit;
- source-resolution job opens;
- raw enum absent.

### Intelligence

- Now/Next/Watch/Uncertainty/Decision distinct;
- thermal View on map visibly focuses/highlights;
- weather association label correct;
- no-geometry control disabled;
- watchpoint drill-down.

### Operations

- change incident in place;
- switch Source Resolution/Response Operations;
- select queue item;
- inspector updates;
- human decision action;
- protection exercise flow;
- no dead controls.

### Reports

- four tabs, arrow-key navigation, URL state;
- current period/compare/export;
- quality drill-down;
- performance metric remediation;
- outcome funnel drill-down;
- live/replay separation.

### Global

- every filter changes visible results;
- active chips;
- fit results;
- semantic marker legend;
- Quicklook;
- no map remount/reload.

## 4. Map performance certification

Capture:

- cold first tile;
- warm first tile;
- stable render p50/p95;
- pointer-to-first-paint;
- tile request/failure/cache metrics;
- source/layer count;
- map mounts/destroys/style reloads;
- blank-frame duration;
- camera transition timing;
- label fallback behavior.

Use at least Command, Incidents, Detail, Intelligence, and Global.

## 5. Responsive matrix

Routes × viewports:

```text
1672×941
1440×900
1280×800
1024×768
768×1024
430×932
390×844
320×568
200% browser zoom desktop
```

No horizontal overflow. Critical content must wrap or move to inspectors.

## 6. Required evidence artifacts

```text
.artifacts/operational-truth-recovery/
  baseline/
  final/
    route-screenshots/
    interaction-evidence/
    responsive/
    performance/
    source-resolution/
    protection-flow/
    outcome-chain/
    invariant-report.json
    scorecard-before-after.json
    release-identity.json
    certification-index.json
```

## 7. Certification rule

A static test pass is insufficient.

A release may be called READY only when:

- all P0 gates pass in fresh runtime;
- invariant report contains zero contradictions;
- screenshots show useful, non-debug operator language;
- performance thresholds pass;
- the source-resolution scheduler is observed running;
- one protection flow and one outcome chain are persisted and inspectable;
- no production truth was fabricated.
