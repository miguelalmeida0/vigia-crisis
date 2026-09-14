#!/usr/bin/env python3
"""Bounded HRRR GRIB2 window decoder using GDAL's mature Rasterio driver."""
import argparse
import hashlib
import json
import math
import os
import sys

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError
from rasterio.warp import transform_bounds
from rasterio.windows import Window, from_bounds

MAX_MESSAGE_BYTES = 12 * 1024 * 1024
MAX_GRID_SIDE = 64
VARIABLES = {
    "temperature_2m": {"elements": {"TMP"}, "native": {"[K]", "K", "[C]", "C", "degC"}, "normalized": "degC"},
    "relative_humidity_2m": {"elements": {"RH"}, "native": {"[%]", "%"}, "normalized": "%"},
    "wind_u_10m": {"elements": {"UGRD"}, "native": {"[m/s]", "m/s", "m s-1"}, "normalized": "m/s"},
    "wind_v_10m": {"elements": {"VGRD"}, "native": {"[m/s]", "m/s", "m s-1"}, "normalized": "m/s"},
    "precipitation": {"elements": {"APCP", "APCP01"}, "native": {"[kg/(m^2)]", "kg/(m^2)", "kg m-2", "[mm]", "mm"}, "normalized": "mm"},
}


def fail(code, detail=None):
    payload = {"ok": False, "error": code}
    if detail:
        payload["detail"] = str(detail)[:300]
    print(json.dumps(payload, sort_keys=True))
    raise SystemExit(1)


def finite(value, code):
    try:
        result = float(value)
    except (TypeError, ValueError):
        fail(code)
    if not math.isfinite(result):
        fail(code)
    return result


def normalize(values, variable, native_units):
    if variable == "temperature_2m" and native_units in {"[K]", "K"}:
        return values - 273.15
    return values


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def bounded_window(dataset, bbox):
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        fail("HRRR_BBOX_INVALID")
    try:
        native = transform_bounds("EPSG:4326", dataset.crs, west, south, east, north, densify_pts=21)
    except Exception as error:
        fail("HRRR_PROJECTION_TRANSFORM_FAILED", error)
    if native[2] < dataset.bounds.left or native[0] > dataset.bounds.right or native[3] < dataset.bounds.bottom or native[1] > dataset.bounds.top:
        fail("HRRR_OUT_OF_COVERAGE")
    clipped = (max(native[0], dataset.bounds.left), max(native[1], dataset.bounds.bottom), min(native[2], dataset.bounds.right), min(native[3], dataset.bounds.top))
    if clipped[0] >= clipped[2] or clipped[1] >= clipped[3]:
        fail("HRRR_OUT_OF_COVERAGE")
    raw = from_bounds(*clipped, transform=dataset.transform)
    col_off = max(0, math.floor(raw.col_off)); row_off = max(0, math.floor(raw.row_off))
    width = min(dataset.width - col_off, max(1, math.ceil(raw.width)))
    height = min(dataset.height - row_off, max(1, math.ceil(raw.height)))
    return Window(col_off, row_off, width, height), clipped


