import json
import math
import sys
from shapely.geometry import shape
from shapely.ops import transform


def projected(geometry, lon0, lat0):
    scale_x = 111.32 * math.cos(math.radians(lat0))
    return transform(lambda x, y, z=None: ((x - lon0) * scale_x, (y - lat0) * 110.574), shape(geometry))


def score(predicted, observed):
    truth_ll = shape(observed)
    center = truth_ll.centroid
    truth = projected(observed, center.x, center.y)
    forecast = projected(predicted, center.x, center.y)
    if not truth.is_valid or not forecast.is_valid:
        raise ValueError("invalid_geometry")
    union = truth.union(forecast).area
    intersection = truth.intersection(forecast).area
    under = truth.difference(forecast).area
    over = forecast.difference(truth).area
    return {
        "iou": intersection / union if union else 1.0,
        "observedAreaSquareKm": truth.area,
        "forecastAreaSquareKm": forecast.area,
        "areaErrorSquareKm": forecast.area - truth.area,
        "absoluteAreaErrorSquareKm": abs(forecast.area - truth.area),
        "centroidDisplacementKm": forecast.centroid.distance(truth.centroid),
        "boundaryHausdorffDistanceKm": forecast.boundary.hausdorff_distance(truth.boundary),
        "underpredictionAreaSquareKm": under,
        "overpredictionAreaSquareKm": over,
    }


with open(sys.argv[1], "r", encoding="utf-8") as stream:
    payload = json.load(stream)
print(json.dumps(score(payload["predicted"], payload["observed"]), sort_keys=True))
