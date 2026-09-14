import { inflateSync } from 'node:zlib';

function tiffTagArray(buffer, tag) {
  const littleEndian = buffer.toString('ascii', 0, 2) === 'II';
  if (!littleEndian || buffer.readUInt16LE(2) !== 42) throw new Error('unsupported_dem_tiff_byte_order');
  const ifdOffset = buffer.readUInt32LE(4), count = buffer.readUInt16LE(ifdOffset);
  const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8 };
  for (let index = 0; index < count; index += 1) {
    const entry = ifdOffset + 2 + index * 12;
    if (buffer.readUInt16LE(entry) !== tag) continue;
    const type = buffer.readUInt16LE(entry + 2), values = buffer.readUInt32LE(entry + 4), size = sizes[type];
    if (!size) throw new Error(`unsupported_dem_tiff_field_type:${type}`);
    const valueOffset = values * size <= 4 ? entry + 8 : buffer.readUInt32LE(entry + 8);
    return Array.from({ length: values }, (_, valueIndex) => {
      const offset = valueOffset + valueIndex * size;
      if (type === 3) return buffer.readUInt16LE(offset);
      if (type === 4) return buffer.readUInt32LE(offset);
      if (type === 11) return buffer.readFloatLE(offset);
      if (type === 12) return buffer.readDoubleLE(offset);
      return buffer.readUInt8(offset);
    });
  }
  return [];
}

function createFloatTiffReader(buffer) {
  const one = (tag) => tiffTagArray(buffer, tag)[0];
  const width = one(256), height = one(257), bits = one(258), compression = one(259), predictor = one(317), tileWidth = one(322), tileHeight = one(323), sampleFormat = one(339);
  const tileOffsets = tiffTagArray(buffer, 324), tileByteCounts = tiffTagArray(buffer, 325);
  if (![width, height, tileWidth, tileHeight].every(Number.isFinite) || bits !== 32 || compression !== 8 || predictor !== 3 || sampleFormat !== 3) throw new Error('unsupported_copernicus_dem_tiff_layout');
  const columns = Math.ceil(width / tileWidth), cache = new Map();
  const tile = (index) => {
    if (cache.has(index)) return cache.get(index);
    const offset = tileOffsets[index], byteCount = tileByteCounts[index];
    if (!Number.isFinite(offset) || !Number.isFinite(byteCount)) throw new Error('dem_tile_index_out_of_range');
    const decoded = inflateSync(buffer.subarray(offset, offset + byteCount));
    const rowBytes = tileWidth * 4;
    if (decoded.length !== rowBytes * tileHeight) throw new Error('unexpected_dem_tile_size');
    for (let row = 0; row < tileHeight; row += 1) {
      const rowOffset = row * rowBytes;
      for (let plane = 0; plane < 4; plane += 1) {
        const planeOffset = rowOffset + plane * tileWidth;
        for (let x = 1; x < tileWidth; x += 1) decoded[planeOffset + x] = (decoded[planeOffset + x] + decoded[planeOffset + x - 1]) & 255;
      }
    }
    cache.set(index, decoded);
    return decoded;
  };
  const scratch = Buffer.allocUnsafe(4);
  const valueAt = (x, y) => {
    const safeX = Math.max(0, Math.min(width - 1, Math.round(x))), safeY = Math.max(0, Math.min(height - 1, Math.round(y)));
    const tileColumn = Math.floor(safeX / tileWidth), tileRow = Math.floor(safeY / tileHeight), localX = safeX % tileWidth, localY = safeY % tileHeight;
    const decoded = tile(tileRow * columns + tileColumn), rowOffset = localY * tileWidth * 4;
    scratch[0] = decoded[rowOffset + tileWidth * 3 + localX];
    scratch[1] = decoded[rowOffset + tileWidth * 2 + localX];
    scratch[2] = decoded[rowOffset + tileWidth + localX];
    scratch[3] = decoded[rowOffset + localX];
    return scratch.readFloatLE(0);
  };
  return { width, height, tileWidth, tileHeight, valueAt };
}

export function extractTerrain(rawBuffer, bbox, source) {
  const reader = createFloatTiffReader(rawBuffer);
  const { width, height } = reader;
  const tileBounds = [-7, 37, -6, 38];
  const [west, south, east, north] = bbox;
  if (west < tileBounds[0] || south < tileBounds[1] || east > tileBounds[2] || north > tileBounds[3]) throw new Error('incident_bbox_outside_configured_dem_tile');
  const x = Math.max(0, Math.floor((west - tileBounds[0]) * width));
  const y = Math.max(0, Math.floor((tileBounds[3] - north) * height));
  const cropWidth = Math.min(width - x, Math.max(1, Math.ceil((east - west) * width)));
  const cropHeight = Math.min(height - y, Math.max(1, Math.ceil((north - south) * height)));
  const gridWidth = 80, gridHeight = 80, samplesPerAxis = 3;
  const values = Array.from({ length: gridWidth * gridHeight }, (_, index) => {
    const gridX = index % gridWidth, gridY = Math.floor(index / gridWidth);
    let total = 0;
    for (let sampleY = 0; sampleY < samplesPerAxis; sampleY += 1) for (let sampleX = 0; sampleX < samplesPerAxis; sampleX += 1) {
      const sourceX = x + (gridX + (sampleX + 0.5) / samplesPerAxis) * cropWidth / gridWidth;
      const sourceY = y + (gridY + (sampleY + 0.5) / samplesPerAxis) * cropHeight / gridHeight;
      total += reader.valueAt(sourceX, sourceY);
    }
    return total / (samplesPerAxis ** 2);
  });
  if (values.some((value) => !Number.isFinite(value))) throw new Error('non_finite_dem_value');
  const encoded = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => encoded.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), index * 2));
  const minElevationM = Math.round(Math.min(...values)), maxElevationM = Math.round(Math.max(...values));
  const meanElevationM = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return {
    schemaVersion: 'vigia.fieldnet-terrain-grid.v1', state: 'LOCAL_DEM_PACKAGED', bbox, width: gridWidth, height: gridHeight,
    encoding: 'INT16_LE_BASE64', verticalUnit: 'metre', elevationData: encoded.toString('base64'),
    statistics: { minElevationM, maxElevationM, meanElevationM },
    derivation: { sourceWidth: width, sourceHeight: height, sourcePixelFormat: 'FLOAT32', sourceTile: [reader.tileWidth, reader.tileHeight], cropPixels: [x, y, cropWidth, cropHeight], resampling: 'NINE_SAMPLE_AREA_TO_80_X_80', runtimeRendering: ['ELEVATION', 'HILLSHADE', 'SLOPE'] },
    source,
    qualification: 'Elevation values are a bounded resample of the archived Copernicus DEM GLO-30 COG. Runtime hillshade and slope are derived locally from these values.'
  };
}
