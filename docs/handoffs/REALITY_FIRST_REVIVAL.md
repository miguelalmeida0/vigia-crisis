# Reality-first revival — implementation record

## Bounded trace (8 September 2026)

Baseline: `.tmp/reality-first/source-cache-before.json`, admitted API `detail-before.json` and `overview-before.json`, source hashes in `baseline-hashes.json`. Raw IPMA bytes were inspected in the existing acquisition archive, checksum `23351eff121cfde606bc69aa20b8ce9a9d33a777a3a489733022fd5536f8f64b`.

| Output | Provider → normalized → selected → API → view model → screen loss |
|---|---|
| Temperature | IPMA `temperatura`, hourly mean °C at 1.5 m; `time` → `observedAt`, Point → coordinate. Receipt clock and definition absent in normalizer. Nearest-station selection could choose an older sample. Physical metric discarded coordinates/distance, national extrema discarded location. Card showed provider instead of place. |
| Wind | `intensidadeVentoKM`, km/h at 10 m; averaging interval unspecified by provider. Fallback `idDireccVento` map shifted directions by one. Physical contract lost definition, raw field and receipt time. Direction shown separately from speed. |
| Gust | No gust field in the documented surface feed. Domain returned null, compact national projection discarded it, UI substituted generic Unavailable. No protection against a daily-maximum gust being treated as a current gust. |
| Humidity | `humidade`, hourly mean % at 1.5 m. Same clock/location losses as temperature. A regional station could read as incident conditions. |
| Thermal | FIRMS preserves sensor, original sensing time, receipt, pixel dimensions and FRP. Physical projection discarded detections after deriving metrics; only associated graph/scene records selected. Age reflected a real old pass, even though transport was healthy. Missing recent results became null without distinguishing a successful empty search. |
| Warning | IPMA `startTime`/`endTime` are validity bounds, not issuance. Acquisition metadata selected expiry as a source timestamp, potentially in the future. No receipt clock. National records have area IDs, but no admitted geometry-to-incident association. Do not invent one. |
| Road | No connected closure/status feed in world snapshot. OSM/context road geometry has no status authority. Physical helper could substitute retrieval time for observation time. Generic Unavailable hid the capability gap. No N17 closure is evidenced. |
| Activity | Primary route activity came from incident record/projection updates. It could describe computation instead of a physical or operational event. Physical changes had no explicit materiality policy and discarded spatial context. |

Definition source: [IPMA open-data documentation](https://api.ipma.pt/). Observation and acquisition clocks remain separate. Existing source expiry policies are reused; distance association is not proof of local representativeness.

## Composition specification

The operator's question is the title and the fact is the first readable line. Keep the current shell, panorama, Signal Card anatomy, connected panels, maps and governed actions. The requested hierarchy is the design specification for this pass.

- Overview: national counts in the existing situation copy; six Signal Cards retain meaningful named station extrema and official warning/risk context. Never combine these into local conditions. Physical changes replace computation alerts.
- Detail: one station and observation period across the six existing condition slots (temperature, wind, gust, humidity, rain, AQ). A station/distance/age sentence sits beside the strip title. In the existing map-side rail, compact rows answer fire signal, what changed, official status/warnings, access and next attention. The existing lower panels hold exposure and detailed history.
- Intelligence: conditions first; the existing brief and question panel explain known, unknown, conflicts and next collection. Evidence stays in its current deeper workspace.
- Operations: task inspector includes its incident's conditions and access limitation before existing ownership/action controls.
- National: existing map workspace first, national signals second. Geographic extremes name their station.
- Activity: retain the current feed/timeline composition; use typed physical/operational events, location, source and observation time. Internal activity remains available through audit inspection.
- Trust: a real drawer, opened from each fact, shows all clocks, location, distance, definition, transformation, provenance and limitations. No new shell or extra top-level card stack.

## Verification

Implementation results, source gaps, test evidence and final screenshots are recorded in REALITY_FIRST_FINAL_REPORT.md and reality-first-status.json. The source-to-screen trace remains limited to the eight requested values.