def decode_field(field, bbox, side):
    path = field.get("path", "")
    if not os.path.isfile(path):
        fail("HRRR_MESSAGE_NOT_FOUND")
    size = os.path.getsize(path)
    if size < 16 or size > MAX_MESSAGE_BYTES:
        fail("HRRR_MESSAGE_SIZE_INVALID")
    if sha256_file(path) != field.get("sha256"):
        fail("HRRR_SOURCE_HASH_MISMATCH")
    variable = field.get("variable")
    if variable not in VARIABLES:
        fail("HRRR_VARIABLE_UNSUPPORTED")
    try:
        dataset = rasterio.open(path)
    except RasterioIOError as error:
        fail("HRRR_GRIB_OPEN_FAILED", error)
    with dataset:
        if dataset.driver != "GRIB" or dataset.count != 1 or not dataset.crs or dataset.width > 5000 or dataset.height > 5000:
            fail("HRRR_GRIB_STRUCTURE_INVALID")
        tags = dataset.tags(1)
        expected = VARIABLES[variable]
        element = tags.get("GRIB_ELEMENT")
        native_units = tags.get("GRIB_UNIT") or field.get("nativeUnits")
        if element not in expected["elements"]:
            fail("HRRR_ELEMENT_MISMATCH", f"{variable}:{element}")
        if native_units not in expected["native"]:
            fail("HRRR_UNIT_UNRECOGNIZED", native_units)
        window, native_bounds = bounded_window(dataset, bbox)
        out_height = min(side, max(1, int(window.height)))
        out_width = min(side, max(1, int(window.width)))
        data = dataset.read(1, window=window, out_shape=(out_height, out_width), masked=True, resampling=Resampling.bilinear)
        mask = np.ma.getmaskarray(data) | ~np.isfinite(np.ma.getdata(data))
        values = np.ma.array(np.ma.getdata(data).astype(np.float64), mask=mask)
        missing = int(np.count_nonzero(mask))
        if missing == values.size:
            fail("HRRR_WINDOW_ALL_MISSING")
        normalized = normalize(values, variable, native_units)
        if not np.all(np.isfinite(normalized.compressed())):
            fail("HRRR_NON_FINITE_VALUE")
        flat = [None if mask.flat[index] else round(float(normalized.data.flat[index]), 6) for index in range(values.size)]
        valid = normalized.compressed()
        ref = int(tags.get("GRIB_REF_TIME", "0")); valid_time = int(tags.get("GRIB_VALID_TIME", "0")); step = int(tags.get("GRIB_FORECAST_SECONDS", "-1"))
        effective_step = valid_time - ref
        step_valid = step == effective_step or variable == "precipitation" and step in {0, effective_step}
        if ref <= 0 or valid_time <= 0 or step < 0 or effective_step < 0 or not step_valid:
            fail("HRRR_FORECAST_CLOCK_INVALID", f"{variable}:{ref}:{valid_time}:{step}")
        center = normalized[out_height // 2, out_width // 2]
        return {
            "variable": variable, "element": element, "nativeUnits": native_units,
            "normalizedUnits": expected["normalized"], "messageIndex": field.get("messageIndex"),
            "sourceHash": field.get("sha256"), "forecastReferenceEpoch": ref,
            "validTimeEpoch": valid_time, "forecastStepSeconds": effective_step, "gribForecastSeconds": step,
            "grid": {"driver": dataset.driver, "crs": dataset.crs.to_string(), "width": dataset.width,
                     "height": dataset.height, "transform": list(dataset.transform)[:6], "nativeBounds": list(dataset.bounds)},
            "slice": {"shape": [out_height, out_width], "nativeBounds": list(native_bounds), "values": flat,
                      "missingValues": missing, "minimum": round(float(valid.min()), 6),
                      "maximum": round(float(valid.max()), 6), "mean": round(float(valid.mean()), 6),
                      "centerValue": None if np.ma.is_masked(center) else round(float(center), 6)},
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request-json", required=True)
    args = parser.parse_args()
    try:
        request = json.loads(args.request_json)
    except json.JSONDecodeError:
        fail("HRRR_REQUEST_INVALID")
    fields = request.get("fields")
    bbox = [finite(value, "HRRR_BBOX_INVALID") for value in request.get("bbox", [])]
    side = int(request.get("gridSide", 32))
    if not isinstance(fields, list) or not fields or len(bbox) != 4 or side < 1 or side > MAX_GRID_SIDE:
        fail("HRRR_REQUEST_INVALID")
    decoded = [decode_field(field, bbox, side) for field in fields]
    variables = {field["variable"] for field in decoded}
    if {"wind_u_10m", "wind_v_10m"}.issubset(variables):
        u = next(field for field in decoded if field["variable"] == "wind_u_10m")["slice"]["centerValue"]
        v = next(field for field in decoded if field["variable"] == "wind_v_10m")["slice"]["centerValue"]
        wind = None if u is None or v is None else {"speedMps": round(math.hypot(u, v), 6), "directionFromDegrees": round((270 - math.degrees(math.atan2(v, u))) % 360, 6)}
    else:
        wind = None
    print(json.dumps({"ok": True, "decoder": "rasterio-gdal-grib", "decoderVersion": rasterio.__version__, "fields": decoded, "centerWind": wind}, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
