const featureCollection = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(featureCollection);
  if (value.type === 'FeatureCollection') return value.features ?? [];
  if (value.type === 'Feature') return [value];
  if (value.features) return value.features.flatMap(featureCollection);
  if (value.geometry) return [{ type:'Feature', geometry:value.geometry, properties:value.properties ?? value }];
  return [];
};

const coordinatesOf = (geometry) => {
  if (!geometry) return [];
  if (geometry.type === 'Point') return [geometry.coordinates];
  const coordinates = [];
  const visit = (value) => {
    if (Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) coordinates.push([value[0], value[1]]);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry.coordinates);
  return coordinates;
};

const pointFeature = (item, kind) => {
  const geometry = item.geometry ?? item.subject?.geometry ?? (Array.isArray(item.coordinate) ? { type:'Point', coordinates:item.coordinate } : null);
  return geometry ? { type:'Feature', geometry, properties:{ ...item, kind } } : null;
};

function packagedFeatures(contract = {}) {
  const base = [
    ...featureCollection(contract.region),
    ...featureCollection(contract.incidentAnchor).map((item) => ({ ...item, properties:{ ...item.properties, kind:'INCIDENT_ANCHOR' } })),
    ...featureCollection(contract.baseLayer?.geoJson ?? contract.baseLayer?.features ?? contract.baseLayer?.data ?? contract.region?.geoJson)
  ];
  const layers = contract.layers ?? {};
  return [
    ...base.map((item) => ({ ...item, properties:{ ...item.properties, kind:item.properties?.kind ?? 'BASE' } })),
    ...(layers.regionalPhysicalObservations ?? []).map((item) => pointFeature(item, 'SATELLITE')).filter(Boolean),
    ...(layers.monitoredAssets ?? []).map((item) => pointFeature(item, 'ASSET')).filter(Boolean),
    ...(layers.localObservations ?? []).map((item) => pointFeature(item, 'FIELD')).filter(Boolean),
    ...(layers.tasks ?? []).map((item) => pointFeature(item, 'TASK')).filter(Boolean),
    ...(layers.conflicts ?? []).map((item) => pointFeature(item, 'CONFLICT')).filter(Boolean),
    ...(layers.annotations ?? []).map((item) => pointFeature(item, 'ANNOTATION')).filter(Boolean)
  ];
}

function contractBounds(contract, features) {
  const bbox = contract.region?.bbox ?? contract.baseLayer?.bbox ?? contract.region?.bounds;
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite)) return bbox;
  const points = features.flatMap((item) => coordinatesOf(item.geometry));
  if (!points.length) return [-9.55, 36.8, -6.05, 42.2];
  const xs = points.map((point) => point[0]), ys = points.map((point) => point[1]), pad = .03;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}

function terrainCanvas(terrain) {
  if (terrain?.state !== 'LOCAL_DEM_PACKAGED' || terrain.encoding !== 'INT16_LE_BASE64') return null;
  const bytes = Uint8Array.from(atob(terrain.elevationData), (character) => character.charCodeAt(0));
  const data = new DataView(bytes.buffer), width = Number(terrain.width), height = Number(terrain.height);
  if (bytes.byteLength !== width * height * 2) return null;
  const elevations = Array.from({ length: width * height }, (_, index) => data.getInt16(index * 2, true));
  const output = document.createElement('canvas'); output.width = width; output.height = height;
  const context = output.getContext('2d'), image = context.createImageData(width, height);
  const at = (x, y) => elevations[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  const min = terrain.statistics?.minElevationM ?? Math.min(...elevations), max = terrain.statistics?.maxElevationM ?? Math.max(...elevations);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const elevation = at(x, y), normalized = (elevation - min) / Math.max(1, max - min);
    const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1);
    const shade = Math.max(.35, Math.min(1.18, .78 + (-dx + dy) / 58));
    const base = normalized < .5 ? [27 + normalized * 25, 48 + normalized * 30, 34 + normalized * 12] : [46 + normalized * 32, 58 + normalized * 24, 38 + normalized * 20];
    const index = (y * width + x) * 4;
    image.data[index] = base[0] * shade; image.data[index + 1] = base[1] * shade; image.data[index + 2] = base[2] * shade; image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return { canvas:output, bbox:terrain.bbox, elevations, width, height, min, max };
}

const featureCoordinate = (feature) => feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : coordinatesOf(feature?.geometry)[0] ?? null;
const labelFor = (feature) => feature.properties?.name ?? feature.properties?.displayName ?? feature.properties?.ref ?? (feature.properties?.kind === 'PLACE' ? 'Mapped locality' : null);

