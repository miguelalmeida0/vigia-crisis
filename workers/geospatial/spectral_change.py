#!/usr/bin/env python3
"""Server-side, uncalibrated Sentinel-2 spectral change screening.
Outputs geospatial candidate polygons; never emits a fire/hazard probability.
"""
import json
import math
import sys
from safe_raster_asset import secure_scene

try:
    import numpy as np
    import rasterio
    from pyproj import Transformer
    from rasterio.enums import Resampling
    from rasterio.transform import from_bounds
    from rasterio.vrt import WarpedVRT
    from rasterio.warp import transform_bounds
    from shapely.geometry import box, mapping
    from shapely.ops import transform as shapely_transform, unary_union
except Exception as exc:
    print(json.dumps({"state": "abstained", "reason": f"geospatial_runtime_unavailable:{exc}", "findings": []}))
    raise SystemExit(0)

ALGORITHM = "sentinel2_spectral_change_screen_v2"
CLOUD_CLASSES = {0, 1, 3, 8, 9, 10, 11}


def emit(payload):
    print(json.dumps(payload, separators=(",", ":")))
    raise SystemExit(0)


def target_grid(coordinate, radius_km, reference_asset):
    lon, lat = coordinate
    lat_delta = radius_km / 111.32
    lon_delta = radius_km / max(20.0, 111.32 * math.cos(math.radians(lat)))
    bbox_wgs = [lon - lon_delta, lat - lat_delta, lon + lon_delta, lat + lat_delta]
    with rasterio.open(reference_asset) as ds:
        if not ds.crs:
            raise ValueError("reference_crs_missing")
        west, south, east, north = transform_bounds("EPSG:4326", ds.crs, *bbox_wgs, densify_pts=21)
        width = height = 256
        return ds.crs, from_bounds(west, south, east, north, width, height), width, height, bbox_wgs


def read_band(asset, dst_crs, dst_transform, width, height, resampling=Resampling.bilinear):
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.tiff"):
        with rasterio.open(asset) as ds:
            if not ds.crs:
                raise ValueError("band_crs_missing")
            with WarpedVRT(ds, crs=dst_crs, transform=dst_transform, width=width, height=height,
                           resampling=resampling, src_nodata=ds.nodata, nodata=np.nan) as vrt:
                return vrt.read(1, masked=True).filled(np.nan).astype("float32")


def scene_arrays(scene, grid):
    crs, transform, width, height, _ = grid
    red = read_band(scene["red"], crs, transform, width, height)
    nir = read_band(scene["nir"], crs, transform, width, height)
    swir = read_band(scene["swir"], crs, transform, width, height)
    scl = read_band(scene["scl"], crs, transform, width, height, Resampling.nearest) if scene.get("scl") else np.full_like(red, 4)
    valid = np.isfinite(red) & np.isfinite(nir) & np.isfinite(swir) & np.isfinite(scl)
    valid &= ~np.isin(np.rint(scl).astype("int16"), list(CLOUD_CLASSES))
    ndvi = np.divide(nir - red, nir + red, out=np.full_like(red, np.nan), where=np.abs(nir + red) > 1e-6)
    ndmi = np.divide(nir - swir, nir + swir, out=np.full_like(red, np.nan), where=np.abs(nir + swir) > 1e-6)
    return ndvi, ndmi, valid


def components(mask, min_cells=6):
    h, w = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    groups = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or visited[y, x]:
                continue
            stack, group = [(y, x)], []
            visited[y, x] = True
            while stack:
                cy, cx = stack.pop(); group.append((cy, cx))
                for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True; stack.append((ny, nx))
            if len(group) >= min_cells:
                groups.append(group)
    return groups


def cell_polygon(row, col, transform):
    x1, y1 = transform * (col, row)
    x2, y2 = transform * (col + 1, row + 1)
    return box(min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))


def signal_strength(ndvi_delta, ndmi_delta):
    magnitude = max(abs(float(ndvi_delta)), abs(float(ndmi_delta)))
    return "strong" if magnitude >= 0.28 else "moderate" if magnitude >= 0.19 else "screening"


