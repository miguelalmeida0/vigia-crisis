# VIGIA

**Portugal-first crisis intelligence for turning fragmented wildfire signals into attributable, inspectable operational context.**


[Repository guide](./docs/START_HERE.md)

<sub>Presentation captures showing unavailable data or maps are not used as product previews.</sub>

VIGIA is a full-stack decision-support system built around one rule: **an operational interface should distinguish what was observed, what was reported, what was inferred, and what is still unknown.**


## The product in 30 seconds

```mermaid
flowchart TB
  OBS(["Physical observations"]):::actor
  REPORT(["Official reports"]):::actor
  EVENT[["Canonical incident identity"]]:::system
  CONTEXT["Operational context<br/>weather · terrain · roads · facilities"]:::data
  OPS(["Operator console"]):::safe
  GAP{"What is still unknown?"}:::decision
  ACQUIRE["Acquire / verify"]:::guard
  ACTION(["Briefs · routes · alerts"]):::safe

  OBS --> EVENT
  REPORT --> EVENT
  EVENT --> CONTEXT --> OPS
  OPS --> ACTION
  OPS --> GAP --> ACQUIRE --> EVENT

  classDef actor fill:#E8F1FF,stroke:#2563EB,color:#0F172A,stroke-width:1.6px;
classDef system fill:#ECFEFF,stroke:#0891B2,color:#0F172A,stroke-width:1.6px;
classDef decision fill:#FFFBEB,stroke:#D97706,color:#0F172A,stroke-width:1.6px;
classDef guard fill:#FFF7ED,stroke:#EA580C,color:#0F172A,stroke-width:1.6px;
classDef safe fill:#ECFDF5,stroke:#059669,color:#0F172A,stroke-width:1.6px;
classDef private fill:#FFF1F2,stroke:#E11D48,color:#0F172A,stroke-width:1.6px;
classDef data fill:#F8FAFC,stroke:#64748B,color:#0F172A,stroke-width:1.6px;
linkStyle default stroke:#94A3B8,stroke-width:1.5px;
```

VIGIA is not a generic dashboard. It is designed around an operator’s sequence of questions:

1. **What is happening?**
2. **Which source says that?**
3. **How fresh is it?**
4. **What is independently corroborated?**
5. **What is still missing?**
6. **What can I safely act on now?**

## Operator flow

```mermaid
flowchart LR
  DETECT(["01 · Detect<br/>thermal · report · field"]):::actor
  ATTRIBUTE["02 · Attribute<br/>source · time · geometry"]:::data
  ASSOCIATE[["03 · Associate<br/>stable incident identity"]]:::system
  UNDERSTAND["04 · Understand<br/>weather · roads · facilities · history"]:::data
  GAP{"05 · Find the gap<br/>stale · missing · unresolved"}:::decision
  ACT(["06 · Act<br/>brief · route · alert · acknowledge"]):::safe

  DETECT --> ATTRIBUTE --> ASSOCIATE --> UNDERSTAND --> GAP --> ACT
  GAP -. "need more truth" .-> DETECT

  classDef actor fill:#E8F1FF,stroke:#2563EB,color:#0F172A,stroke-width:1.6px;
classDef system fill:#ECFEFF,stroke:#0891B2,color:#0F172A,stroke-width:1.6px;
classDef decision fill:#FFFBEB,stroke:#D97706,color:#0F172A,stroke-width:1.6px;
classDef guard fill:#FFF7ED,stroke:#EA580C,color:#0F172A,stroke-width:1.6px;
classDef safe fill:#ECFDF5,stroke:#059669,color:#0F172A,stroke-width:1.6px;
classDef private fill:#FFF1F2,stroke:#E11D48,color:#0F172A,stroke-width:1.6px;
classDef data fill:#F8FAFC,stroke:#64748B,color:#0F172A,stroke-width:1.6px;
linkStyle default stroke:#94A3B8,stroke-width:1.5px;
```

## Why I built it

Emergency interfaces often make two mistakes at once: they show too much data and they flatten confidence into a single visual layer.

VIGIA treats **source identity, freshness, spatial integrity, and uncertainty as product concepts**. A satellite point is not a fire perimeter. A public report is not physical measurement. An inferred relationship is not an observation. The UI and domain model preserve those differences.

## System architecture

