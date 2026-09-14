# Real Source Acquisition Plan

The implementation agent must verify current provider access against official documentation before changing production integrations.

This plan describes roles, not hard-coded endpoints.

---

# Active-fire sensing

## NASA FIRMS / VIIRS

Role:
fine thermal active-fire evidence.

Need:
- live key/config where required
- country/AOI polling
- raw archive
- checkpoint
- canonical normalization
- source health

If key unavailable:
do not stop sprint.

Use real historical FIRMS archive for validation/replay.

## Sentinel-3 SLSTR FRP

Role:
independent thermal/FRP family.

Need:
- provider acquisition
- archive
- existing parser reuse
- canonical observation
- quality flags

Credential blocker should be explicit.

## MTG / FCI structured fire products

Role:
high-cadence geostationary thermal/fire context where appropriate.

Distinguish:
- raster visualization context
- structured physical/fire product

Raster context must never count as point/event evidence unless the scientific product supports it.

---

# EO prevention

## Sentinel-2 L2A

Role:
multispectral landscape/fuel condition.

Need:
- catalogue discovery
- native scientific pixels
- all consumed bands
- SCL
- comparable scene selection
- integrity proof

## Sentinel-1

Role:
radar/all-weather supporting evidence.

Do not pretend radar equals optical.

Use only where a validated detector/question needs it.

---

# Portuguese operational context

## Public incident feed

Role:
official/public report evidence.

Not physical truth.

## Response resources

Research authoritative machine-readable sources.

Desired:
- personnel
- vehicles
- aircraft
- official state changes
- burned area

If no reliable provider:
keep unavailable.

## Weather/fire danger

Use attributable source already available through project where sound.

Preserve:
- observation timestamp
- station/location
- source
- null semantics

---

# Acquisition resilience

Every provider needs:

- source ID
- checkpoint
- last attempt
- last success
- failure count
- next retry
- state
- latest source observation

Provider failures must not blank unrelated product surfaces.

---

# Raw archive

For every acquired product:

- provider
- product/source identity
- retrievedAt
- source time
- checksum
- immutable content reference
- licensing/use metadata
- acquisition run
- parser version

Malformed products:
quarantine when useful/safe.

No secret material in archive metadata.
