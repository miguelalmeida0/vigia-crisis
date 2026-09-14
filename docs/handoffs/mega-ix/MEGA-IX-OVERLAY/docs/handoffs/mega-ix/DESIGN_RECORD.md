# Mega IX design record

Recorded 14 September 2026 from source. This is a surface implementation record, not a replacement design system. Root `DESIGN.md` remains authoritative; `PRODUCT.md` and `docs/handoffs/mega-ix/DESIGN_AND_ACCEPTANCE.md` govern product meaning and the authorized composition. No shared tokens, design sidecar or global design contract were changed by this documentation task.

## Overview

Mission command answers which watched objective changed, which named place or service is affected, and how to contact the incident team. It occupies the existing map-adjacent command area on Command Overview, Incident Detail and Response & Access. It does not add a primary navigation route. Overview retains its priority incident list in a disclosure; Detail and Response retain Operational support and map tools in a disclosure.

The home composition contains Important now, up to five active Watching rows, field actions and three Recent entries. Important now shows up to two received reports associated with watched missions, with named consequences, observer, observation time and confirmation state. Earlier missions and team preparation remain deeper in a disclosure. This is the implemented anatomy, not a rendered judgment that its density or first viewport passes acceptance.

Selecting an objective replaces the same area with its objective, end time, state, reason, current stored route, alternative, relevant reports and next actions. Comparison, report, confirmation, conversation, people and timeline views use progressive navigation within that area. The route summary retains direction, calculation time and the limitation that a calculation cannot establish safe access. An alternative remains explicitly unconfirmed.

## Colors

The mission and offline styles reuse canonical `--vg-*` colors from `apps/operator-console/styles/approved/tokens.css`: navy text, muted supporting text, near-white canvas, white surface, hairline separators, blue information and feedback, green good state, amber watch/exercise state and red problem state or primary action. Unknown and other unmapped categorical states retain the neutral treatment. Controlled field tests carry a conspicuous amber label and explicit separation from operational history.

No new palette or tonal scale is established here. The standalone retained-map renderer uses literal equivalents of the shared canvas, blue and white colors. Retained named places now use informational blue following the source review correction; their mapped presence does not establish fire or critical state.

## Typography

The mission area inherits the shared Arial/Helvetica sans-serif body. Section, subsection, metadata and route metric sizes reference the existing tokens; ordinary names and actions use the existing 14px role. Route minutes use tabular figures. Metadata remains 12px and carries observation, receipt, calculation or last-check context rather than technical decoration. The local workspace page title now references the shared page-size token following the source review correction.

## Layout

The mission container is a single framed area with 16px padding. Its internal hierarchy uses connected rows, hairlines, restrained headings and wrapped actions. Recent and timeline rows use a timestamp column and flexible text column on desktop, collapsing to one column at 760px. Coordinates collapse from two columns to one at the same breakpoint. Buttons and text inputs/selects receive a 44px mobile minimum. Chat has a scrollable maximum height of 430px, reduced to 360px at 1200px; this is an explicit conversation viewport rather than proof of usable overflow.

The standalone offline workspace uses a map and team area in a `minmax` grid, with 24px gaps and padding. It stacks at 1200px and adopts 16px gutters at 760px. The retained map has a 480px desktop height and 320px stacked height. The header wraps on small screens. These declarations require real viewport verification; they do not establish successful 320px reflow, zoom behavior or touch operation.

## Elevation & Depth

The new styles introduce no shadow, glass, gradient or animated elevation. White surfaces, muted canvas and hairlines distinguish the container and rows. Content changes in place; these files introduce no additional motion vocabulary.

## Shapes

The mission container reuses the existing surface radius and control radius. Watching rows have square edges and transparent backgrounds with a canvas hover state. Forms use shared hairline inputs, native labels, vertical textarea resizing and restrained fieldsets. State labels use the existing compact categorical treatment. None of these choices establishes a new global component family.

## Components

- **Watched objective:** named place/service, reason and labelled state form the compact row. The selected view exposes stored routes, limitations, observation links, history disclosure, watcher control and management actions.
- **Field report:** named location and observation lead, followed by separate observed/received clocks and human confirmation. Photos and voice notes remain attached observations. Exact coordinates and accuracy sit in disclosure. Reports explicitly remain separate from official restrictions.
- **Team conversation:** messages show sender, time and delivery state. Recipient acknowledgements and delivery details remain distinct from central sync or relay transit. Outgoing rows distinguish waiting, sent-from-device, expired and rejected states.
- **People:** local connection, status, last-seen time and voluntarily entered location remain separate facts. The form states that disabling sharing removes the previous shared location.
- **Drafts and focus:** source preserves draft field values and bounded attachments by account, incident, team and view. The offline passphrase form is excluded from draft persistence. Mission controls receive a 2px blue focus outline with 3px offset. Navigation focuses a heading in the regular section path; repaint attempts to restore field/action focus. Browser behavior is unverified.
- **Offline preparation and unlock:** preparation is reached through Team and earlier missions. A trusted-device form requests a separate offline passphrase of at least 12 characters, prepares the protected package and registers the offline shell. The standalone workspace starts with an unlock form, an empty retained-location list and a locked-map caption. Successful unlock renders dated stored routes and named places plus the team area. Incorrect passphrase or missing package produces inline status feedback. The map caption explicitly says basemap imagery is not cached. A lock event removes the map and clears retained locations. This is observed source behavior, not browser reload, security or offline-operation certification.

The standalone locked host now receives `.mission-command`, reusing the existing form layout, field sizing and local focus rules. After unlock, the host removes that class before rendering the nested MissionSlot, avoiding a duplicated mission container. Source reinspection confirmed this correction together with the page-title token and blue retained-place markers. These resolve the three specific source-level drift findings from this documentation pass; rendered fit and behavior remain unverified.

## Do's and Don'ts

- Do preserve the six-route shell and the incumbent map/rail hierarchy; this record grants no permission for new top-level sections or navigation.
- Do keep source times, route direction, missing-route states, field-observation status and delivery limitations visible at the relevant decision point.
- Do compare the three affected route compositions and offline locked/unlocked states at desktop and responsive sizes. Preserve the required full six-route canonical capture and reference comparison obligations.
- Don't treat stored geometry, two-person confirmation, local connectivity or a calculated alternative as official authority, current availability or safe passage.
- Don't introduce standalone offline styling or geographic semantics when the shared form, typography and informational marker roles already apply.

Acceptance disposition remains **RECAPTURE** because screenshots are absent. The reviewer disposition preceded subsequent source fixes; those fixes do not convert it into a ship verdict. Saved browser permission rejected local-console access, and no alternate browser, indirect capture or screenshot workaround was attempted for this record. Canonical screenshots, reference/runtime overlays and differences, keyboard traversal, computed-style checks and rendered responsive acceptance remain **NOT RUN**. This task performed source inspection only and made no visual certification or release claim.

Source basis: `PRODUCT.md`; root `DESIGN.md`; `.agents/skills/impeccable/reference/document.md`; `docs/handoffs/mega-ix/DESIGN_AND_ACCEPTANCE.md`; the approved mission-command UI and its three route mounts; approved mission-command, offline-team and token styles; `offline-team.html`; `src/offline-team.js`; and `src/field-team-store.js` in `apps/operator-console`.