```mermaid
flowchart TB
  subgraph Sources["Sources"]
    PHYSICAL["Physical sensing<br/>FIRMS · Sentinel · MTG"]:::actor
    OFFICIAL["Official reports"]:::actor
    ENV["Weather · risk · terrain"]:::data
    FAC["Facilities · roads"]:::data
  end

  subgraph Truth["Operational truth layer"]
    INGEST[["Ingest + normalize"]]:::system
    POSTGIS[("PostgreSQL + PostGIS")]:::data
    EVENT[["Canonical event engine"]]:::system
    LINEAGE["Lineage + source health"]:::guard
  end

  subgraph Product["Decision-support product"]
    API[["Node API"]]:::system
    OPS(["Operator console"]):::safe
    OUTPUT(["Briefs · routes · alerts"]):::safe
  end

  PHYSICAL --> INGEST
  OFFICIAL --> INGEST
  ENV --> INGEST
  FAC --> INGEST
  INGEST --> POSTGIS --> EVENT
  EVENT --> LINEAGE
  EVENT --> API
  LINEAGE --> API
  API --> OPS --> OUTPUT

  style Sources fill:#F8FAFC,stroke:#CBD5E1,stroke-width:1px
  style Truth fill:#ECFEFF,stroke:#A5F3FC,stroke-width:1px
  style Product fill:#ECFDF5,stroke:#A7F3D0,stroke-width:1px
  classDef actor fill:#E8F1FF,stroke:#2563EB,color:#0F172A,stroke-width:1.6px;
classDef system fill:#ECFEFF,stroke:#0891B2,color:#0F172A,stroke-width:1.6px;
classDef decision fill:#FFFBEB,stroke:#D97706,color:#0F172A,stroke-width:1.6px;
classDef guard fill:#FFF7ED,stroke:#EA580C,color:#0F172A,stroke-width:1.6px;
classDef safe fill:#ECFDF5,stroke:#059669,color:#0F172A,stroke-width:1.6px;
classDef private fill:#FFF1F2,stroke:#E11D48,color:#0F172A,stroke-width:1.6px;
classDef data fill:#F8FAFC,stroke:#64748B,color:#0F172A,stroke-width:1.6px;
linkStyle default stroke:#94A3B8,stroke-width:1.5px;
```

## Engineering highlights

### Stable incident identity

Observations and reports can arrive in different orders. VIGIA associates them to persistent events instead of letting whichever source arrived last replace the incident identity.

### PostGIS as an operational primitive

Spatial relationships are queryable domain state, not just map decoration. The backend uses PostgreSQL/PostGIS for canonical observations, event associations, source checkpoints, lineage, and spatial reasoning.

### Geospatial integrity gates

Catalogue metadata is not sufficient to prove that a raster really covers the requested location. The scientific path validates CRS, transforms, pixel coordinates, and source-band alignment before image-derived screening is allowed to advance.

### Fail-closed source semantics

Source outages and stale data remain visible. VIGIA does not silently replace unavailable physical evidence with a different class of data.

### Readable uncertainty

The system distinguishes:

- physical observation;
- official report;
- association;
- screening/inference;
- unmeasured probability;
- missing evidence;
- stale/unavailable source.

That distinction is carried from backend contracts into the operator UI.

## Current operator surfaces

### Command Overview

A national operational summary that keeps current incidents, source health, mapped records, and immediate actions in one place.

### Incidents

Browse the current incident set without losing source identity or freshness context.

### Incident Detail

Inspect one incident deeply: observations, history, facilities, access, dependencies, and unresolved operational context.

### Fire Activity

Review current fire detections and updates as attributable records rather than flattening every signal into one confidence layer.

### Response & Access

Bring routes, restrictions, reception locations, facilities, and response context together for action-oriented inspection.

### National Awareness

Zoom back out to national situational context and compare activity across the country.

Operational actions remain available contextually inside these surfaces rather than requiring a separate dashboard taxonomy.

## API surface

Representative endpoints include:

```text
GET  /api/v10/events
GET  /api/v10/evidence-needs
GET  /api/v10/capabilities
GET  /api/v10/ready
GET  /api/v10/prevention/findings
POST /api/v10/sensors/observations
POST /api/v10/sensors/:id/task
GET  /api/v10/alerts
POST /api/v10/alerts/:id/acknowledge
POST /api/v10/observations/change-screening
POST /api/v10/events/corrections/merge
POST /api/v10/events/corrections/split
POST /api/v10/events/corrections/reject
```

## Run locally

```bash
git clone https://github.com/miguelalmeida0/vigia-crisis.git
cd vigia-crisis
npm install
npm run runtime:setup
npm run geo:doctor
npm run dev:live
```

A real FIRMS key and PostGIS unlock the complete physical-observation path. Read-only inspection can run without them, but the system deliberately keeps readiness degraded rather than pretending the missing sources are available.

## Verification

```bash
npm run geo:doctor
npm test
npm run check
npm run smoke
```

Additional browser, PostGIS, replay, and operator-certification gates live in the repository.

## Safety and scope

VIGIA is a **portfolio/research decision-support system**, not operational certification for emergency command. It does not autonomously issue evacuation or dispatch decisions. Unvalidated screens abstain from probability claims, and physical measurements remain distinct from reports and derived context.

---

Built by [Miguel Almeida](https://github.com/miguelalmeida0).
<!-- repository-presentation-repair:1 -->
