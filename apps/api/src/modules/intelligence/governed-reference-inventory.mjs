import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { validCoordinate } from '../world/observation-validation.mjs';
import { osmElementToResponseFacility } from '../response-capability/governed-facility-repository.mjs';
import { GovernedArchiveCache } from '../../shared/governed-archive-cache.mjs';

const cell = ([lon, lat]) => `${Math.floor(lon * 4)}:${Math.floor(lat * 4)}`;
const BAND_PATH_PATTERN = /osm-major-roads-band-\d+\.json$/;
const BOUNDS_INDEX_PATH = 'data/reference/operational-proof/road-bands-bounds.json';
const CONTEXT_PATH = 'data/reference/operational-proof/governed-incident-context.json';

function classify(element, provider, receivedAt, archiveSha256) {
  const tags = element.tags ?? {}, coordinate = [element.lon ?? element.center?.lon, element.lat ?? element.center?.lat];
  if (!validCoordinate(coordinate)) return null;
  const facility = osmElementToResponseFacility(element, { provider, retrievedAt: receivedAt });
  const kind = facility?.kind ?? (tags.place && /^(city|town|village|hamlet)$/.test(tags.place) ? 'SETTLEMENT' : /^(motorway|trunk|primary|secondary)$/.test(tags.highway) ? 'ROAD_REFERENCE' : tags.power ? 'POWER_INFRASTRUCTURE' : tags.landuse === 'industrial' || tags.amenity === 'fuel' ? 'INDUSTRIAL_FACILITY' : null);
  if (!kind) return null;
  return {
    id: `osm:${element.type}:${element.id}`, name: facility?.name ?? tags.name ?? tags.ref ?? `Mapped ${kind.toLowerCase().replaceAll('_', ' ')}`, kind,
    geometry: { type: 'Point', coordinates: coordinate }, coordinate, geometryRole: element.type === 'node' ? 'MAPPED_POINT' : 'FEATURE_CENTRE',
    source: provider, observedAt: null, receivedAt, sourceRecordId: `${element.type}/${element.id}`, provenanceRef: archiveSha256,
    limitation: kind === 'ROAD_REFERENCE' ? 'Distance to a mapped road feature centre, not to the road edge or an access route.' : element.type === 'node' ? 'Mapped presence does not establish operational availability or exposure.' : 'Mapped feature centre, not its boundary; current availability is unknown.'
  };
}

// The governed OSM reference set is ~46MB across 15 checksum-verified
// archives: one nationwide settlements archive, one nationwide (and shared
// with GovernedResponseFacilityRepository) response-facilities archive, and
// 13 road-band archives that ARE geographically partitioned (verified by
// direct inspection — each covers a distinct lat/lon strip of mainland
// Portugal; see road-bands-bounds.json, a precomputed, checksum-cross-checked
// index of those extents). Loading all 13 bands eagerly measured at ~62MB
// resident, permanently, for a service that only ever answers "what's near
// this one incident coordinate" — one or two bands' worth of data at a time.
// Only the two nationwide, non-partitionable archives are loaded unconditionally
// (at initialize()); road bands load on demand per query via candidates(),
// and only maxResidentBands stay resident at once (LRU-evicted), so memory
// tracks query locality instead of nationwide coverage.
export class GovernedReferenceInventory {
  constructor({ projectRoot, archiveCache = null, maxResidentBands = 4 }) {
    this.projectRoot = projectRoot;
    this.archiveCache = archiveCache ?? new GovernedArchiveCache();
    this.cells = new Map();
    this.sources = [];
    this.records = 0;
    this.state = 'UNAVAILABLE';
    this.maxResidentBands = Math.max(1, Number(maxResidentBands) || 4);
    this.bandBounds = [];
    // Map iteration order is insertion order; #touchBand re-inserts on every
    // hit, so the first key is always the least-recently-used band — a plain
    // Map is a correct, low-overhead LRU here without a separate structure.
    this.bandItems = new Map();
    this.metadata = null;
  }

