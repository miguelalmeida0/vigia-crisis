#!/usr/bin/env python3
"""Best-effort parser for Sentinel-3 SLSTR L2 FRP NetCDF files or official product ZIPs."""
import datetime as dt
import json
import os
import re
import sys
import zipfile
import stat

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
MAX_ARCHIVE_MEMBERS = 256
MAX_ARCHIVE_EXPANDED_BYTES = 256 * 1024 * 1024
MAX_ARCHIVE_MEMBER_BYTES = 128 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
MAX_NETCDF_FILES = 32
MAX_DATASETS = 512
MAX_DATASET_ELEMENTS = 2_000_000
MAX_DETECTIONS = 100_000

def emit(payload):
    print(json.dumps(payload, separators=(",", ":")))
    raise SystemExit(0)

def fail(message): emit({"ok": False, "error": message, "detections": []})
try:
    import h5py
    import numpy as np
except Exception as exc: fail(f"h5py_numpy_required:{exc}")
if len(sys.argv) < 2: fail("missing_product_path")
root=sys.argv[1]
if not os.path.exists(root): fail("product_path_not_found")
files=[]
if os.path.isfile(root) and zipfile.is_zipfile(root):
    if len(sys.argv)<3: fail("supervisor_owned_extraction_directory_required")
    expanded=os.path.abspath(sys.argv[2])
    if not os.path.isdir(expanded): fail("extraction_directory_unavailable")
    if os.listdir(expanded): fail("extraction_directory_not_empty")
    base=os.path.abspath(expanded)
    with zipfile.ZipFile(root) as archive:
        members=archive.infolist()
        if len(members)>MAX_ARCHIVE_MEMBERS: fail("product_archive_member_limit_exceeded")
        expanded_bytes=0
        for member in members:
            target=os.path.abspath(os.path.join(base, member.filename))
            if target != base and not target.startswith(base + os.sep): fail("unsafe_product_archive_path")
            mode=member.external_attr >> 16
            if member.flag_bits & 0x1: fail("encrypted_product_archive_not_allowed")
            if stat.S_ISLNK(mode): fail("product_archive_symlink_not_allowed")
            if member.file_size>MAX_ARCHIVE_MEMBER_BYTES: fail("product_archive_member_too_large")
            expanded_bytes+=member.file_size
            if expanded_bytes>MAX_ARCHIVE_EXPANDED_BYTES: fail("product_archive_expanded_size_exceeded")
            if member.file_size and member.file_size/max(1,member.compress_size)>MAX_COMPRESSION_RATIO: fail("product_archive_compression_ratio_exceeded")
            if member.is_dir() or not member.filename.lower().endswith('.nc'): continue
            os.makedirs(os.path.dirname(target),exist_ok=True)
            with archive.open(member) as source, open(target,'wb') as destination:
                written=0
                while True:
                    chunk=source.read(1024*1024)
                    if not chunk: break
                    written+=len(chunk)
                    if written>member.file_size or written>MAX_ARCHIVE_MEMBER_BYTES: fail("product_archive_member_expansion_mismatch")
                    destination.write(chunk)
            files.append(target)
elif os.path.isfile(root): files=[root]
else:
    for base,_,names in os.walk(root):
        files.extend(os.path.join(base,name) for name in names if name.lower().endswith('.nc'))
if not files: fail("no_netcdf_files")
if len(files)>MAX_NETCDF_FILES: fail("netcdf_file_limit_exceeded")

def walk(group,prefix='',counter=None):
    if counter is None: counter=[0]
    out={}
    for name,value in group.items():
        key=f"{prefix}/{name}" if prefix else name
        if isinstance(value,h5py.Dataset):
            counter[0]+=1
            if counter[0]>MAX_DATASETS: fail("dataset_inventory_limit_exceeded")
            out[key.lower()]=value
        elif isinstance(value,h5py.Group): out.update(walk(value,key,counter))
    return out

