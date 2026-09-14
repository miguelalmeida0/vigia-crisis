# Forecast corpus threat model

## Protected assets

- immutable provider bytes and hashes;
- acquisition manifests, cursors, and run state;
- issue-time and label-time clocks;
- incident associations and split assignments;
- provider credentials and licence terms;
- Gold eligibility and replay fingerprints.

## Trust boundaries

Provider networks and archives are untrusted inputs. Bronze is immutable evidence,
not trusted canonical data. Parsers and QA form the Bronze-to-Silver boundary.
Knowledge-time, lineage, rights, split, and leakage gates form the Silver-to-Gold
boundary. Dataset export is a separate rights boundary.

## Threats and controls

| Threat | Control |
| --- | --- |
| SSRF or DNS/redirect abuse | HTTPS endpoint construction plus exact host allowlists and the existing trusted-fetch boundary |
| Credential theft by URL or redirect | secret values are redacted; secret-bearing request identities are rejected before Bronze |
| Oversized response/archive bomb | per-response, manifest byte, object, runtime, and local-storage ceilings |
| Path traversal/ZIP slip | no archive extraction in this vertical; content-addressed vault paths and resolved-path checks |
| Malformed GeoJSON | strict feature collection shape, record ceiling, coordinate/CRS/closure/topology/range QA |
| Malformed GRIB | exact `.idx` selection, bounded byte ranges, GRIB magic validation, no Gold use before decode/missing-value QA |
| Malformed/oversized raster | bounded 128x128 export, response ceiling, TIFF byte-order/magic validation, layer completeness checks |
| Hostile XML | no XML parser is used by the acquisition path |
| Provider schema substitution | content type, shape/magic, provider identity, parser version, and product checksum checks |
| Checksum mismatch/upstream mutation | content-addressed SHA-256 plus provider-product checksum conflict rejection |
| Cursor corruption or premature advance | fingerprinted plan path, durable Bronze first, Silver write before ingestion mark, completed-run idempotence |
| Manifest or licence tampering | semantic manifest fingerprint verification and registered terms/attribution assessment |
| Query injection | incident IDs are allowlisted by grammar before a network request |
| Future-information injection | availability-time filtering, explicit run type, retrospective-feature bans, and automated leakage audit |
| Split contamination | incident, upstream observation, physical pixel, republication, anomaly-site, and geometry-group isolation |

## Availability and rate limits

Provider errors use bounded exponential backoff. Permanent HTTP client failures are
not retried except timeout/rate-limit status. Acquisition can never exceed the
manifest retry/runtime ceiling. A failed provider does not create a negative label.

## Residual risks

- WFIGS Daily Perimeters preserves upstream mistakes and is not an official fire
  progression.
- HRRR GRIB messages are preserved but not decoded in the pilot.
- TIFF magic and metadata checks do not certify scientific raster values.
- The LANDFIRE elevation vertical datum is not yet certified for solver use.
- Shapefile, netCDF, ZIP, and XML ingestion are not enabled here; enabling them
  requires dedicated hardened parsers and fuzz corpora.
- External provider terms can change and require periodic rights review.

These residual risks fail or constrain Gold use; they are not converted into
confidence scores.