  #assertGovernedPath(filename) {
    if (!filename.startsWith(path.resolve(this.projectRoot, 'data/reference') + path.sep)) throw new Error('reference_path_outside_archive');
  }

  #place(item) {
    const key = cell(item.coordinate);
    if (!this.cells.has(key)) this.cells.set(key, []);
    const arr = this.cells.get(key);
    if (!arr.some((existing) => existing.id === item.id)) arr.push(item);
  }

  async #loadArchiveElements(archive) {
    const filename = path.resolve(this.projectRoot, archive.path);
    this.#assertGovernedPath(filename);
    const shared = archive.purpose === 'RESPONSE_FACILITIES';
    const { bytes, sha256, parsed: payload } = shared
      ? await this.archiveCache.load(filename)
      : await (async () => { const bytes = await readFile(filename); return { bytes, sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, parsed: JSON.parse(bytes) }; })();
    if (bytes.length > 20 * 1024 * 1024 || sha256 !== archive.sha256) throw new Error('reference_archive_integrity_failed');
    const receivedAt = archive.retrievedAt ?? this.metadata.retrievedAt;
    let count = 0;
    for (const element of payload.elements ?? []) {
      const item = classify(element, this.metadata.provider, receivedAt, archive.sha256);
      if (item) { this.#place(item); count += 1; }
    }
    return count;
  }

  async initialize() {
    try {
      const { parsed: context } = await this.archiveCache.load(path.join(this.projectRoot, CONTEXT_PATH));
      const metadata = context.sources.openStreetMap;
      this.metadata = metadata;
      const bandArchives = metadata.archives.filter((a) => BAND_PATH_PATTERN.test(a.path));
      const nationwideArchives = metadata.archives.filter((a) => !BAND_PATH_PATTERN.test(a.path));
      for (const archive of nationwideArchives) this.records += await this.#loadArchiveElements(archive);

      const { parsed: bandsIndex } = await this.archiveCache.load(path.join(this.projectRoot, BOUNDS_INDEX_PATH));
      const registeredChecksums = new Map(bandArchives.map((a) => [a.path, a.sha256]));
      const bounds = (bandsIndex.bands ?? []).filter((b) => registeredChecksums.get(b.path) === b.sha256);
      // The precomputed index must account for every currently-registered
      // band archive with a matching checksum, or a query could silently
      // skip a region whose archive was rotated after the index was last
      // generated — fail closed (whole inventory UNAVAILABLE) rather than
      // silently under-covering incidents in that band.
      if (bounds.length !== registeredChecksums.size) throw new Error('road_band_spatial_index_stale');
      this.bandBounds = bounds.map((b) => ({ ...b, retrievedAt: metadata.archives.find((a) => a.path === b.path)?.retrievedAt }));

      this.state = 'CACHED';
      this.sources = [{ id: 'governed-osm', name: 'Mapped communities, roads and facilities', provider: metadata.provider, categories: ['settlements', 'road_geography', 'shelters', 'hospital_location', 'water_points', 'response_assets'], status: 'healthy', dataClass: 'CACHED', freshness: 'STATIC_SNAPSHOT', lastObservationAt: null, lastIngestedAt: metadata.retrievedAt, configuration: 'configured', coverage: 'Checksum-verified mainland Portugal reference archive', limitation: 'Archive receipt is not feature observation time. No live closure, capacity or availability claim.' }];
      const terrain = context.sources.terrain;
      if (terrain) {
        let valid = true;
        try { for (const archive of terrain.archives) { const filename = path.resolve(this.projectRoot, archive.path); this.#assertGovernedPath(filename); const bytes = await readFile(filename); if (bytes.length > 20 * 1024 * 1024 || `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== archive.sha256) throw new Error('invalid_reference_checksum'); } } catch { valid = false; }
        this.sources.push({ id: 'governed-terrain', name: terrain.dataset, provider: terrain.provider, categories: ['terrain'], status: valid ? 'healthy' : 'unavailable', dataClass: valid ? 'CACHED' : 'UNAVAILABLE', freshness: valid ? 'STATIC_SNAPSHOT' : 'UNKNOWN', lastObservationAt: null, lastIngestedAt: terrain.retrievedAt, configuration: 'configured', limitation: 'Static sampled elevation context, not live terrain change or complete incident terrain coverage.' });
      }
    } catch (error) {
      this.state = 'UNAVAILABLE'; this.error = String(error.message); this.cells.clear(); this.records = 0; this.bandItems.clear();
    }
    return { state: this.state, records: this.records, error: this.error ?? null };
  }

  #touchBand(bandPath) {
    const items = this.bandItems.get(bandPath);
    this.bandItems.delete(bandPath);
    this.bandItems.set(bandPath, items);
  }

  #evictOldestBand() {
    const oldestPath = this.bandItems.keys().next().value;
    const items = this.bandItems.get(oldestPath);
    this.bandItems.delete(oldestPath);
    for (const item of items.values()) {
      const key = cell(item.coordinate), arr = this.cells.get(key);
      if (!arr) continue;
      const index = arr.findIndex((existing) => existing.id === item.id);
      if (index >= 0) arr.splice(index, 1);
      if (arr.length === 0) this.cells.delete(key);
    }
    this.records -= items.size;
  }

  async #loadBand(band) {
    if (this.bandItems.has(band.path)) { this.#touchBand(band.path); return; }
    const filename = path.resolve(this.projectRoot, band.path);
    this.#assertGovernedPath(filename);
    const bytes = await readFile(filename);
    const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    // A band that fails integrity here degrades that one region rather than
    // the whole inventory — candidates() elsewhere in the country must keep
    // working; initialize() already fails closed for the archives that are
    // always resident, where the same reasoning does not apply.
    if (bytes.length > 20 * 1024 * 1024 || sha256 !== band.sha256) return;
    const payload = JSON.parse(bytes);
    const items = new Map();
    for (const element of payload.elements ?? []) {
      const item = classify(element, this.metadata.provider, band.retrievedAt ?? this.metadata.retrievedAt, band.sha256);
      if (item) items.set(item.id, item);
    }
    this.bandItems.set(band.path, items);
    for (const item of items.values()) this.#place(item);
    this.records += items.size;
    while (this.bandItems.size > this.maxResidentBands) this.#evictOldestBand();
  }

  async #ensureBands(coordinate, radiusM) {
    const [lon, lat] = coordinate, dy = radiusM / 110000, dx = dy / Math.max(.1, Math.cos(lat * Math.PI / 180));
    const needed = this.bandBounds.filter((b) => !(lat + dy < b.latMin || lat - dy > b.latMax || lon + dx < b.lonMin || lon - dx > b.lonMax));
    for (const band of needed) await this.#loadBand(band);
  }

  async candidates(coordinate, radiusM = 25000) {
    if (this.state !== 'CACHED' || !validCoordinate(coordinate)) return { features: [], truncated: false, total: 0 };
    await this.#ensureBands(coordinate, radiusM);
    const [lon, lat] = coordinate, dy = radiusM / 110000, dx = dy / Math.max(.1, Math.cos(lat * Math.PI / 180)), items = [];
    for (let x = Math.floor((lon - dx) * 4); x <= Math.floor((lon + dx) * 4); x++) for (let y = Math.floor((lat - dy) * 4); y <= Math.floor((lat + dy) * 4); y++) items.push(...(this.cells.get(`${x}:${y}`) ?? []));
    const ordered = items.sort((a, b) => ((a.coordinate[0] - lon) * Math.cos(lat * Math.PI / 180)) ** 2 + (a.coordinate[1] - lat) ** 2 - (((b.coordinate[0] - lon) * Math.cos(lat * Math.PI / 180)) ** 2 + (b.coordinate[1] - lat) ** 2) || a.id.localeCompare(b.id));
    const counts = new Map(), features = [];
    for (const item of ordered) { const count = counts.get(item.kind) ?? 0; if (count < 180 && features.length < 2000) { features.push(item); counts.set(item.kind, count + 1); } }
    return { features, truncated: features.length < ordered.length, total: ordered.length, cohortPolicy: 'UP_TO_180_NEAREST_POINT_CANDIDATES_PER_CATEGORY' };
  }
}