def scaled(ds):
    if int(np.prod(ds.shape))>MAX_DATASET_ELEMENTS: fail("dataset_element_limit_exceeded")
    raw=np.asarray(ds[...]).reshape(-1); arr=raw.astype('float64')
    scale=float(np.asarray(ds.attrs.get('scale_factor',1)).reshape(-1)[0]); offset=float(np.asarray(ds.attrs.get('add_offset',0)).reshape(-1)[0]); arr=arr*scale+offset
    fill=ds.attrs.get('_FillValue',ds.attrs.get('missing_value'))
    if fill is not None:
        value=float(np.asarray(fill).reshape(-1)[0])*scale+offset; arr[np.isclose(arr,value,equal_nan=False)]=np.nan
    return arr

def score(name,tokens,reject=()):
    if any(token in name for token in reject): return 0
    return sum(4 if name.endswith('/'+token) or name==token else 1 for token in tokens if token in name)

def choose(candidates,tokens,reject=(),size=None):
    ranked=[]
    for name,ds in candidates:
        try: count=int(np.prod(ds.shape))
        except Exception: continue
        if size is not None and count!=size: continue
        # Candidate names include the component filename as a prefix. Asset
        # names such as FRP_MWIR1km_STANDARD.nc must scope the component, but
        # must not make every variable inside it look like an FRP variable.
        variable=name.split(':',1)[-1]
        value=score(variable,tokens,reject)
        if value: ranked.append((value,-len(variable),variable,ds))
    return max(ranked,default=(0,0,None,None))[3]

def named(candidates, token, size=None):
    for name,ds in candidates:
        if name.endswith(':'+token) or name.endswith('/'+token) or name==token:
            if size is None or int(np.prod(ds.shape)) == size: return ds
    return None

def number_at(array,index):
    return float(array[index]) if array is not None and index < len(array) and np.isfinite(array[index]) else None

def timestamp_at(time_array,index,units,default):
    value=number_at(time_array,index)
    if value is None: return default
    match=re.match(r'\s*(microseconds|milliseconds|seconds)\s+since\s+(.+?)\s*$',str(units or ''),re.I)
    if not match: return default
    base_text=match.group(2).replace('Z','+00:00')
    try:
        base=dt.datetime.fromisoformat(base_text)
        if base.tzinfo is None: base=base.replace(tzinfo=dt.timezone.utc)
        scale={'microseconds':1e-6,'milliseconds':1e-3,'seconds':1}[match.group(1).lower()]
        return (base+dt.timedelta(seconds=value*scale)).astimezone(dt.timezone.utc).isoformat().replace('+00:00','Z')
    except Exception: return default

CLASSIFICATION_BITS=((1,'vegetation_fire'),(2,'onshore_gas_flare'),(4,'offshore_gas_flare'),(8,'volcanic'),(16,'industrial'))

