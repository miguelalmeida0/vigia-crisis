#!/usr/bin/env python3
"""Fail fast when VIGIA's scientific raster runtime is not usable."""
import importlib, json, shutil, sys
mods=['numpy','rasterio','pyproj','shapely','h5py']; versions={}; errors=[]
for name in mods:
    try:
        module=importlib.import_module(name); versions[name]=getattr(module,'__version__','installed')
    except Exception as exc: errors.append(f'{name}:{exc}')
result={'ok':not errors,'python':sys.version.split()[0],'executable':sys.executable,'gdalTools':{'gdalinfo':shutil.which('gdalinfo')},'modules':versions,'errors':errors}
print(json.dumps(result,indent=2)); raise SystemExit(0 if result['ok'] else 1)