export class OfflineFieldMap {
  constructor(canvas, contract, onSelect = () => {}) {
    this.canvas = canvas; this.context = canvas.getContext('2d'); this.contract = contract ?? {}; this.onSelect = onSelect;
    this.features = packagedFeatures(this.contract); this.bounds = contractBounds(this.contract, this.features); this.zoom = 1; this.offset = [0, 0]; this.drag = null; this.terrain = terrainCanvas(this.contract.baseLayer?.terrain);
    this.resize = new ResizeObserver(() => this.draw()); this.resize.observe(canvas); this.bind(); this.draw();
  }
  destroy() { this.resize.disconnect(); }
  bind() {
    this.canvas.addEventListener('pointerdown', (event) => { this.drag = [event.clientX, event.clientY, ...this.offset]; this.canvas.setPointerCapture(event.pointerId); });
    this.canvas.addEventListener('pointermove', (event) => { if (!this.drag) return; this.offset = [this.drag[2] + event.clientX - this.drag[0], this.drag[3] + event.clientY - this.drag[1]]; this.draw(); });
    this.canvas.addEventListener('pointerup', (event) => { const moved = this.drag && Math.hypot(event.clientX - this.drag[0], event.clientY - this.drag[1]); this.drag = null; if (moved < 5) this.select(event.offsetX, event.offsetY); });
    this.canvas.addEventListener('wheel', (event) => { event.preventDefault(); this.changeZoom(event.deltaY < 0 ? 1.2 : .83); }, { passive:false });
  }
  setContract(contract) { this.contract = contract ?? {}; this.features = packagedFeatures(this.contract); this.bounds = contractBounds(this.contract, this.features); this.terrain = terrainCanvas(this.contract.baseLayer?.terrain); this.reset(); }
  changeZoom(amount) { this.zoom = Math.max(1, Math.min(12, this.zoom * amount)); this.draw(); }
  reset() { this.zoom = 1; this.offset = [0, 0]; this.draw(); }
  frame(kind, id = null) {
    const feature = this.features.find((candidate) => candidate.properties?.kind === kind && (!id || [candidate.id, candidate.properties?.taskId, candidate.properties?.conflictId, candidate.properties?.observationId].includes(id))) ?? this.features.find((candidate) => candidate.properties?.kind === kind);
    const coordinate = featureCoordinate(feature); if (!coordinate) return false;
    this.zoom = kind === 'INCIDENT_ANCHOR' ? 1.8 : 4;
    const [west, south, east, north] = this.bounds, width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    this.offset = [-(((coordinate[0] - west) / Math.max(.00001, east - west) - .5) * width * this.zoom), -((.5 - (coordinate[1] - south) / Math.max(.00001, north - south)) * height * this.zoom)];
    this.draw(); this.onSelect(feature); return true;
  }
  project(coordinate) {
    const [west, south, east, north] = this.bounds, width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    const x = ((coordinate[0] - west) / Math.max(.00001, east - west) - .5) * width * this.zoom + width / 2 + this.offset[0];
    const y = (.5 - (coordinate[1] - south) / Math.max(.00001, north - south)) * height * this.zoom + height / 2 + this.offset[1];
    return [x, y];
  }
  drawGeometry(geometry) {
    const groups = geometry.type === 'Polygon' ? geometry.coordinates : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
    for (const group of groups) { this.context.beginPath(); group.forEach((point, index) => { const [x, y] = this.project(point); index ? this.context.lineTo(x, y) : this.context.moveTo(x, y); }); if (/Polygon/.test(geometry.type)) { this.context.closePath(); this.context.fill(); } this.context.stroke(); }
  }
  drawTerrain() {
    if (!this.terrain) return;
    const [west, south, east, north] = this.terrain.bbox, [left, top] = this.project([west, north]), [right, bottom] = this.project([east, south]);
    this.context.save(); this.context.imageSmoothingEnabled = true; this.context.globalAlpha = .98; this.context.drawImage(this.terrain.canvas, left, top, right - left, bottom - top); this.context.restore();
  }
  drawLineOrArea(feature) {
    const kind = feature.properties?.kind, subtype = feature.properties?.subtype, ctx = this.context;
    ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (kind === 'ROAD') {
      const major = ['motorway','trunk','primary','secondary','tertiary'].includes(subtype);
      ctx.strokeStyle = major ? '#d9c69b' : '#9a987e'; ctx.lineWidth = (major ? 2.5 : subtype === 'track' || subtype === 'path' ? 1 : 1.35) * Math.min(2, Math.sqrt(this.zoom));
      if (subtype === 'track' || subtype === 'path' || subtype === 'footway') ctx.setLineDash([5, 5]);
    } else if (kind === 'STRUCTURE') { ctx.fillStyle = '#928b78'; ctx.strokeStyle = '#c5bda8'; ctx.lineWidth = .7; }
    else if (kind === 'WATER') { ctx.fillStyle = '#173c47'; ctx.strokeStyle = '#5e929c'; ctx.lineWidth = 1.4; }
    else { ctx.fillStyle = 'rgba(31,51,38,.12)'; ctx.strokeStyle = kind === 'BASE' ? '#738674' : '#48604c'; ctx.lineWidth = 1; }
    this.drawGeometry(feature.geometry);
  }
  drawLabels() {
    const ctx = this.context, occupied = new Set(); ctx.font = '700 10px ui-monospace, SFMono-Regular, monospace'; ctx.textBaseline = 'middle';
    const candidates = this.features.filter((feature) => ['PLACE','ROAD','ASSET'].includes(feature.properties?.kind) && labelFor(feature));
    for (const feature of candidates) {
      const allCoordinates = coordinatesOf(feature.geometry), coordinate = featureCoordinate(feature) ?? allCoordinates[Math.floor(allCoordinates.length / 2)]; if (!coordinate) continue;
      const [x, y] = this.project(coordinate); if (x < 15 || y < 15 || x > this.canvas.clientWidth - 15 || y > this.canvas.clientHeight - 15) continue;
      const cell = `${Math.round(x / 85)}:${Math.round(y / 24)}`; if (occupied.has(cell)) continue; occupied.add(cell);
      const label = String(labelFor(feature)).slice(0, 28); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,16,11,.9)'; ctx.strokeText(label, x + 6, y); ctx.fillStyle = feature.properties.kind === 'PLACE' ? '#f1ead7' : '#c9c7b5'; ctx.fillText(label, x + 6, y);
    }
  }
  draw() {
    const ratio = devicePixelRatio || 1, width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio); this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const ctx = this.context; ctx.fillStyle = '#18261d'; ctx.fillRect(0, 0, width, height); this.drawTerrain();
    const linesAndAreas = this.features.filter((item) => item.geometry?.type !== 'Point');
    ['BASE','WATER','STRUCTURE','ROAD'].forEach((kind) => linesAndAreas.filter((feature) => feature.properties?.kind === kind).forEach((feature) => this.drawLineOrArea(feature)));
    const tones = { PLACE:'#f1ead7', SATELLITE:'#ef6a44', ASSET:'#e8e2d2', FIELD:'#f4c95d', TASK:'#67c9c2', CONFLICT:'#e2aa3d', ANNOTATION:'#a4aa9e', INCIDENT_ANCHOR:'#ff4430' };
    for (const feature of this.features.filter((item) => item.geometry?.type === 'Point')) {
      const [x, y] = this.project(feature.geometry.coordinates), kind = feature.properties?.kind; if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
      ctx.beginPath();
      if (kind === 'TASK') ctx.rect(x - 6, y - 6, 12, 12);
      else if (kind === 'CONFLICT') { ctx.moveTo(x, y - 8); ctx.lineTo(x + 7, y + 6); ctx.lineTo(x - 7, y + 6); ctx.closePath(); }
      else ctx.arc(x, y, kind === 'FIELD' ? 7 : kind === 'INCIDENT_ANCHOR' ? 8 : kind === 'PLACE' ? 3 : 5, 0, Math.PI * 2);
      ctx.fillStyle = tones[kind] ?? '#859188'; ctx.fill(); ctx.strokeStyle = kind === 'INCIDENT_ANCHOR' ? '#fff2e6' : '#07100b'; ctx.lineWidth = kind === 'INCIDENT_ANCHOR' ? 3 : 2; ctx.stroke();
    }
    this.drawLabels();
  }
  select(x, y) {
    const points = this.features.filter((item) => item.geometry?.type === 'Point').map((feature) => ({ feature, point:this.project(feature.geometry.coordinates) }));
    const nearest = points.sort((a, b) => Math.hypot(a.point[0] - x, a.point[1] - y) - Math.hypot(b.point[0] - x, b.point[1] - y))[0];
    if (nearest && Math.hypot(nearest.point[0] - x, nearest.point[1] - y) < 24) this.onSelect(nearest.feature);
  }
}
