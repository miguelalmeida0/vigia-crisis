import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUTPUT = path.join(ROOT, 'data/replay/corpus/portugal-2024-official.json');
export const MANIFEST_OUTPUT = path.join(ROOT, 'data/replay/corpus/portugal-2024-source-manifest.json');
export const MAX_CASES = 35;

export const RAW_PRODUCTS = Object.freeze([
  {
    id: 'nasa-firms:viirs-snpp:portugal:2024', provider: 'NASA FIRMS', platform: 'Suomi NPP', instrument: 'VIIRS',
    kind: 'thermal_active_fire_archive', file: 'data/replay/raw/nasa-firms/viirs-snpp_2024_Portugal.csv',
    url: 'https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp_2024_Portugal.csv', sourceKey: 'VIIRS_SNPP_ARCHIVE',
    providerUpdatedAt: '2025-06-19T13:27:57Z'
  },
  {
    id: 'nasa-firms:viirs-noaa20:portugal:2024', provider: 'NASA FIRMS', platform: 'NOAA-20 (JPSS-1)', instrument: 'VIIRS',
    kind: 'thermal_active_fire_archive', file: 'data/replay/raw/nasa-firms/viirs-jpss1_2024_Portugal.csv',
    url: 'https://firms.modaps.eosdis.nasa.gov/data/country/viirs-jpss1_2024_Portugal.csv', sourceKey: 'VIIRS_NOAA20_ARCHIVE',
    providerUpdatedAt: '2025-06-20T16:06:59Z'
  },
  {
    id: 'ptdata:icnf-sgif:portugal:2024:min500:offset0', provider: 'api.ptdata.org', authority: 'ICNF SGIF',
    kind: 'official_fire_report_archive', file: 'data/replay/raw/ptdata/fires_2024_min500_offset000.json',
    url: 'https://api.ptdata.org/v1/civil-protection/fires?year=2024&min_area=500&limit=20&offset=0'
  },
  {
    id: 'ptdata:icnf-sgif:portugal:2024:min500:offset20', provider: 'api.ptdata.org', authority: 'ICNF SGIF',
    kind: 'official_fire_report_archive', file: 'data/replay/raw/ptdata/fires_2024_min500_offset020.json',
    url: 'https://api.ptdata.org/v1/civil-protection/fires?year=2024&min_area=500&limit=20&offset=20'
  }
]);
