#!/usr/bin/env python3
import json
import math
import os
import sys

from pyproj import Geod
from shapely import make_valid
from shapely.geometry import mapping, shape
from shapely.geometry.polygon import orient
from shapely.validation import explain_validity

MAX_INPUT_BYTES = 32 * 1024 * 1024
GEOD = Geod(ellps="WGS84")


def fail(code):
    print(json.dumps({"ok": False, "error": code}, separators=(",", ":")))
    raise SystemExit(2)


def safe_geometry(value):
    try:
        geometry = shape(value)
    except Exception:
        raise ValueError("MALFORMED_GEOJSON_GEOMETRY")
    if geometry.geom_type not in {"Polygon", "MultiPolygon"}:
        raise ValueError("POLYGON_OR_MULTIPOLYGON_REQUIRED")
    if geometry.is_empty:
        raise ValueError("EMPTY_GEOMETRY")
    return geometry


def coordinates_finite(value):
    if isinstance(value, (int, float)):
        return math.isfinite(value)
    if isinstance(value, (list, tuple)):
        return all(coordinates_finite(item) for item in value)
    return True


def area_km2(geometry):
    area, _ = GEOD.geometry_area_perimeter(geometry)
    return abs(area) / 1_000_000


def normalize(geometry):
    valid = make_valid(geometry)
    polygons = []
    if valid.geom_type == "Polygon":
        polygons = [orient(valid, sign=1.0)]
    elif valid.geom_type == "MultiPolygon":
        polygons = [orient(part, sign=1.0) for part in valid.geoms]
    elif valid.geom_type == "GeometryCollection":
        for part in valid.geoms:
            if part.geom_type == "Polygon":
                polygons.append(orient(part, sign=1.0))
            elif part.geom_type == "MultiPolygon":
                polygons.extend(orient(item, sign=1.0) for item in part.geoms)
    if not polygons:
        raise ValueError("GEOMETRY_REPAIR_REMOVED_ALL_POLYGONS")
    from shapely.geometry import MultiPolygon
    return polygons[0] if len(polygons) == 1 else MultiPolygon(polygons)


def metrics(current, previous=None):
    original_valid = current.is_valid
    repaired = normalize(current)
    minx, miny, maxx, maxy = repaired.bounds
    failures = []
    if not coordinates_finite(mapping(current).get("coordinates")):
        failures.append("NON_FINITE_COORDINATE")
    if minx < -180 or maxx > 180 or miny < -90 or maxy > 90:
        failures.append("COORDINATE_OUT_OF_RANGE")
    if maxx - minx > 180:
        failures.append("ANTIMERIDIAN_REQUIRES_SPECIAL_HANDLING")
    if not original_valid:
        failures.append("INVALID_TOPOLOGY")
    before_area = area_km2(current)
    after_area = area_km2(repaired)
    repair_ratio = abs(after_area - before_area) / before_area if before_area > 0 else None
    if repair_ratio is not None and repair_ratio > 0.05:
        failures.append("GEOMETRY_REPAIR_EXCEEDS_AREA_CEILING")
    row = {
        "geometryType": repaired.geom_type,
        "originalValid": original_valid,
        "originalValidityReason": explain_validity(current),
        "normalizedValid": repaired.is_valid,
        "bounds": [minx, miny, maxx, maxy],
        "areaKm2": after_area,
        "perimeterKm": GEOD.geometry_area_perimeter(repaired)[1] / 1000,
        "centroid": [repaired.centroid.x, repaired.centroid.y],
        "componentCount": len(repaired.geoms) if repaired.geom_type == "MultiPolygon" else 1,
        "holeCount": sum(len(part.interiors) for part in repaired.geoms) if repaired.geom_type == "MultiPolygon" else len(repaired.interiors),
        "repairAreaChangeRatio": repair_ratio,
        "normalizedGeometry": mapping(repaired),
        "failures": sorted(set(failures)),
    }
    if previous is not None:
        prior = normalize(previous)
        prior_area = area_km2(prior)
        _, _, displacement = GEOD.inv(prior.centroid.x, prior.centroid.y, repaired.centroid.x, repaired.centroid.y)
        row.update({
            "previousAreaKm2": prior_area,
            "areaRatio": after_area / prior_area if prior_area > 0 else None,
            "centroidDisplacementKm": abs(displacement) / 1000,
            "intersectsPrevious": repaired.intersects(prior),
            "hausdorffDegrees": repaired.hausdorff_distance(prior),
        })
    return row


def main():
    if len(sys.argv) != 2:
        fail("INPUT_PATH_REQUIRED")
    input_path = os.path.realpath(sys.argv[1])
    if not os.path.isfile(input_path) or os.path.getsize(input_path) > MAX_INPUT_BYTES:
        fail("INPUT_FILE_INVALID_OR_OVERSIZED")
    with open(input_path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    rows = []
    for item in payload.get("items", []):
        try:
            current = safe_geometry(item.get("geometry"))
            previous = safe_geometry(item.get("previousGeometry")) if item.get("previousGeometry") else None
            rows.append({"stateId": item.get("stateId"), **metrics(current, previous)})
        except ValueError as error:
            rows.append({"stateId": item.get("stateId"), "failures": [str(error)], "normalizedValid": False})
    print(json.dumps({"ok": True, "engine": {"name": "shapely", "version": __import__("shapely").__version__, "geodesy": "pyproj.Geod/WGS84"}, "rows": rows}, separators=(",", ":")))


if __name__ == "__main__":
    main()
