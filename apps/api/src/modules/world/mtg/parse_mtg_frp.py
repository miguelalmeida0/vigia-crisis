#!/usr/bin/env python3
import json, math, os, sys

try:
    import resource
    _memory_limit = 768 * 1024 * 1024
    _soft, _hard = resource.getrlimit(resource.RLIMIT_AS)
    _effective = min(_memory_limit, _hard) if _hard not in (-1, resource.RLIM_INFINITY) else _memory_limit
    if _soft in (-1, resource.RLIM_INFINITY) or _soft > _effective:
        resource.setrlimit(resource.RLIMIT_AS, (_effective, _hard))
except Exception:
    pass

PORTUGAL = (-9.9, 36.6, -6.0, 42.4)
MAX_FILE_BYTES = 256 * 1024 * 1024
MAX_DATASETS = 512
MAX_DATASET_ELEMENTS = 2_000_000
MAX_DATASET_BYTES = 64 * 1024 * 1024
MAX_DECODED_BYTES = 192 * 1024 * 1024
MAX_DTYPE_BYTES = 16
MAX_DETECTIONS = 100_000

def fail(message):
    print(json.dumps({"ok": False, "error": message, "detections": []}))
    raise SystemExit(0)

try:
    import h5py
    import numpy as np
except Exception as exc:
    fail(f"Python h5py/numpy required for MTG NetCDF ingestion: {exc}")

if len(sys.argv) < 2:
    fail("missing_netcdf_path")
path = sys.argv[1]
if not os.path.isfile(path):
    fail("netcdf_file_not_found")
if os.path.getsize(path) > MAX_FILE_BYTES:
    fail("netcdf_file_too_large")

def walk(group, prefix="", counter=None):
    if counter is None:
        counter = [0]
    out = {}
    for name, value in group.items():
        key = f"{prefix}/{name}" if prefix else name
        if isinstance(value, h5py.Dataset):
            counter[0] += 1
            if counter[0] > MAX_DATASETS:
                fail("dataset_inventory_limit_exceeded")
            out[key.lower()] = value
        elif isinstance(value, h5py.Group):
            out.update(walk(value, key, counter))
    return out

def choose(datasets, tokens, reject=()):
    ranked = []
    for key, ds in datasets.items():
        name = key.lower()
        if any(part in name for part in reject):
            continue
        score = sum(3 if name.endswith('/'+token) or name == token else 1 for token in tokens if token in name)
        if score:
            ranked.append((score, -len(name), key, ds))
    return max(ranked, default=(0,0,None,None))[3]

def scaled(ds, decoded_budget):
    elements = int(ds.size)
    if elements > MAX_DATASET_ELEMENTS:
        fail("dataset_element_limit_exceeded")
    dtype = ds.dtype
    if dtype.hasobject or dtype.fields is not None or h5py.check_dtype(vlen=dtype) is not None or dtype.kind not in "biuf" or int(dtype.itemsize) <= 0 or int(dtype.itemsize) > MAX_DTYPE_BYTES:
        fail("unsafe_dataset_dtype")
    decoded_bytes = elements * int(dtype.itemsize)
    if decoded_bytes > MAX_DATASET_BYTES:
        fail("dataset_decoded_byte_limit_exceeded")
    decoded_budget[0] += decoded_bytes
    if decoded_budget[0] > MAX_DECODED_BYTES:
        fail("aggregate_decoded_byte_limit_exceeded")
    arr = np.asarray(ds[...]).reshape(-1)
    fill = ds.attrs.get('_FillValue', ds.attrs.get('missing_value'))
    scale = float(np.asarray(ds.attrs.get('scale_factor', 1)).reshape(-1)[0])
    offset = float(np.asarray(ds.attrs.get('add_offset', 0)).reshape(-1)[0])
    arr = arr.astype('float64') * scale + offset
    if fill is not None:
        raw_fill = float(np.asarray(fill).reshape(-1)[0]) * scale + offset
        arr[np.isclose(arr, raw_fill, equal_nan=False)] = np.nan
    return arr

def text_attr(handle, names):
    for name in names:
        if name in handle.attrs:
            value = handle.attrs[name]
            if isinstance(value, bytes): value = value.decode('utf-8', 'replace')
            if hasattr(value, 'tolist'): value = value.tolist()
            return str(value)
    return None

with h5py.File(path, 'r') as handle:
    datasets = walk(handle)
    lat_ds = choose(datasets, ['latitude','lat'], reject=['quality'])
    lon_ds = choose(datasets, ['longitude','lon'], reject=['quality'])
    frp_ds = choose(datasets, ['fire_radiative_power','frp'], reject=['uncertainty','quality'])
    conf_ds = choose(datasets, ['confidence','fire_confidence'], reject=['quality'])
    unc_ds = choose(datasets, ['frp_uncertainty','uncertainty'], reject=['quality'])
    time_ds = choose(datasets, ['time','observation_time','fire_time'], reject=['quality'])
    if lat_ds is None or lon_ds is None or frp_ds is None:
        fail("Could not locate ListProduct latitude/longitude/FRP arrays")
    decoded_budget = [0]
    lat, lon, frp = scaled(lat_ds, decoded_budget), scaled(lon_ds, decoded_budget), scaled(frp_ds, decoded_budget)
    length = min(len(lat), len(lon), len(frp))
    conf = scaled(conf_ds, decoded_budget) if conf_ds is not None else np.full(length, np.nan)
    unc = scaled(unc_ds, decoded_budget) if unc_ds is not None else np.full(length, np.nan)
    times = scaled(time_ds, decoded_budget) if time_ds is not None and np.issubdtype(time_ds.dtype, np.number) else None
    observed = text_attr(handle, ['time_coverage_start','start_time','date_created','nominal_product_time'])
    rows = []
    west,south,east,north = PORTUGAL
    for i in range(length):
        la, lo, power = float(lat[i]), float(lon[i]), float(frp[i])
        if not all(math.isfinite(v) for v in [la,lo,power]): continue
        if not (west <= lo <= east and south <= la <= north): continue
        confidence = float(conf[i]) if i < len(conf) and math.isfinite(float(conf[i])) else None
        uncertainty = float(unc[i]) if i < len(unc) and math.isfinite(float(unc[i])) else None
        rows.append({"latitude": la, "longitude": lo, "frpMw": power, "confidence": confidence, "uncertaintyMw": uncertainty, "index": i})
        if len(rows) > MAX_DETECTIONS:
            fail("detection_limit_exceeded")
    print(json.dumps({"ok": True, "file": os.path.basename(path), "observedAt": observed, "detections": rows}, separators=(',',':')))
