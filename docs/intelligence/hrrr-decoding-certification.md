# HRRR decoding certification

The certified path uses Rasterio 1.4.3 backed by GDAL's GRIB driver. It is not a custom GRIB decoder.

Retained and decoded variables are 2 m temperature, 2 m relative humidity, 10 m U wind, 10 m V wind, and accumulated precipitation. Gust is explicitly unavailable because the bounded retained run did not include a gust message.

The decoder verifies the Bronze containment path, file size, exact SHA-256, GRIB driver, one-band structure, CRS, bounded dimensions, expected GRIB element and units, reference time, valid time, and forecast step. It recognizes masks, rejects non-finite values, fails an all-missing window, clips only valid intersections, and returns `HRRR_OUT_OF_COVERAGE` for disjoint queries.

Native GDAL units are retained alongside normalized units. GDAL exposes temperature as `[C]`, humidity as `[%]`, wind as `[m/s]`, and precipitation as `[kg/(m^2)]`; precipitation is numerically equivalent to millimetres of water. APCP retains its GRIB interval tag separately from the effective `validTime-referenceTime` forecast step.

The incident-local slice retains the native Lambert Conformal CRS, transform, full-grid dimensions, native and incident bounds, resampling method, output shape, missing count, statistics, values, message index, raw source hash, decoder version, issue/run identity, valid time, and deterministic center wind vector.

Certified retained runs:

- Dragon Bravo, `HRRR:20250707:21`, +1 h, five variables, zero missing incident-window cells.
- Kaiser Canyon, bounded 2026 HRRR issue run, +1 h, five variables, zero missing incident-window cells.
