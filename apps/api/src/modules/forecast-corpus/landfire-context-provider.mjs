import { trustedFetch } from '../reality-network/trusted-endpoint.mjs';

const HOST = 'lfps.usgs.gov', ROOT = `https://${HOST}/arcgis/rest/services`;
const LAYERS = Object.freeze([
  ['FUEL', 'fuel_model', 'Landfire_LF2023/LF2023_FBFM40_CONUS', 'fuel model code'],
  ['FUEL', 'canopy_cover', 'Landfire_LF2023/LF2023_CC_CONUS', 'percent'],
  ['FUEL', 'canopy_height', 'Landfire_LF2023/LF2023_CH_CONUS', 'meters'],
  ['FUEL', 'canopy_bulk_density', 'Landfire_LF2023/LF2023_CBD_CONUS', 'kg m-3'],
  ['FUEL', 'canopy_base_height', 'Landfire_LF2023/LF2023_CBH_CONUS', 'meters'],
  ['TERRAIN', 'elevation', 'Landfire_Topo/LF2020_Elev_CONUS', 'meters'],
  ['TERRAIN', 'slope', 'Landfire_Topo/LF2020_SlpD_CONUS', 'degrees'],
  ['TERRAIN', 'aspect', 'Landfire_Topo/LF2020_Asp_CONUS', 'degrees'],
]);
const tiff = (body) => body.length > 8 && (body.subarray(0, 4).equals(Buffer.from([73, 73, 42, 0])) || body.subarray(0, 4).equals(Buffer.from([77, 77, 0, 42])));
export async function acquireLandfireContext({ bbox, rawVault, manifest, fetchImpl = globalThis.fetch } = {}) {
  const layers = { FUEL: [], TERRAIN: [] }, rawProducts = [];
  for (const [kind, name, service, units] of LAYERS) {
    const query = new URLSearchParams({ bbox: bbox.join(','), bboxSR: '4326', imageSR: '4326', size: '128,128', format: 'tiff', interpolation: 'RSP_NearestNeighbor', f: 'image' });
    const response = await trustedFetch({ url: `${ROOT}/${service}/ImageServer/exportImage?${query}`, allowedHosts: [HOST], maxBytes: 8 * 1024 * 1024, timeoutMs: 30_000, accept: 'image/tiff,application/octet-stream', fetchImpl });
    if (!response.ok || !tiff(response.body)) throw new Error(`landfire_raster_invalid:${service}:${response.status}`);
    const version = kind === 'FUEL' ? 'LF2023-v2.4.0' : 'LF2020-Topo';
    const sourceTimestamp = kind === 'FUEL' ? '2024-12-31T00:00:00Z' : '2023-12-31T00:00:00Z';
    const raw = await rawVault.preserve({ providerId: 'usfs-landfire', sourceId: `landfire:${kind.toLowerCase()}:${name}`, providerProductId: `LANDFIRE:${version}:${service}:${bbox.join(',')}:128`, body: response.body, requestIdentity: response.requestIdentity, response: { ...response, sourceTimestamp }, licenceId: 'USFS-LANDFIRE-PUBLIC-DATA', parserVersion: 'vigia.landfire-tiff.v1', requestWindow: { bbox, width: 128, height: 128, resampling: 'nearest' }, fetchRunId: manifest.integrity.fingerprint, retrievedAt: response.retrievedAt });
    rawProducts.push(raw.product); layers[kind].push({ name, contentHash: `sha256:${raw.product.checksumSha256}`, rawProductId: raw.product.id, bytes: raw.product.byteLength, width: 128, height: 128, units, nodataPolicy: 'provider nodata retained; no imputation', sourceService: service });
  }
  const pack = (kind) => {
    const fuel = kind === 'FUEL';
    return { schemaVersion: 'vigia.historical-context-pack.v1', kind, datasetId: fuel ? 'USGS-LANDFIRE-LF2023' : 'USGS-LANDFIRE-LF2020-TOPO', version: fuel ? '2.4.0' : 'LF2020', referenceDate: fuel ? '2023-12-31T00:00:00Z' : '2020-12-31T00:00:00Z', availableToVigiaAt: fuel ? '2024-12-31T00:00:00Z' : '2023-12-31T00:00:00Z', availabilityBasis: 'PROVIDER_VERSION_COMPLETION_YEAR', resolution: '30 m native; bounded export resampled to 128x128', verticalDatum: fuel ? 'NOT_APPLICABLE' : 'NAVD88 (CONUS LANDFIRE LF2020 elevation source)', horizontalCrs: 'EPSG:4326 bounded export from native EPSG:5070', solverCompatibility: fuel ? 'NOT_APPLICABLE' : 'CERTIFIED_CONTEXT_INPUT', certificationBasis: fuel ? null : ['LANDFIRE LF2020 Elevation product metadata', 'LANDFIRE Technical Documentation: CONUS elevation metres referenced to NAVD88', 'Raster source, transformations, nodata and content hashes retained'], coverage: { bbox }, licenceId: 'USFS-LANDFIRE-PUBLIC-DATA', transformation: 'ArcGIS ImageServer EPSG:4326 nearest-neighbour bounded export', layers: layers[kind], limitations: fuel ? ['LF2023 represents landscape conditions through its reference year; later disturbance is not encoded.', 'Raster values are preserved but not interpreted as current fuel moisture.'] : ['Topography is treated as static context; the exported grid is not a survey of incident-time surface change.', 'NAVD88 certification applies to the CONUS elevation source; slope and aspect are angular derived products.'] };
  };
  return { fuelPack: pack('FUEL'), terrainPack: pack('TERRAIN'), rawProducts };
}
