export function buildTerrainSamples(incidents, cellMetres) {
  const samples = [];
  for (const incident of incidents) {
    const [longitude, latitude] = incident.coordinate;
    const dLat = cellMetres / 110_574;
    const dLon = cellMetres / (111_320 * Math.cos(latitude * Math.PI / 180));
    for (const [position, x, y] of [['NW', -1, 1], ['N', 0, 1], ['NE', 1, 1], ['W', -1, 0], ['C', 0, 0], ['E', 1, 0], ['SW', -1, -1], ['S', 0, -1], ['SE', 1, -1]]) {
      samples.push({
        incidentId: incident.incidentId,
        position,
        latitude: latitude + y * dLat,
        longitude: longitude + x * dLon,
      });
    }
  }
  return samples;
}

export async function acquireTerrainSamples({ samples, archiveClient, pinnedFetch, sha256, sleep }) {
  const archives = [];
  const results = [];
  for (let start = 0; start < samples.length; start += 100) {
    const batch = samples.slice(start, start + 100);
    const requestIdentity = sha256(JSON.stringify(batch.map((item) => ({
      incidentId: item.incidentId,
      position: item.position,
      latitude: Number(item.latitude.toFixed(7)),
      longitude: Number(item.longitude.toFixed(7)),
    })))).slice('sha256:'.length, 'sha256:'.length + 16);
    const name = `eudem25m-${String(start / 100 + 1).padStart(3, '0')}-${requestIdentity}.json`;
    const existing = await archiveClient.readExisting(name);
    let text;
    if (existing) {
      text = existing.text;
      archives.push(existing.record);
    } else {
      const locations = batch.map((item) => `${item.latitude.toFixed(7)},${item.longitude.toFixed(7)}`).join('|');
      const url = `https://api.opentopodata.org/v1/eudem25m?locations=${encodeURIComponent(locations)}&interpolation=bilinear`;
      const response = await pinnedFetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      text = await response.text();
      if (!response.ok) throw new Error(`eudem_failed:${name}:${response.status}:${text.slice(0, 160)}`);
      archives.push(await archiveClient.writeRaw(name, text));
      await sleep(1_100);
    }
    const payload = JSON.parse(text);
    const payloadRows = Array.isArray(payload.results) ? payload.results : [];
    if (payload.status !== 'OK' || payloadRows.length !== batch.length) throw new Error(`eudem_response_invalid:${name}`);
    payloadRows.forEach((result, index) => results.push({
      ...batch[index],
      dataset: result.dataset,
      elevation: Number.isFinite(Number(result.elevation)) ? Number(result.elevation) : null,
      returnedLocation: result.location,
    }));
  }
  return { terrainArchives: archives, terrainResults: results };
}

export function projectTerrain(incident, terrainResults, cellMetres) {
  const samples = terrainResults.filter((item) => item.incidentId === incident.incidentId);
  const byPosition = new Map(samples.map((item) => [item.position, item.elevation]));
  if (samples.length !== 9 || samples.some((item) => item.elevation === null)) {
    return { state: 'OUT_OF_COVERAGE_OR_NODATA', samples };
  }
  const z = (name) => byPosition.get(name);
  const dzdx = ((z('NE') + 2 * z('E') + z('SE')) - (z('NW') + 2 * z('W') + z('SW'))) / (8 * cellMetres);
  const dzdy = ((z('NW') + 2 * z('N') + z('NE')) - (z('SW') + 2 * z('S') + z('SE'))) / (8 * cellMetres);
  const elevations = samples.map((item) => item.elevation);
  const center = z('C');
  const [longitude, latitude] = incident.coordinate;
  const dLat = cellMetres / 110_574;
  const dLon = cellMetres / (111_320 * Math.cos(latitude * Math.PI / 180));
  return {
    state: 'AVAILABLE',
    elevationM: Math.round(center),
    elevationRangeM: [Math.round(Math.min(...elevations)), Math.round(Math.max(...elevations))],
    slopeDeg: Number((Math.atan(Math.sqrt(dzdx ** 2 + dzdy ** 2)) * 180 / Math.PI).toFixed(1)),
    aspectDeg: Math.round((Math.atan2(dzdy, -dzdx) * 180 / Math.PI + 360) % 360),
    localReliefM: Math.round(Math.max(...elevations) - Math.min(...elevations)),
    ruggednessM: Number((elevations.filter((_, index) => index !== 4).reduce((sum, elevation) => sum + Math.abs(elevation - center), 0) / 8).toFixed(1)),
    samples: samples.map((item) => ({
      position: item.position,
      coordinate: [Number(item.longitude.toFixed(7)), Number(item.latitude.toFixed(7))],
      elevationM: item.elevation,
    })),
    geometry: {
      type: 'Feature',
      properties: { kind: 'TERRAIN_CONTEXT_CELL', incidentId: incident.incidentId },
      geometry: {
        type: 'Polygon',
        coordinates: [[[longitude - dLon, latitude - dLat], [longitude + dLon, latitude - dLat], [longitude + dLon, latitude + dLat], [longitude - dLon, latitude + dLat], [longitude - dLon, latitude - dLat]]],
      },
    },
  };
}