handles=[]; datasets=[]; attrs={}
try:
    for filename in files:
        try:
            handle=h5py.File(filename,'r'); handles.append(handle)
            datasets.extend((f"{os.path.basename(filename).lower()}:{name}",ds) for name,ds in walk(handle).items())
            for key,value in handle.attrs.items(): attrs.setdefault(str(key).lower(),value)
        except Exception: continue
    scoped=datasets
    for component in ('frp_mwir1km_standard', 'frp_in.nc', 'frp_an.nc', 'frp_bn.nc'):
        candidate=[item for item in datasets if component in item[0]]
        if candidate:
            scoped=candidate
            break
    frp=choose(scoped,['fire_radiative_power','frp_mwir1km','frp_mwir'],reject=('uncert','error','flag','quality'))
    if frp is None: frp=choose(scoped,['frp'],reject=('uncert','error','flag','quality'))
    if frp is None: fail("frp_dataset_not_found")
    count=int(np.prod(frp.shape))
    if count>MAX_DATASET_ELEMENTS: fail("frp_dataset_element_limit_exceeded")
    lat=choose(scoped,['latitude','lat'],reject=('bounds','corner'),size=count); lon=choose(scoped,['longitude','lon'],reject=('bounds','corner'),size=count)
    if lat is None or lon is None: fail("matching_geolocation_dataset_not_found")
    conf=choose(scoped,['confidence','reliability','quality'],reject=('latitude','longitude','flag'),size=count)
    uncertainty=choose(scoped,['frp_uncertainty','frp_error','uncertainty'],reject=('latitude','longitude','flag'),size=count)
    classification=named(scoped,'classification',count)
    native_flags=named(scoped,'flags')
    row_index=named(scoped,'j',count); column_index=named(scoped,'i',count)
    time_ds=named(scoped,'time',count); day_night=named(scoped,'day_night',count)
    satellite_zenith=named(scoped,'satellite_zenith_angle',count); sun_zenith=named(scoped,'sun_zenith_angle',count)
    background_cloud=named(scoped,'n_cloud',count); background_water=named(scoped,'n_water',count); background_window=named(scoped,'n_window',count)
    brightness_mir=named(scoped,'bt_mir',count); brightness_window=named(scoped,'bt_window',count); transmittance=named(scoped,'transmittance_mwir',count); ifov_area=named(scoped,'ifov_area',count)
    frp_arr,lat_arr,lon_arr=scaled(frp),scaled(lat),scaled(lon)
    conf_arr=scaled(conf) if conf is not None else None
    uncertainty_arr=scaled(uncertainty) if uncertainty is not None else None
    classification_arr=scaled(classification) if classification is not None else None
    row_arr=scaled(row_index) if row_index is not None else None; column_arr=scaled(column_index) if column_index is not None else None
    time_arr=scaled(time_ds) if time_ds is not None else None; day_night_arr=scaled(day_night) if day_night is not None else None
    satellite_zenith_arr=scaled(satellite_zenith) if satellite_zenith is not None else None; sun_zenith_arr=scaled(sun_zenith) if sun_zenith is not None else None
    background_cloud_arr=scaled(background_cloud) if background_cloud is not None else None; background_water_arr=scaled(background_water) if background_water is not None else None; background_window_arr=scaled(background_window) if background_window is not None else None
    brightness_mir_arr=scaled(brightness_mir) if brightness_mir is not None else None; brightness_window_arr=scaled(brightness_window) if brightness_window is not None else None; transmittance_arr=scaled(transmittance) if transmittance is not None else None; ifov_area_arr=scaled(ifov_area) if ifov_area is not None else None
    platform='Sentinel-3'
    for key in ('platform','spacecraft_name','satellite'):
        if key in attrs:
            value=attrs[key]; platform=value.decode() if isinstance(value,bytes) else str(np.asarray(value).reshape(-1)[0]); break
    observed=None
    for key in ('time_coverage_start','start_time','sensing_start'):
        if key in attrs:
            value=attrs[key]; observed=value.decode() if isinstance(value,bytes) else str(np.asarray(value).reshape(-1)[0]); break
    if not observed:
        text=' '.join(os.path.basename(name) for name in files); match=re.search(r'(20\d{6}T\d{6})',text)
        if match:
            observed=dt.datetime.strptime(match.group(1),'%Y%m%dT%H%M%S').replace(tzinfo=dt.timezone.utc).isoformat().replace('+00:00','Z')
    if platform == 'Sentinel-3':
        product=str(attrs.get('product_name',b'')); match=re.search(r"S3([AB])_",product)
        if match: platform=f"Sentinel-3{match.group(1)}"
    west,south,east,north=PORTUGAL; detections=[]
    source_record_count=int(len(frp_arr)); positive_frp_record_count=0; invalid_coordinate_records=0; invalid_time_records=0
    time_units=time_ds.attrs.get('units',b'').decode(errors='replace') if time_ds is not None and isinstance(time_ds.attrs.get('units',b''),bytes) else str(time_ds.attrs.get('units','')) if time_ds is not None else ''
    for index,(la,lo,power) in enumerate(zip(lat_arr,lon_arr,frp_arr)):
        if not np.isfinite(power) or power<=0: continue
        positive_frp_record_count+=1
        if not all(np.isfinite(v) for v in (la,lo)) or not (-90<=la<=90 and -180<=lo<=180): invalid_coordinate_records+=1; continue
        if not (west<=lo<=east and south<=la<=north): continue
        quality=float(conf_arr[index]) if conf_arr is not None and index<len(conf_arr) and np.isfinite(conf_arr[index]) else None
        error=float(uncertainty_arr[index]) if uncertainty_arr is not None and index<len(uncertainty_arr) and np.isfinite(uncertainty_arr[index]) else None
        classification_code=int(number_at(classification_arr,index) or 0); classification_labels=[label for bit,label in CLASSIFICATION_BITS if classification_code & bit]
        native_flag=None; row=number_at(row_arr,index); column=number_at(column_arr,index)
        if native_flags is not None and row is not None and column is not None and 0<=int(row)<native_flags.shape[0] and 0<=int(column)<native_flags.shape[1]: native_flag=int(native_flags[int(row),int(column)])
        quality_flags=[f"classification:{label}" for label in classification_labels]
        if native_flag is not None: quality_flags.append(f"native_fire_test_code:{native_flag}")
        if quality is None: quality_flags.append("native_confidence_unreported")
        record_time=timestamp_at(time_arr,index,time_units,observed)
        if not record_time: invalid_time_records+=1
        if len(detections) >= MAX_DETECTIONS: fail("detection_limit_exceeded")
        detection={"nativeRecordIndex":index,"latitude":float(la),"longitude":float(lo),"observedAt":record_time,"frpMw":float(power),"confidence":quality,"uncertaintyMw":error,"classificationCode":classification_code,"classification":classification_labels or ["unclassified"],"nativeFireTestCode":native_flag,"dayNight":"DAY" if number_at(day_night_arr,index)==1 else "NIGHT" if number_at(day_night_arr,index)==0 else None,"satelliteZenithDeg":number_at(satellite_zenith_arr,index),"sunZenithDeg":number_at(sun_zenith_arr,index),"backgroundCloudPixels":number_at(background_cloud_arr,index),"backgroundWaterPixels":number_at(background_water_arr,index),"backgroundWindowPixels":number_at(background_window_arr,index),"brightnessMirK":number_at(brightness_mir_arr,index),"backgroundBrightnessK":number_at(brightness_window_arr,index),"transmittanceMwir":number_at(transmittance_arr,index),"ifovAreaM2":number_at(ifov_area_arr,index),"nativeRow":int(row) if row is not None else None,"nativeColumn":int(column) if column is not None else None,"qualityFlags":quality_flags}
        detections.append(detection)
    conclusion="positive_frp_pixels_in_portugal_aoi" if detections else "source_product_contains_no_active_fire_records" if source_record_count==0 else "positive_frp_records_outside_portugal_aoi" if positive_frp_record_count else "source_product_contains_no_positive_frp_records"
    emit({"ok":True,"observedAt":observed,"platform":platform,"productSchema":"sentinel-3-slstr-sl-2-frp","nativeDimensions":{"frp":list(frp.shape),"latitude":list(lat.shape),"longitude":list(lon.shape),"nativeFlags":list(native_flags.shape) if native_flags is not None else None},"dataset":{"frp":frp.name,"latitude":lat.name,"longitude":lon.name,"time":time_ds.name if time_ds is not None else None,"confidence":conf.name if conf is not None else None,"uncertainty":uncertainty.name if uncertainty is not None else None,"classification":classification.name if classification is not None else None,"qualityFlags":native_flags.name if native_flags is not None else None},"sourceRecordCount":source_record_count,"positiveFrpRecordCount":positive_frp_record_count,"aoiObservationCount":len(detections),"geographicIntegrity":{"invalidCoordinateRecords":invalid_coordinate_records,"invalidTimeRecords":invalid_time_records,"valid":invalid_coordinate_records==0 and invalid_time_records==0},"observationConclusion":conclusion,"detections":detections})
finally:
    for handle in handles:
        try: handle.close()
        except Exception: pass
