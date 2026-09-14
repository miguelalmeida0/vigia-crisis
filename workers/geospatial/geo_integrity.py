#!/usr/bin/env python3
"""Fail-closed raster/coordinate binding proof for VIGIA.
Reads one JSON request from stdin and emits one JSON result to stdout.
"""
import hashlib
import json
import math
import sys
from safe_raster_asset import safe_raster_asset

try:
    import rasterio
    from pyproj import CRS, Transformer
except Exception as exc:
    print(json.dumps({"ok": False, "error": f"geospatial_runtime_unavailable:{exc}"}))
    raise SystemExit(0)


def emit(payload):
    print(json.dumps(payload, separators=(",", ":")))
    raise SystemExit(0)


def haversine_m(a, b):
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371008.8 * math.asin(min(1.0, math.sqrt(h)))


def wgs84_bounds(dataset, reverse):
    left, bottom, right, top = dataset.bounds
    corners = [(left, bottom), (right, bottom), (right, top), (left, top)]
    projected = [reverse.transform(x, y) for x, y in corners]
    lons, lats = [p[0] for p in projected], [p[1] for p in projected]
    return [min(lons), min(lats), max(lons), max(lats)], projected


def pixel_size_m(dataset, center_xy, reverse):
    transform = dataset.transform
    x, y = center_xy
    x2, y2 = x + transform.a, y + transform.e
    try:
        crs = CRS.from_user_input(dataset.crs)
        factor = float(crs.axis_info[0].unit_conversion_factor or 1.0) if crs.is_projected else None
    except Exception:
        factor = None
    if factor:
        return abs(transform.a) * factor, abs(transform.e) * factor
    p0 = reverse.transform(x, y)
    px = reverse.transform(x2, y)
    py = reverse.transform(x, y2)
    return haversine_m(p0, px), haversine_m(p0, py)


def main():
    try:
        request = json.load(sys.stdin)
    except Exception as exc:
        emit({"ok": False, "error": f"invalid_request:{exc}"})
    asset = request.get("asset")
    coordinate = request.get("coordinate")
    if not isinstance(asset, str) or not asset:
        emit({"ok": False, "error": "asset_required"})
    try:
        asset = safe_raster_asset(asset, request.get("assetBrokerOrigin"))
    except Exception as exc:
        emit({"ok": False, "error": f"raster_asset_rejected:{exc}"})
    if not isinstance(coordinate, list) or len(coordinate) != 2:
        emit({"ok": False, "error": "coordinate_required"})
    try:
        lon, lat = float(coordinate[0]), float(coordinate[1])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("coordinate_out_of_range")
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.tiff"):
            with rasterio.open(asset) as ds:
                if not ds.crs:
                    emit({"ok": False, "error": "raster_crs_missing"})
                if not ds.transform or ds.transform.is_identity:
                    emit({"ok": False, "error": "raster_geotransform_missing"})
                forward = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
                reverse = Transformer.from_crs(ds.crs, "EPSG:4326", always_xy=True)
                x, y = forward.transform(lon, lat)
                row, col = ds.index(x, y)
                inside = 0 <= row < ds.height and 0 <= col < ds.width
                if not inside:
                    bounds, corners = wgs84_bounds(ds, reverse)
                    emit({"ok": True, "pixelVerified": False, "reason": "selected_coordinate_outside_raster", "rasterBoundsWgs84": bounds, "cornersWgs84": corners})
                cx, cy = ds.xy(row, col, offset="center")
                center_wgs = reverse.transform(cx, cy)
                px_m, py_m = pixel_size_m(ds, (cx, cy), reverse)
                center_offset_m = haversine_m((lon, lat), center_wgs)
                denominator = max(0.001, math.hypot(px_m, py_m))
                center_offset_pixels = center_offset_m / denominator
                bounds, corners = wgs84_bounds(ds, reverse)
                proof = {
                    "crs": str(ds.crs), "width": ds.width, "height": ds.height,
                    "transform": [float(v) for v in tuple(ds.transform)[:6]],
                    "rasterBoundsWgs84": [round(v, 9) for v in bounds],
                    "cornersWgs84": [[round(a, 9), round(b, 9)] for a, b in corners],
                    "pixel": {"row": int(row), "col": int(col), "centerWgs84": [round(center_wgs[0], 9), round(center_wgs[1], 9)], "centerOffsetMeters": round(center_offset_m, 3), "centerOffsetPixels": round(center_offset_pixels, 5)},
                    "resolutionMeters": [round(px_m, 3), round(py_m, 3)],
                }
                fingerprint = hashlib.sha256(json.dumps(proof, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
                emit({"ok": True, "pixelVerified": center_offset_pixels <= 0.76, "reason": "pixel_round_trip_verified" if center_offset_pixels <= 0.76 else "pixel_round_trip_error", "fingerprint": fingerprint, **proof})
    except Exception as exc:
        emit({"ok": False, "error": f"raster_verification_failed:{type(exc).__name__}:{exc}"})


if __name__ == "__main__":
    main()
