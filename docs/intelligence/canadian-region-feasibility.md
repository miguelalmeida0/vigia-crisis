# Canadian Second-Region Feasibility

## Decision

Canada remains `PARTNER_REQUIRED` for historical qualification and is the preferred next second-region path. It is not counted as a qualified forecast region. A separate prospective lane is now `CONDITIONALLY_QUALIFIED_SHADOW_ONLY`: the official CWFIS WFS exposes current Fire M3 perimeter estimates and current national active-fire records, but capture may start only after an authorized VIGIA representative records acceptance of the applicable CWFIS end-user conditions.

Official national sources establish useful ingredients: CWFIS publishes current active-fire and perimeter-estimate products; the CNFDB contains agency-contributed historical fire points and polygons; ECCC documents operational numerical-weather products; and NRCan publishes versioned fuel products. Those ingredients do not prove an archived issue-time perimeter revision sequence with provider publication chronology. A final historical polygon is not progression, and a currently refreshed feed is not retrospective knowledge-time history.

Evidence references used by the adjudicator:

- CWFIS National Fire Database: `https://cwfis.cfs.nrcan.gc.ca/ha/nfdb`
- CWFIS data placemat: `https://cwfis.cfs.nrcan.gc.ca/downloads/docs/en/references/cwfif/cwfis-data-placemat.pdf`
- CNFDB documentation and end-user conditions: `https://cwfis.cfs.nrcan.gc.ca/downloads/nfdb/fire_poly/current_version/NFDB_documentation_EN.pdf`
- ECCC HRDPS data documentation: `https://eccc-msc.github.io/open-data/msc-data/nwp_hrdps/readme_hrdps-datamart_en/`
- NRCan 2026 national FBP fuel layer: `https://open.canada.ca/data/en/dataset/851e6a27-a250-41e6-9cd0-d7ff96455dd6`
- CWFIS current data-service placemat and WFS layers: `https://cwfis.cfs.nrcan.gc.ca/downloads/docs/en/references/cwfif/cwfis-data-placemat.pdf`
- Fire M3 metadata, Open Government Licence statement, attribution, and end-user-condition notice: `https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/fireM3_hotspots_metadata_NAP_ISO_19115_2003_EN.pdf`
- Open Government Licence — Canada: `https://open.canada.ca/en/open-government-licence-canada`

## Prospective shadow-capture implementation

`CwfisProspectiveProvider` is a bounded, allowlisted WFS adapter for `public:m3_polygons_current` and `public:cwfif_national_activefires`. It requires an explicit rights-approval record, HTTPS, approved hosts, a maximum of 1,000 features, and a geographic window no larger than 25° by 25°. Raw responses are preserved through the existing Raw Vault before any prospective snapshot is written.

The adapter deliberately records CWFIS `timeStamp` as a service-response version, not as provider publication time. Fire M3 `firstdate` and `lastdate` remain detection chronology. `providerPublishedAt` stays null because the public product does not expose that semantic. Current incident association is only a spatial candidate derived from an active-fire point inside the estimated-perimeter bounding box; it is never promoted to an authoritative crosswalk without a stable identifier supplied by the source.

The capture manifest is `INCIDENT_WATCH`, defaults to a 15-minute cadence, remains shadow-only, and cannot be created until licence acceptance is recorded. No uncontrolled scheduler or consequential action is enabled. This creates future receipt-time history; it does not convert the feed into historical issue-time ground truth.

## Missing evidence

Historical qualification still requires either a partner archive containing operational perimeter snapshots plus publication times and written reuse rights, or a governed prospective shadow-capture history accumulated long enough for adjudication. Future-label doctrine, historical weather availability for selected issues, negative-opportunity doctrine and cross-provider knowledge-time semantics must then be certified. Until that happens, Canada contributes a feasibility and future-history lane, not Gold examples or a second-region promotion claim.

Portugal remains `FINAL_ONLY`: official incident identity, physical observations and prepared partner access exist, but operational perimeter revisions, publication times and label semantics are externally missing. Canada ranks above it because official current perimeter infrastructure, weather documentation and national fuel products make prospective shadow capture materially more feasible, while both still require external coordination.
