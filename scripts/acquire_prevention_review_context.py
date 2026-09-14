#!/usr/bin/env python3
"""Acquire real, geometry-bound context for persisted PREVENT findings.

The output is review context, not a hazard label. Every value is derived from
an archived provider response or a provider COG and is bound to the exact
persisted finding geometry by SHA-256.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.mask import mask
from shapely.geometry import LineString, Point, mapping, shape
from shapely.ops import transform, unary_union


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / "data/runtime/production-v1.json"
OUTPUT_PATH = ROOT / "data/reference/prevention-review-context-v1.json"
RAW_ROOT = ROOT / "data/replay/raw/prevention-context-v1"
STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
WORLD_COVER_CLASSES = {
    10: "tree_cover",
    20: "shrubland",
    30: "grassland",
    40: "cropland",
    50: "built_up",
    60: "bare_or_sparse_vegetation",
    70: "snow_and_ice",
    80: "permanent_water",
    90: "herbaceous_wetland",
    95: "mangroves",
    100: "moss_and_lichen",
}
CRITICAL_AMENITIES = {
    "hospital",
    "clinic",
    "school",
    "kindergarten",
    "nursing_home",
    "fire_station",
}


def canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def digest(value: object) -> str:
    payload = value if isinstance(value, (bytes, bytearray)) else canonical(value).encode()
    return hashlib.sha256(payload).hexdigest()


def fetch_json(url: str, *, body: dict | None = None, timeout: int = 45) -> dict:
    data = None
    headers = {"User-Agent": "VIGIA/10.0 prevention-context-acquisition"}
    if body is not None:
        data = canonical(body).encode()
        headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=headers)
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def overpass_query(bounds: tuple[float, float, float, float]) -> str:
    west, south, east, north = bounds
    road_box = f"{south - 0.003},{west - 0.003},{north + 0.003},{east + 0.003}"
    asset_box = f"{south - 0.025},{west - 0.035},{north + 0.025},{east + 0.035}"
    return f'''[out:json][timeout:35];(
      way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|track"]({road_box});
      nwr["amenity"~"hospital|clinic|school|kindergarten|nursing_home|fire_station"]({asset_box});
      nwr["emergency"~"ambulance_station|fire_station"]({asset_box});
      nwr["power"~"substation|plant"]({asset_box});
    );out center geom tags;'''


def fetch_overpass(bounds: tuple[float, float, float, float]) -> tuple[dict, str]:
    query = overpass_query(bounds)
    last_error: Exception | None = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            request = Request(
                endpoint,
                data=urlencode({"data": query}).encode(),
                headers={
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "User-Agent": "VIGIA/10.0 prevention-context-acquisition",
                },
            )
            with urlopen(request, timeout=55) as response:
                return json.loads(response.read()), endpoint
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
    raise RuntimeError(f"overpass_unavailable:{last_error}")


def stac_item(collection: str, geometry: dict) -> dict:
    payload = fetch_json(
        STAC_URL,
        body={"collections": [collection], "intersects": geometry, "limit": 10},
        timeout=45,
    )
    features = payload.get("features", [])
    if not features:
        raise RuntimeError(f"stac_item_not_found:{collection}")
    if collection == "esa-worldcover":
        features.sort(key=lambda item: item.get("properties", {}).get("start_datetime", ""), reverse=True)
    return features[0]


def signed_asset(asset_url: str) -> str:
    payload = fetch_json(f"https://planetarycomputer.microsoft.com/api/sas/v1/sign?href={quote(asset_url, safe='')}")
    signed = payload.get("href")
    if not signed:
        raise RuntimeError("planetary_computer_asset_signing_failed")
    return signed


def projected(geometry):
    return transform(Transformer.from_crs("EPSG:4326", "EPSG:3763", always_xy=True).transform, geometry)


def geographic(geometry):
    return transform(Transformer.from_crs("EPSG:3763", "EPSG:4326", always_xy=True).transform, geometry)


def raster_values(asset_url: str, geometry, *, buffer_m: float = 0) -> tuple[np.ma.MaskedArray, object]:
    target = geographic(projected(geometry).buffer(buffer_m)) if buffer_m else geometry
    with rasterio.Env(GDAL_HTTP_MULTIRANGE="YES", GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
        with rasterio.open(asset_url) as dataset:
            data, raster_transform = mask(dataset, [mapping(target)], crop=True, filled=False)
    return data[0], raster_transform


def land_cover_context(asset_url: str, geometry, item_id: str) -> dict:
    pixels, _ = raster_values(asset_url, geometry)
    values = pixels.compressed().astype(int)
    counts = {int(code): int((values == code).sum()) for code in np.unique(values)}
    classified = {WORLD_COVER_CLASSES.get(code, f"class_{code}"): count for code, count in counts.items()}
    classified = dict(sorted(classified.items(), key=lambda row: (-row[1], row[0])))
    total = int(values.size)
    composition = {name: round(count / total, 4) for name, count in classified.items()} if total else {}
    dominant = next(iter(classified), None)
    return {
        "state": "MEASURED_GEOMETRY_BOUND" if total else "NO_VALID_PIXELS",
        "provider": "ESA WorldCover via Microsoft Planetary Computer",
        "product": item_id,
        "resolutionMeters": 10,
        "samplePixels": total,
        "dominantClass": dominant,
        "composition": composition,
        "classCounts": classified,
        "qualification": "Land-cover context describes the exact detector geometry; it is not an expert hazard label.",
    }


def terrain_context(asset_url: str, geometry, item_id: str) -> dict:
    pixels, raster_transform = raster_values(asset_url, geometry, buffer_m=150)
    values = np.asarray(pixels.filled(np.nan), dtype=float)
    valid = values[np.isfinite(values)]
    if not valid.size:
        return {"state": "NO_VALID_PIXELS", "provider": "Copernicus DEM GLO-30", "product": item_id}
    centroid_lat = geometry.centroid.y
    dx = abs(raster_transform.a) * 111_320 * math.cos(math.radians(centroid_lat))
    dy = abs(raster_transform.e) * 110_540
    slopes = np.array([], dtype=float)
    if values.shape[0] >= 3 and values.shape[1] >= 3:
        filled = values.copy()
        fallback = float(np.nanmedian(filled))
        filled[~np.isfinite(filled)] = fallback
        grad_y, grad_x = np.gradient(filled, max(dy, 1), max(dx, 1))
        slope = np.degrees(np.arctan(np.sqrt(grad_x * grad_x + grad_y * grad_y)))
        slopes = slope[np.isfinite(values)]
    return {
        "state": "MEASURED_LOCAL_CONTEXT",
        "provider": "Copernicus DEM GLO-30 via Microsoft Planetary Computer",
        "product": item_id,
        "resolutionMeters": 30,
        "bufferMeters": 150,
        "samplePixels": int(valid.size),
        "elevationMeters": {
            "minimum": round(float(np.min(valid)), 1),
            "median": round(float(np.median(valid)), 1),
            "maximum": round(float(np.max(valid)), 1),
        },
        "slopeDegrees": None
        if not slopes.size
        else {
            "median": round(float(np.median(slopes)), 1),
            "mean": round(float(np.mean(slopes)), 1),
            "maximum": round(float(np.max(slopes)), 1),
        },
        "qualification": "Terrain is summarized over the detector geometry plus a 150 m review buffer; no fire-behavior inference is made.",
    }


def osm_geometry(element: dict):
    points = [(float(item["lon"]), float(item["lat"])) for item in element.get("geometry", []) if "lon" in item and "lat" in item]
    if len(points) >= 2:
        return LineString(points)
    center = element.get("center", {})
    lon = element.get("lon", center.get("lon"))
    lat = element.get("lat", center.get("lat"))
    if lon is not None and lat is not None:
        return Point(float(lon), float(lat))
    return None


def osm_context(payload: dict, geometry: object) -> dict:
    projected_geometry = projected(geometry)
    roads = []
    critical_assets = []
    for element in payload.get("elements", []):
        tags = element.get("tags", {})
        item_geometry = osm_geometry(element)
        if item_geometry is None:
            continue
        if tags.get("highway") and item_geometry.geom_type == "LineString":
            roads.append((element, projected(item_geometry)))
        if (
            tags.get("amenity") in CRITICAL_AMENITIES
            or tags.get("emergency") in {"ambulance_station", "fire_station"}
            or tags.get("power") in {"substation", "plant"}
        ):
            critical_assets.append((element, projected(item_geometry)))
    intersecting = [(element, line) for element, line in roads if line.intersects(projected_geometry)]
    nearby_assets = []
    for element, item_geometry in critical_assets:
        tags = element.get("tags", {})
        distance = float(projected_geometry.distance(item_geometry))
        nearby_assets.append(
            {
                "id": f"osm:{element.get('type')}:{element.get('id')}",
                "kind": tags.get("amenity") or tags.get("emergency") or f"power_{tags.get('power')}",
                "label": tags.get("name") or tags.get("operator") or "mapped critical asset",
                "distanceMeters": round(distance, 1),
            }
        )
    nearby_assets.sort(key=lambda item: (item["distanceMeters"], item["id"]))
    return {
        "roadCrossings": len(intersecting),
        "intersectingRoadIds": sorted(f"osm:{item.get('type')}:{item.get('id')}" for item, _ in intersecting),
        "roadClasses": dict(
            sorted(
                {
                    road_class: sum(1 for item, _ in intersecting if item.get("tags", {}).get("highway") == road_class)
                    for road_class in {item.get("tags", {}).get("highway") for item, _ in intersecting}
                }.items()
            )
        ),
        "criticalAssetProximityM": nearby_assets[0]["distanceMeters"] if nearby_assets else None,
        "nearestCriticalAssets": nearby_assets[:5],
        "mappedRoadsConsidered": len(roads),
        "mappedCriticalAssetsConsidered": len(critical_assets),
        "provider": "OpenStreetMap via Overpass",
        "qualification": "Counts and distances reflect mapped OSM features only; OSM completeness varies and this is not an infrastructure census.",
    }


def main() -> None:
    RAW_ROOT.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    state = json.loads(STATE_PATH.read_text())
    findings = state.get("preventionFindings", [])
    if not findings:
        raise RuntimeError("no_prevention_findings")
    acquired_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    site_cache: dict[tuple[float, float], dict] = {}
    site_geometries: dict[tuple[float, float], list] = {}
    for finding in findings:
        lon, lat = map(float, finding["coordinate"])
        key = (round(lon, 5), round(lat, 5))
        site_geometries.setdefault(key, []).append(shape(finding["geometry"]))
    source_records: list[dict] = []
    output_findings: list[dict] = []

    for finding in findings:
        geometry_json = finding.get("geometry")
        if not geometry_json:
            raise RuntimeError(f"finding_geometry_missing:{finding.get('findingId')}")
        geometry = shape(geometry_json)
        lon, lat = map(float, finding["coordinate"])
        site_key = (round(lon, 5), round(lat, 5))
        if site_key not in site_cache:
            site_union = unary_union(site_geometries[site_key])
            site_name = f"{lat:.5f}_{lon:.5f}".replace("-", "m").replace(".", "p")
            osm_path = RAW_ROOT / f"osm-{site_name}.json"
            if osm_path.exists():
                osm_bytes = osm_path.read_bytes()
                osm_payload = json.loads(osm_bytes)
                osm_endpoint = "ARCHIVED_PROVIDER_RESPONSE"
            else:
                osm_payload, osm_endpoint = fetch_overpass(site_union.bounds)
                osm_bytes = (canonical(osm_payload) + "\n").encode()
                osm_path.write_bytes(osm_bytes)
            site_cache[site_key] = {"osm": osm_payload, "osmEndpoint": osm_endpoint, "osmPath": osm_path}
            source_records.append(
                {
                    "provider": "OpenStreetMap via Overpass",
                    "endpoint": osm_endpoint,
                    "archivePath": str(osm_path.relative_to(ROOT)),
                    "checksumSha256": digest(osm_bytes),
                    "records": len(osm_payload.get("elements", [])),
                    "acquiredAt": acquired_at,
                }
            )

        world_cover_item = stac_item("esa-worldcover", geometry_json)
        dem_item = stac_item("cop-dem-glo-30", geometry_json)
        world_cover_url = world_cover_item["assets"]["map"]["href"]
        dem_url = dem_item["assets"]["data"]["href"]
        land_cover = land_cover_context(signed_asset(world_cover_url), geometry, world_cover_item["id"])
        terrain = terrain_context(signed_asset(dem_url), geometry, dem_item["id"])
        osm = osm_context(site_cache[site_key]["osm"], geometry)
        output_findings.append(
            {
                "findingId": finding["findingId"],
                "detectorVersion": finding["detectorVersion"],
                "geometrySha256": digest(geometry_json),
                "coordinate": finding["coordinate"],
                "roadCrossings": osm["roadCrossings"],
                "criticalAssetProximityM": osm["criticalAssetProximityM"],
                "roadContext": osm,
                "terrainContext": terrain,
                "landCoverContext": land_cover,
                "sourceProducts": {
                    "worldCover": {"itemId": world_cover_item["id"], "assetHref": world_cover_url},
                    "copernicusDem": {"itemId": dem_item["id"], "assetHref": dem_url},
                    "openStreetMapArchive": str(site_cache[site_key]["osmPath"].relative_to(ROOT)),
                },
            }
        )

    stac_records = {}
    for row in output_findings:
        for key in ("worldCover", "copernicusDem"):
            product = row["sourceProducts"][key]
            stac_records[(key, product["itemId"])] = product
    source_records.extend(
        {
            "provider": "ESA WorldCover via Microsoft Planetary Computer" if key == "worldCover" else "Copernicus DEM GLO-30 via Microsoft Planetary Computer",
            "itemId": product["itemId"],
            "assetHref": product["assetHref"],
            "acquiredAt": acquired_at,
            "qualification": "Public provider COG sampled over the exact persisted finding geometry.",
        }
        for (key, _), product in sorted(stac_records.items())
    )
    artifact = {
        "schema": "vigia.prevention.review-context.v1",
        "generatedAt": acquired_at,
        "datasetPolicy": "Every persisted real PREVENT finding is included. Context is bound to exact geometry; no findings or providers are selected by outcome.",
        "sourceState": {"path": str(STATE_PATH.relative_to(ROOT)), "checksumSha256": digest(STATE_PATH.read_bytes())},
        "sources": source_records,
        "inventory": {
            "findings": len(output_findings),
            "sites": len(site_cache),
            "roadsMeasured": sum(row["roadCrossings"] is not None for row in output_findings),
            "terrainMeasured": sum(row["terrainContext"]["state"].startswith("MEASURED") for row in output_findings),
            "landCoverMeasured": sum(row["landCoverContext"]["state"].startswith("MEASURED") for row in output_findings),
            "criticalAssetDistanceMeasured": sum(row["criticalAssetProximityM"] is not None for row in output_findings),
        },
        "integrity": {
            "syntheticEvidence": False,
            "humanLabelsGenerated": False,
            "operationalHazardClaimAllowed": False,
            "geometryBinding": "SHA256_CANONICAL_GEOJSON",
        },
        "limitations": [
            "ESA WorldCover 2021 is static land-cover context and may not represent present-day land use.",
            "Copernicus DEM describes terrain, not fuels or fire behavior.",
            "OpenStreetMap completeness varies; missing mapped assets or roads are not evidence of absence.",
            "These data make cases technically reviewable but do not replace attributable domain-expert adjudication.",
        ],
        "findings": output_findings,
    }
    artifact["evidenceHash"] = f"sha256:{digest(artifact)}"
    OUTPUT_PATH.write_text(canonical(artifact) + "\n")
    print(json.dumps({"outputPath": str(OUTPUT_PATH), "evidenceHash": artifact["evidenceHash"], "inventory": artifact["inventory"]}, indent=2))


if __name__ == "__main__":
    main()
