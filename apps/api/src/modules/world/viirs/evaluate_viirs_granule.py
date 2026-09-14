#!/usr/bin/env python3
"""Extract product-level VIIRS opportunity evidence at governed reference points."""
import json
import math
import sys

try:
    import resource
    _memory_limit = 1024 * 1024 * 1024
    _soft, _hard = resource.getrlimit(resource.RLIMIT_AS)
    _effective = min(_memory_limit, _hard) if _hard not in (-1, resource.RLIM_INFINITY) else _memory_limit
    if _soft in (-1, resource.RLIM_INFINITY) or _soft > _effective:
        resource.setrlimit(resource.RLIMIT_AS, (_effective, _hard))
except Exception:
    pass

try:
    import h5py
    import numpy as np
except Exception as exc:
    print(json.dumps({"ok": False, "error": f"h5py_numpy_required:{exc}"}))
    raise SystemExit(1)

MASK_LABELS = {
    0: "not_processed", 1: "bowtie", 2: "glint", 3: "water", 4: "cloud",
    5: "clear_land", 6: "unclassified", 7: "low_confidence_fire",
    8: "nominal_confidence_fire", 9: "high_confidence_fire",
}
MAX_CASES = 1000
MAX_GRID_ELEMENTS = 50_000_000
MAX_FIRE_PIXELS = 500_000


def scalar(value):
    array = np.asarray(value).reshape(-1)
    if not len(array):
        return None
    item = array[0]
    if isinstance(item, bytes):
        return item.decode(errors="replace")
    if isinstance(item, np.generic):
        return item.item()
    return item


def scaled_at(dataset, line, sample):
    value = float(dataset[line, sample])
    fill = scalar(dataset.attrs.get("_FillValue"))
    if fill is not None and value == float(fill):
        return None
    scale = float(scalar(dataset.attrs.get("scale_factor")) or 1)
    offset = float(scalar(dataset.attrs.get("add_offset")) or 0)
    return value * scale + offset


def haversine(lon1, lat1, lon2, lat2):
    radius = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0, 1 - a)))


def distances_km(longitudes, latitudes, longitude, latitude):
    dy = (latitudes - latitude) * 111.32
    dx = (longitudes - longitude) * 111.32 * math.cos(math.radians(latitude))
    return np.hypot(dx, dy)


def nearest_pixel(latitude_ds, longitude_ds, longitude, latitude):
    stride = 64
    coarse_lat = latitude_ds[::stride, ::stride]
    coarse_lon = longitude_ds[::stride, ::stride]
    coarse = distances_km(coarse_lon, coarse_lat, longitude, latitude)
    valid = np.isfinite(coarse_lat) & np.isfinite(coarse_lon) & (np.abs(coarse_lat) <= 90) & (np.abs(coarse_lon) <= 180)
    coarse = np.where(valid, coarse, np.inf)
    coarse_index = np.unravel_index(int(np.argmin(coarse)), coarse.shape)
    center_line, center_sample = coarse_index[0] * stride, coarse_index[1] * stride
    margin = 96
    line_start, line_end = max(0, center_line - margin), min(latitude_ds.shape[0], center_line + margin + 1)
    sample_start, sample_end = max(0, center_sample - margin), min(latitude_ds.shape[1], center_sample + margin + 1)
    local_lat = latitude_ds[line_start:line_end, sample_start:sample_end]
    local_lon = longitude_ds[line_start:line_end, sample_start:sample_end]
    local = distances_km(local_lon, local_lat, longitude, latitude)
    valid = np.isfinite(local_lat) & np.isfinite(local_lon) & (np.abs(local_lat) <= 90) & (np.abs(local_lon) <= 180)
    local = np.where(valid, local, np.inf)
    local_index = np.unravel_index(int(np.argmin(local)), local.shape)
    line, sample = int(line_start + local_index[0]), int(sample_start + local_index[1])
    return line, sample, float(local[local_index]), float(latitude_ds[line, sample]), float(longitude_ds[line, sample])


