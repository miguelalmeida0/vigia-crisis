# Territory Command UX

# Design objective

A trained operator should understand the territory in **10 seconds**.

An investor should understand the product thesis in **30 seconds**.

The UI must not require an architecture explanation.

---

# 1. Territory Command

## Header

VIGIA
Territory Command

Secondary global controls:

- Source Health
- Replay
- Validation
- Identity

## Command strip

PRE-IGNITION
3

PHYSICAL CANDIDATES
2

PHYSICAL FIRES
4

REPORT-ONLY
1

NEEDS EVIDENCE
5

SENSING
DEGRADED

## Left queue

Rows must identify object type first.

Example:

### FUEL CONTINUITY
Monchique
3.8 ha · 47 structures nearby
First visible 3–8 Aug

### THERMAL CANDIDATE
Castelo Branco
VIIRS · 7m ago
No public report

### FIRE
Viseu
Physical · 3m ago
Last observed growing

### REPORT ONLY
Arcos de Valdevez
Report 11m ago
No physical corroboration

## Center map

Layer order:

1. selected physical/hazard geometry
2. active physical phenomena
3. pre-ignition findings
4. physical candidates
5. report-only
6. stale/archive
7. basemap labels

No giant locality labels.

## Right inspector

Five compressed sections:

1. CURRENT TRUTH
2. RESPONSE
3. CONDITIONS
4. SENSING
5. NEXT KNOWLEDGE

One fact once.

---

# 2. Prevent

Question:

> What dangerous physical conditions changed before ignition?

Primary:

- real imagery/map
- real finding polygons
- comparable date
- finding list

Inspector:

- type
- area
- length/span
- first visible
- structures/assets nearby
- source quality
- validation state
- evidence
- action

Do not show generic checklists unless assigned as field work.

---

# 3. Detect

Question:

> What new physical fire signals exist?

Populations:

- unreported thermal
- multisource candidates
- recently corroborated
- ambiguous
- rejected/false candidates

Visual:

- physical observation first
- report association second

---

# 4. Fire

Question:

> What is physically happening, and how do we know?

## Situation Strip

TRUTH
Physical current
Report active
Last observation 4m

RESPONSE
Personnel 31
Vehicles 8
Aircraft 1

CONDITIONS
Danger 4/5
Wind 21 NW
RH 24%

SENSING
VIIRS
Sentinel-3
MTG status

## Living Fire

Map + timeline are dominant.

Right rail:
Evidence synthesis, not log.

Bottom:
Next Knowledge / Action.

---

# 5. Action

Unauthenticated state should be small.

Authenticated state should be the product.

Rows/lanes:

OVERDUE
NEEDS OWNER
WAITING SENSOR
FIELD
ASSOCIATION REVIEW
NO PATH

Each item:

- object
- missing quantity
- evidence plan
- owner
- due
- state
- closure condition

---

# 6. Visual system

Keep strong existing brand DNA, but simplify.

### Palette

- graphite/black operational background
- off-white text
- amber for attention
- orange/red for physical fire
- yellow for hazard
- muted grey for stale
- green only for explicit verified healthy/closed state

### Typography

Large typography only for:
- page identity
- critical state transitions

Do not render place names as giant map labels.

Metadata must be readable.

### Containers

Use fewer boxes.
Use aligned sections, rules, rhythm, drawers.

### Charts

Need a consistent grammar:
- FRP: thermal orange
- weather: restrained semantic colors
- timeline: source-specific marks
- benchmark: before/after without marketing embellishment

---

# 7. Empty states

Empty = operational knowledge.

Example:

NO CURRENT PHYSICAL FIRES

VIIRS healthy
Sentinel-3 pass-dependent
MTG degraded
3 report-only incidents

Never fill space with fake events.