def main():
    try:
        request = json.load(sys.stdin)
        before = secure_scene(request["before"], request.get("assetBrokerOrigin"))
        after = secure_scene(request["after"], request.get("assetBrokerOrigin"))
        coordinate = [float(v) for v in request["coordinate"]]
        radius_km = max(0.5, min(20.0, float(request.get("radiusKm", 9))))
        required = ("red", "nir", "swir")
        if any(not scene.get(key) for scene in (before, after) for key in required):
            emit({"state": "abstained", "reason": "native_multispectral_bands_required", "findings": [], "calibrationState": "unvalidated_screening"})
        grid = target_grid(coordinate, radius_km, after["red"])
        b_ndvi, b_ndmi, b_valid = scene_arrays(before, grid)
        a_ndvi, a_ndmi, a_valid = scene_arrays(after, grid)
        valid = b_valid & a_valid & np.isfinite(b_ndvi) & np.isfinite(a_ndvi) & np.isfinite(b_ndmi) & np.isfinite(a_ndmi)
        valid_fraction = float(valid.mean())
        if valid_fraction < 0.60:
            emit({"state": "abstained", "reason": "insufficient_clear_registered_pixels", "validFraction": round(valid_fraction, 4), "findings": [], "calibrationState": "unvalidated_screening"})
        d_ndvi, d_ndmi = a_ndvi - b_ndvi, a_ndmi - b_ndmi
        vegetation_loss = valid & (d_ndvi <= -0.14)
        moisture_loss = valid & (d_ndmi <= -0.17)
        changed = vegetation_loss | moisture_loss
        crs, transform, width, height, bbox_wgs = grid
        to_wgs = Transformer.from_crs(crs, "EPSG:4326", always_xy=True).transform
        findings = []
        for group in components(changed):
            cells = unary_union([cell_polygon(row, col, transform) for row, col in group])
            geom = cells.simplify(max(abs(transform.a), abs(transform.e)) * 0.35, preserve_topology=True)
            rows, cols = zip(*group)
            values_ndvi = d_ndvi[list(rows), list(cols)]
            values_ndmi = d_ndmi[list(rows), list(cols)]
            ndvi_delta = float(np.nanmedian(values_ndvi)); ndmi_delta = float(np.nanmedian(values_ndmi))
            kind = "vegetation_and_moisture_loss_candidate" if np.nanmean(vegetation_loss[list(rows), list(cols)]) > .35 and np.nanmean(moisture_loss[list(rows), list(cols)]) > .35 else "vegetation_loss_candidate" if abs(ndvi_delta) >= abs(ndmi_delta) else "moisture_loss_candidate"
            findings.append({"kind": kind, "signalStrength": signal_strength(ndvi_delta, ndmi_delta), "areaM2": round(float(geom.area), 1), "ndviDelta": round(ndvi_delta, 4), "ndmiDelta": round(ndmi_delta, 4), "geometry": mapping(shapely_transform(to_wgs, geom))})
        findings.sort(key=lambda item: item["areaM2"], reverse=True)
        emit({"state": "screened", "method": ALGORITHM, "calibrationState": "unvalidated_screening", "operational": False, "confirmsHazard": False, "validFraction": round(valid_fraction, 4), "changedFraction": round(float(changed.sum() / max(1, valid.sum())), 4), "viewportBbox": [round(v, 8) for v in bbox_wgs], "findings": findings[:30], "provenance": {"beforeSceneId": before.get("id"), "afterSceneId": after.get("id"), "beforeAcquiredAt": before.get("acquiredAt"), "afterAcquiredAt": after.get("acquiredAt"), "algorithmVersion": ALGORITHM, "bands": ["red", "nir", "swir16", "scl"], "thresholds": {"ndviLoss": -0.14, "ndmiLoss": -0.17}, "calibrated": False}})
    except Exception as exc:
        emit({"state": "abstained", "reason": f"analysis_failed:{type(exc).__name__}:{exc}", "findings": [], "calibrationState": "unvalidated_screening"})


if __name__ == "__main__":
    main()
