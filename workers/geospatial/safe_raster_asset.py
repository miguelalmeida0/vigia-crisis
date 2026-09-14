"""Strict worker-side raster source boundary.

Workers accept local absolute files or opaque paths on the exact loopback
broker origin supplied by the parent process. Provider URLs are never opened
directly by GDAL/rasterio.
"""
import os
import re
from urllib.parse import urlsplit

TOKEN_PATH = re.compile(r"^/raster/[A-Za-z0-9_-]{32}$")


def safe_raster_asset(value, broker_origin=None):
    if not isinstance(value, str) or not value or "\x00" in value:
        raise ValueError("raster_asset_required")
    if os.path.isabs(value):
        return value
    target = urlsplit(value)
    broker = urlsplit(broker_origin or "")
    valid_broker = (
        broker.scheme == "http"
        and broker.hostname == "127.0.0.1"
        and broker.port is not None
        and not broker.username
        and not broker.password
        and not broker.query
        and not broker.fragment
        and broker.path in ("", "/")
    )
    valid_target = (
        valid_broker
        and target.scheme == "http"
        and target.hostname == "127.0.0.1"
        and target.port == broker.port
        and not target.username
        and not target.password
        and not target.query
        and not target.fragment
        and TOKEN_PATH.fullmatch(target.path)
    )
    if not valid_target:
        raise ValueError("raster_asset_transport_rejected")
    return value


def secure_scene(scene, broker_origin=None):
    if not isinstance(scene, dict):
        raise ValueError("raster_scene_required")
    secured = dict(scene)
    for key in ("red", "nir", "swir", "scl"):
        if secured.get(key):
            secured[key] = safe_raster_asset(secured[key], broker_origin)
    return secured
