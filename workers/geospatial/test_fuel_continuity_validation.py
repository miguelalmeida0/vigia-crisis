#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest

import numpy as np
from rasterio.transform import from_bounds
from shapely.geometry import Point

MODULE_PATH = pathlib.Path(__file__).with_name('fuel_continuity.py')
SPEC = importlib.util.spec_from_file_location('vigia_fuel_continuity', MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FuelContinuityValidationTest(unittest.TestCase):
    def shared(self):
        valid = np.ones((8, 8), dtype=bool)
        before = (valid, np.full((8, 8), .1), np.full((8, 8), .5))
        after = (valid, np.full((8, 8), .5), np.full((8, 8), .1))
        return {
            'before': before,
            'after': after,
            'grid': ('EPSG:3857', from_bounds(0, 0, 80, 80, 8, 8), 8, 8, [0, 0, 80, 80]),
            'coordinate': [0, 0],
            'points': [Point(40, 40)],
            'to_wgs': lambda x, y: (x, y),
            'bbox': [0, 0, 80, 80]
        }

    def test_production_shape_is_unchanged_without_validation_mode(self):
        result = MODULE.evaluate({}, self.shared(), {})
        self.assertEqual(result['state'], 'screened')
        self.assertEqual(len(result['findings']), 1)
        self.assertNotIn('validationComponents', result)
        self.assertFalse(result['provenance']['parameterOverride'])

    def test_validation_mode_exposes_physical_components_and_bounded_overrides(self):
        request = {'validationMode': True}
        result = MODULE.evaluate(request, self.shared(), {'ndviMin': .3, 'minimumComponentCells': 20, 'structureDistanceM': 135})
        self.assertEqual(result['state'], 'screened')
        self.assertEqual(len(result['validationComponents']), 1)
        self.assertTrue(result['validationComponents'][0]['passesNewFuelGate'])
        self.assertEqual(result['provenance']['fuelScreen']['ndviMin'], .3)
        self.assertEqual(result['provenance']['minimumComponentCells'], 20)
        self.assertTrue(result['provenance']['parameterOverride'])

    def test_parameter_overrides_are_clamped_to_declared_validation_bounds(self):
        result = MODULE.evaluate({'validationMode': True}, self.shared(), {'ndviMin': 99, 'ndmiMax': -99, 'minimumComponentCells': 1, 'structureDistanceM': 999, 'boundaryCells': 99})
        provenance = result['provenance']
        self.assertEqual(provenance['fuelScreen'], {'ndviMin': .4, 'ndmiMax': .18})
        self.assertEqual(provenance['minimumComponentCells'], 8)
        self.assertEqual(provenance['structureDistanceM'], 250)
        self.assertEqual(provenance['boundaryCells'], 8)


if __name__ == '__main__':
    unittest.main()