def main():
    if len(sys.argv) != 4:
        raise ValueError("usage:evaluate_viirs_granule.py active.nc geolocation.nc cases.json")
    active_path, geo_path, cases_path = sys.argv[1:]
    with open(cases_path, encoding="utf8") as handle:
        cases = json.load(handle)
    if not isinstance(cases, list) or len(cases) > MAX_CASES:
        raise ValueError("case_limit_exceeded")
    with h5py.File(active_path, "r") as active, h5py.File(geo_path, "r") as geo:
        fire_mask = active["fire mask"]
        algorithm_qa = active["algorithm QA"]
        latitude_ds = geo["geolocation_data/latitude"]
        longitude_ds = geo["geolocation_data/longitude"]
        geo_quality_ds = geo["geolocation_data/quality_flag"]
        sensor_zenith_ds = geo["geolocation_data/sensor_zenith"]
        land_water_ds = geo["geolocation_data/land_water_mask"]
        grid_datasets = [fire_mask, algorithm_qa, latitude_ds, longitude_ds, geo_quality_ds, sensor_zenith_ds, land_water_ds]
        if any(len(dataset.shape) != 2 or int(np.prod(dataset.shape)) > MAX_GRID_ELEMENTS for dataset in grid_datasets):
            raise ValueError("grid_dataset_limit_exceeded")
        if any(dataset.shape != latitude_ds.shape for dataset in [longitude_ds, geo_quality_ds, sensor_zenith_ds, land_water_ds]) or fire_mask.shape != algorithm_qa.shape:
            raise ValueError("grid_dataset_shape_mismatch")
        fp_datasets = [active[name] for name in ("FP_latitude", "FP_longitude", "FP_power", "FP_confidence", "FP_line", "FP_sample")]
        fp_count = int(np.prod(fp_datasets[0].shape))
        if fp_count > MAX_FIRE_PIXELS or any(int(np.prod(dataset.shape)) != fp_count for dataset in fp_datasets):
            raise ValueError("fire_pixel_dataset_limit_exceeded")
        fp_lat = np.asarray(active["FP_latitude"][:], dtype=float)
        fp_lon = np.asarray(active["FP_longitude"][:], dtype=float)
        fp_power = np.asarray(active["FP_power"][:], dtype=float)
        fp_confidence = np.asarray(active["FP_confidence"][:], dtype=int)
        fp_line = np.asarray(active["FP_line"][:], dtype=int)
        fp_sample = np.asarray(active["FP_sample"][:], dtype=int)
        rows = []
        for case in cases:
            longitude, latitude = map(float, case["coordinate"])
            line, sample, geolocation_distance, pixel_latitude, pixel_longitude = nearest_pixel(latitude_ds, longitude_ds, longitude, latitude)
            mask_code = int(fire_mask[line, sample])
            geo_quality = int(geo_quality_ds[line, sample])
            algorithm_qa_value = int(algorithm_qa[line, sample])
            sensor_zenith = scaled_at(sensor_zenith_ds, line, sample)
            land_water = int(land_water_ds[line, sample])
            fire_distances = distances_km(fp_lon, fp_lat, longitude, latitude) if len(fp_lat) else np.array([])
            matches = np.flatnonzero(fire_distances <= 3)
            nearest_fire = None
            if len(matches):
                index = int(matches[np.argmin(fire_distances[matches])])
                nearest_fire = {
                    "distanceKm": round(float(fire_distances[index]), 3),
                    "coordinate": [float(fp_lon[index]), float(fp_lat[index])],
                    "frpMw": float(fp_power[index]),
                    "confidence": int(fp_confidence[index]),
                    "line": int(fp_line[index]),
                    "sample": int(fp_sample[index]),
                }
            geolocation_ok = geolocation_distance <= 1 and geo_quality == 0
            native_signal = nearest_fire is not None
            usable_mask = mask_code in (5, 7, 8, 9)
            valid_opportunity = bool(geolocation_ok and (usable_mask or native_signal))
            if geolocation_distance > 1:
                state = "GEOLOCATION_FAILURE"
            elif geo_quality != 0:
                state = "UNUSABLE QUALITY"
            elif native_signal:
                state = "FIRE SIGNAL"
            elif mask_code == 5:
                state = "VALID OPPORTUNITY / NO FIRE SIGNAL"
            elif mask_code == 1:
                state = "EDGE OF SWATH"
            elif mask_code in (0, 2, 3, 4):
                state = "UNUSABLE QUALITY"
            else:
                state = "INSIDE SWATH / QUALITY UNKNOWN"
            rows.append({
                "caseId": case["caseId"], "state": state, "line": line, "sample": sample,
                "pixelCoordinate": [pixel_longitude, pixel_latitude],
                "geolocationDistanceKm": round(geolocation_distance, 3),
                "geolocationQuality": geo_quality, "fireMaskCode": mask_code,
                "fireMaskLabel": MASK_LABELS.get(mask_code, "unknown"),
                "algorithmQa": algorithm_qa_value, "sensorZenithDeg": round(sensor_zenith, 2) if sensor_zenith is not None else None,
                "landWaterCode": land_water, "validOpportunity": valid_opportunity,
                "nativeFireSignal": native_signal, "nearestFirePixel": nearest_fire,
            })
        attrs = {key: scalar(active.attrs.get(key)) for key in ("ShortName", "PlatformShortName", "StartTime", "EndTime", "Day/Night/Both", "FirePix", "CloudPix", "LandPix", "WaterPix", "MissingPix")}
        print(json.dumps({"ok": True, "product": attrs, "sourceFirePixels": int(len(fp_lat)), "evaluations": rows}, separators=(",", ":")))


try:
    main()
except Exception as exc:
    print(json.dumps({"ok": False, "error": str(exc)}, separators=(",", ":")))
    raise SystemExit(1)
