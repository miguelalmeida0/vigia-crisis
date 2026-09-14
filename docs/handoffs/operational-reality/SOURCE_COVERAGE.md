# Operational Reality: source coverage

Checked 14 September 2026. Status describes the implemented capability, not a guarantee that every location has a fresh observation. Currentness, source availability, measurement age and verification remain separate.

| Human question / field | Status | Source and implemented meaning | Remaining boundary |
| --- | --- | --- | --- |
| Temperature | CONNECTED | IPMA station observation, °C, station name/location, observed and received clocks, distance | Regional station context; not an incident-site measurement |
| Wind and direction | CONNECTED | IPMA observed wind speed/direction, same-station history | No inferred gust or local fire spread |
| Humidity | CONNECTED | IPMA relative humidity; valid zero retained | Missing sentinel values omitted |
| Rain | CONNECTED | IPMA published precipitation interval; valid zero retained | Not a forecast or accumulated fire-area total |
| Gust | NOT IMPLEMENTED | No verified current observed-gust field in the published IPMA station schema | AROME offers forecast gust; daily maxima and forecasts are not substituted |
| Fire danger | PARTIAL | Existing IPMA municipal forecast category and validity | Forecast danger is not observed incident severity; exact municipality coverage required |
| Thermal signal / FRP | CONNECTED | NASA FIRMS native VIIRS SNPP/NOAA-20/NOAA-21 and MODIS; product, observed time, location, FRP, native quality, distance and counts | Satellite sampling is incomplete. Thermal pixels are not official fire boundaries |
| Independent Sentinel-3 observations | PARTIAL | Existing CDSE STAC / SLSTR FRP acquisition and parsing remain integrated | Configured credentials returned `cdse_auth_http_401`; no fabricated Sentinel-3 observations |
| Applicable official warning | CONNECTED | IPMA affected district/area or provided polygon, effective and expiry time, issuer, type, applicability basis | Unknown geography or failed/stale source means unknown applicability, not zero |
| Public incident reports | PARTIAL | ANEPC-derived PTData reports retain source observation dates and raw-product lineage in Event Fabric | REPORT evidence is not an independent official authority admission; feed refresh is not a new incident observation |
| ANEPC / CAP authority | CREDENTIAL REQUIRED | Existing governed CAP adapter remains available for a configured legitimate authority feed | No current authorized CAP feed was established here |
| Air quality: PM2.5, PM10, O3 | PARTIAL | APA publishes a QualAr structured ArcGIS layer and category fields | Current-data query timed out; current measurement/averaging semantics could not be verified. No new AQ adapter or invented category |
| Road restriction / closure | PARTIAL | Existing Infraestruturas de Portugal published occurrences adapter, three ArcGIS layers, geometry, direction, restriction and clocks | Published IP occurrences only; neither complete nationwide coverage nor proof that other roads are open |
| Official incident geometry | PARTIAL | Existing dated/admitted geometry path and historical ICNF burned-area services | Verified ICNF service contains annual burned areas through 2025; it is not a live incident perimeter feed |
| Facility / settlement / road location | CONNECTED | 151,277 checksum-verified OSM reference features; bounded nearest-category queries, names, coordinates, source, point/feature-centre distance | Snapshot geography, incomplete cohort and unknown operating status/capacity; no safety claim |
| Road-network estimate | PARTIAL | Existing OSRM facility-to-incident estimates and direction preserved | No live traffic or emergency-access guarantee; estimate can fail independently |

## Source references and access findings

- [NASA FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/): existing MAP_KEY configuration works. MODIS native confidence and VIIRS quality labels retain their source definitions. Transport copies do not add independent witnesses. Latest retained production observation inspected: 14 September, 05:40 UTC; its later download does not refresh that observation time.
- [IPMA Open Data](https://api.ipma.pt/): station observations and published warnings. The inspected station cohort contained 219 records with an explicit 09:00 UTC observation clock; later live incident checks returned the next hourly observation. `-99` is not a measurement. [IPMA forecasts](https://mf2.ipma.pt/downloads/) cannot supply a current observed gust.
- [IPMA warning feed](https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json): dated district notices. The full returned feed includes green, future and expired notices and must not be counted as active warnings. Live Ask correctly matched a Braga heat notice to the selected incident, expiring at 18:00 UTC.
- [Copernicus Data Space authentication](https://documentation.dataspace.copernicus.eu/APIs/Token.html): existing token endpoint `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`. Authentication is configured but rejected with HTTP 401 in the inspected production source clock. Required integration inputs remain a valid CDSE access token or valid username/password, product identity, sensing timestamps, coordinates, FRP and native quality flags. No additional model is needed.
- [APA QualAr layer](https://sniambgeoogc.apambiente.pt/getogc/rest/services/Visualizador/QAR/MapServer/0): published fields include station ID/name, `data`, pollutant abbreviation/unit, published index/name, `avg`, `avg_display`, `hora_display`, municipality and geometry. The data query failed with `UND_ERR_CONNECT_TIMEOUT` after 15 seconds. Metadata alone does not prove fresh observations or an averaging interval. The separate QualAr forecast layer is not used as observed air quality.
- [IP traffic map](https://servicos.infraestruturasdeportugal.pt/viajar-na-estrada/transito-em-tempo-real): existing service uses `https://utility.arcgis.com/usrsvcs/servers/98bffc4ef35b4e18a03641918c5d07dd/rest/services/webapps/viajar_na_estrada2024/MapServer`, layers 0–2. Refresh is five minutes, current-status validity ten minutes. Stale or failed status cannot imply a passable road.
- [ICNF burned-area service](https://sigservices.icnf.pt/server/rest/services/BDG/areas_ardidas/MapServer), [ICNF catalogue](https://geocatalogo.icnf.pt/catalogo.html): official historical annual geometry, preserved as historical. No verified current incident perimeter channel was found.

## Retention and clocks

Thermal current-display window: 90 minutes. Last-known thermal retention: 72 hours, always with observation age and source state; older observations remain in history. A failed source cannot produce a zero count/trend from an empty response. Positive retained counts are only returned observations, not complete coverage.

The configurable queue defaults are 24 hours current, 72 hours monitoring, 168 hours maximum stale review, and 336 hours historical. These are operational attention windows, not estimates of fire duration or extinguishment. Resolution requires supported official/operator state.

`observedAt`, `receivedAt`, provider-to-ingestion delay, ingestion-to-projection delay, ingestion-to-display delay and age-at-display are distinct. Screen-delay calculation is implemented, but actual rendered screen timing was not measured because browser access was denied.
