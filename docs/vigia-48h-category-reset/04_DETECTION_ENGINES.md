# Detection Engines

# A. Pre-Ignition Hazard Engine

## First detector: Fuel Continuity Change

### Why this detector first

It is:

- relevant to wildfire prevention
- observable at Sentinel-2 scale
- naturally geospatial
- actionable
- explainable
- possible to evaluate
- visually compelling without scientific theatre

### Inputs

- Sentinel-2 L2A B02/B03/B04/B08/B11/B12 as needed
- SCL
- current and comparable prior scene
- terrain
- roads
- buildings
- land cover
- existing WUI/infrastructure context

### Comparable scene policy

Require:

- sufficient temporal separation
- similar season/phenology where possible
- acceptable cloud/shadow
- full AOI coverage
- same/compatible projection
- registration quality

### Candidate feature families

- NDVI/vegetation-cover change
- NDMI/moisture context
- SWIR/vegetation structure signal
- land-cover connectivity
- component morphology
- road crossings
- proximity to structures

Do not use an index alone as "fuel."

### Connectivity

Goal is not "green pixels increased."

Goal:

> Does a continuous vegetation/fuel-like path now connect or materially approach vulnerable human/infrastructure assets?

Build a graph/raster connectivity representation.

Output corridor/path statistics.

### Abstention

Abstain when:

- cloud/shadow too high
- registration poor
- source pixels unavailable
- comparable scene unsuitable
- AOI incomplete
- geometry fails integrity
- sensor resolution cannot answer question

### Human review

Every finding starts as `SCREENING_CANDIDATE`.

Accept/reject reason becomes labelled data.

---

# B. Combustible Accumulation Detector — next, not first

Do not build until Fuel Continuity works.

Potential targets at suitable scale:

- large forestry residue
- major illegal dump
- large burn pile
- large construction debris
- large timber accumulation

Small objects:
abstain and escalate.

---

# C. Physical Ignition Engine

## Thermal providers

Priority:

- VIIRS
- Sentinel-3 SLSTR FRP
- MTG structured fire/FRP

## Candidate lifecycle

ThermalObservation
→ candidate association set
→ if no good match:
  `UNREPORTED_PHYSICAL_FIRE_CANDIDATE`
→ corroborating physical/report evidence
→ canonical fire

## False-candidate controls

Use source-native:

- confidence
- day/night
- scan/track
- quality flags
- persistent/repeated observation
- known industrial thermal context where available

Do not invent calibrated existence probability.

---

# D. Fire physical-state engine

Maintain observations, not imaginary perimeter.

Derived physical summaries:

- FRP
- observation count
- source count
- active support
- new support
- persisting support
- no-longer-observed support
- centroid
- movement

Freshness policies are provider/measurement specific.

---

# E. Multi-source evidence fusion

Fusion is not merely a list.

At event level maintain:

- physical support
- report support
- contradictions
- ambiguity
- independence groups
- coverage gaps
- physical freshness
- current knowledge claim

No universal probability until calibrated.
