---
name: VIGIA operational console
description: Shared design contract for the six canonical product routes.
colors:
  ink: "#101d43"
  muted: "#50617b"
  canvas: "#f8faff"
  surface: "#ffffff"
  red: "#d51d32"
  red-soft: "#fff2f4"
  blue: "#175bb0"
  blue-soft: "#eef5fc"
  green: "#087d50"
  green-soft: "#ecfaf4"
  amber: "#965006"
  amber-soft: "#fff7e9"
  line: "#e6ebf3"
typography:
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
    lineHeight: 1.45
  page:
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
  section:
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
  metadata:
    fontSize: "12px"
    lineHeight: 1.5
rounded:
  surface: "6px"
  control: "4px"
spacing:
  unit: "4px"
  gutter: "24px"
  mobile-gutter: "16px"
---

# VIGIA product design contract

The canonical console at `apps/operator-console` is one light operational product. The full-product convergence brief supersedes older per-route compositions where they conflict. Preserve its brand, real geography, truthful observations and existing operator flows. Do not introduce a new visual pattern for information an established component can express.

## Hierarchy and containers

P1: what matters now and its action. P2: supporting decision context. P3: what changed or comes next. P4: history, provenance and technical detail. Maps, lists and contextual previews are necessary frames. Conditions, support points and status are visual groups; use rows and hairlines. Protected focus belongs in dialogs/drawers. Avoid nested frames, empty alert panels, decorative photography, gauges, gradient icon blocks and duplicated summary prose.

## Typography and spacing

Use `approved/tokens.css`: page 28px (24 mobile), section 20px, subsection 16px, body/control 14px, metadata 12px, metric 28px (22–24 mobile). Weights 400/600/700. Numeric values, dates and distances use tabular figures; prose remains sans-serif. Metadata must retain units, scope and time with sufficient contrast. No 9–11px operational labels.

Spacing scale: 4/8/12/16/24/32px. One 208px desktop navigation rail, 80px desktop header and 24px content origin; mobile drawer below 761px, 72px minimum header and 16px gutters. Break compound workspaces at 1200px before inspectors become cramped. Use flexible heights and `minmax(0,1fr)`; never fix a panel height to hide wrapping.

## Semantic color and icons

Navy is primary text; muted blue-gray is supporting text. Blue expresses weather, information and navigation; orange warns; green means connected/available/healthy; gray means earlier/inactive/context. Red expresses verified fire, critical/destructive state or restrained VIGIA selection. Temperature, rain, wind or a zero detection count alone never imply danger. Active public-feed membership does not equal verified-current fire. Use the same state color on every route.

Existing outline SVG icon family, 20px controls and 16–24px supporting symbols, consistent 1.8 stroke weight. No emoji, gradient icon tiles or decorative symbols. Geospatial markers use their own stable semantic geometry: solid verified current, amber candidate, outlined earlier/context. Facility category and availability remain separately labelled.

## Controls and badges

Controls: 40px desktop, 44px touch, 4px radius, 8×12px padding, 14px label, 8px icon gap. Secondary controls use a hairline; tertiary actions use readable blue text. Primary action uses accessible red with white text. Focus is a visible 2px blue outline with 3px offset; pressed/selected also changes fill. Disabled controls retain their disabled semantics. Badges are 12px categorical state labels, not repeated decoration.

## Measurements, tables and maps

Measurements show value, meaning, location and observation/calculation time. Omit unavailable prime metrics, preserve meaningful zero and expose limitations in existing disclosures. Station distance is shared context, not a duplicate tile. Actual-sample charts retain timestamps and intervals; dashed guides do not invent observations.

Tables/lists use 14px names, 12px dates/secondary metadata, aligned numerals and 12–16px row padding. Incidents sort current/candidate before earlier records and date each observation separately from nearby station weather. Mobile selection reveals the existing preview and preserves filters/list return.

MapLibre owns real scene rendering and route-specific camera/selection. Controls share zoom/focus/layers placement and touch sizing. Permanent popup cards do not obscure entry geography; marker selection opens the existing detail disclosure. Layer drawers keep supported layers available; response routes/facilities are opt-in on Detail/Fire and visible in Response. Small screens simplify overlays, not geographic truth.

## Drawers, responsiveness and states

Drawers have a sticky 20px title, close control, 16–24px content padding and readable prose/tables. Focus stays inside `role=dialog`; backdrop is outside tab order, background is inert, Escape and close restore the exact trigger, including nested support disclosures. Native responsive disclosures open on desktop and initially collapse on mobile, retaining user choice within the same width class.

| Route | Leading composition | Mobile treatment |
|---|---|---|
| Command Overview | Concise national situation, map and dated priority list | Priority link and map early; weather expands; source/work and history deeper |
| Incidents | Current-first dated list and larger selected map/preview | Search, collapsed filters, list/preview switch; select reveals preview immediately |
| Incident Detail | Status/date, measured conditions, map, fire/context and next action | Compact condition rows, map then context; retain Ask and Change incident |
| Fire Activity | Current readings, map and real trends | Small condition rows; trends precede disclosed raw event history |
| Response & Access | Shortest returned facility-to-incident estimate, map, comparison and support | One approach summary; map, approaches and nearest support; limitations/history follow |
| National Awareness | National state, map and ranked named areas | Leading-area action/map; secondary weather/filter disclosures; ranking follows map |

Partial failures preserve working information, dates and compact retry. Never imply a source refresh is a new measurement or a route estimate establishes safe access. Motion is restrained 140ms control feedback; reduced motion removes nonessential transition/animation.

## Acceptance

Review fresh rendered UI for every affected route plus a responsive viewport; full product passes cover 1728/1440/1024/768/430/390. Check solid-surface contrast, local clipping, map interactions, focus/trap/return, search and selection, Ask, facilities/route details, region selection, and degraded recovery. Golden fixture and canonical evidence answer different questions. A build alone does not establish visual or functional completion.
