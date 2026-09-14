import { resolveObservation } from '../../../../../packages/domain/src/observation-policy.mjs';
import { bboxCovers } from '../../../../../packages/domain/src/observation-integrity.mjs';
import { bboxAround } from '../../../../../packages/domain/src/geo.mjs';
import { nearestByCoordinate } from '../../shared/geo.mjs';
import { decorateScene, opticalScenes, selectionReason } from './observation-scene.mjs';

function boundScenes(scenes, coordinate) { return scenes.filter((scene) => !Array.isArray(scene.bbox) || bboxCovers(scene.bbox, coordinate)); }
function sourceEntry(source, scenes, role) { return { source, state: scenes.length ? 'available' : 'unavailable', role }; }
function uniqueScenes(...groups) { const map = new Map(); for (const scene of groups.flat()) if (scene?.id && !map.has(scene.id)) map.set(scene.id, scene); return [...map.values()]; }

function sameGridComparable(primary, scenes, fallback) {
  if (!primary || primary.sensor !== 'Sentinel-2') return fallback;
  const candidates = scenes.filter((scene) => scene.id !== primary.id && scene.sensor === 'Sentinel-2' && (scene.visualCogUrl || scene.previewUrl) && (!primary.gridId || !scene.gridId || scene.gridId === primary.gridId));
  const primaryMs = Date.parse(primary.acquiredAt ?? '');
  const annualTarget = 365 * 86_400_000;
  const prepared = candidates
    .map((scene) => ({ scene, gap: Math.abs(primaryMs - Date.parse(scene.acquiredAt ?? '')) }))
    .filter((item) => Number.isFinite(item.gap));
  const annual = prepared
    .filter((item) => item.gap >= 300 * 86_400_000 && item.gap <= 430 * 86_400_000)
    .sort((a,b) => Math.abs(a.gap-annualTarget)-Math.abs(b.gap-annualTarget) || Number(a.scene.cloudCover??100)-Number(b.scene.cloudCover??100));
  if (annual.length) return annual[0].scene;
  const recent = prepared
    .filter((item) => item.gap >= 21 * 86_400_000)
    .sort((a,b) => a.gap-b.gap || Number(a.scene.cloudCover??100)-Number(b.scene.cloudCover??100));
  return recent[0]?.scene ?? fallback;
}


function similarFootprint(a, b) { if (!Array.isArray(a) || !Array.isArray(b) || a.length < 4 || b.length < 4) return false; return a.slice(0,4).every((value,index)=>Math.abs(Number(value)-Number(b[index])) < .02); }
function hasPixels(scene){return Boolean(scene?.visualCogUrl||scene?.imageUrl);}
function scienceBound(scene){return scene?.evidenceBinding?.scientificInferenceAllowed === true;}
function renderBound(scene){return scene?.evidenceBinding?.renderAllowed === true;}
function changeScreeningState(primary, comparable) {
  const sameSensor = primary?.sensor === 'Sentinel-2' && comparable?.sensor === 'Sentinel-2';
  const distinct = Boolean(primary?.id && comparable?.id && primary.id !== comparable.id);
  const sameGrid = primary?.gridId && comparable?.gridId ? primary.gridId === comparable.gridId : similarFootprint(primary?.bbox, comparable?.bbox);
  const nativeBands = Boolean(primary?.redCogUrl && primary?.nirCogUrl && comparable?.redCogUrl && comparable?.nirCogUrl);
  const renderable = hasPixels(primary) && hasPixels(comparable) && renderBound(primary) && renderBound(comparable);
  const integrity = scienceBound(primary) && scienceBound(comparable);
  const eligible = sameSensor && distinct && sameGrid && renderable && nativeBands && integrity;
  const reason = eligible ? 'Native Sentinel-2 bands passed pixel-level geographic integrity gates and are eligible for server-side screening.'
    : sameSensor && distinct && sameGrid && renderable && !nativeBands ? 'Native red/NIR/SWIR bands are unavailable. Browse previews are visual context only and will not be analysed.'
      : sameSensor && distinct && sameGrid && nativeBands && !integrity ? 'Pixel-level geographic integrity has not been proven for both observations.'
      : !sameSensor ? 'Optical change screening requires two Sentinel-2 observations.'
        : !distinct ? 'A distinct comparison observation is required.'
          : !sameGrid ? 'Comparison scenes are not on the same Sentinel-2 grid.'
            : 'Both observations must have renderable source pixels.';
  return { eligible, nativeBands, integrityVerified: integrity, reason, method: eligible ? 'server_sentinel2_spectral_screening_v2' : null, calibrationState: 'unvalidated_screening', operational: false, confirmsHazard: false };
}

function visualState(primary, fallback) {
  if (primary?.evidenceBinding?.renderAllowed && primary?.visualCogUrl) return { state: 'selected_scene', sensor: primary.sensor, source: primary.source, acquiredAt: primary.acquiredAt, resolutionMeters: primary.resolutionMeters ?? null, sameScene: true, inspection: 'native_cog' };
  if (fallback?.imageUrl) return { state: 'cross_sensor_context', sensor: fallback.sensor, source: fallback.source, acquiredAt: fallback.acquiredDate, resolutionMeters: null, sameScene: false, inspection: 'broad_context_only' };
  return { state: 'metadata_only', sensor: null, source: null, acquiredAt: null, resolutionMeters: null, sameScene: false, inspection: 'unavailable' };
}

export class ObservationFabricService {
  constructor({ worldService, sentinel1Gateway, earthSearchGateway, highResStacGateway, currentImageryService, imageryService, geoIntegrityService, clock = () => new Date() }) { Object.assign(this, { worldService, sentinel1Gateway, earthSearchGateway, highResStacGateway, currentImageryService, imageryService, geoIntegrityService, clock }); }

  async resolve({ coordinate, radiusKm = 9, primaryId = null, comparableId = null }) {
    const [world, radarRegions, earthScenes, highResScenes] = await Promise.all([
      this.worldService.snapshot(),
      this.sentinel1Gateway.snapshot(),
      this.earthSearchGateway?.scenes({ coordinate, radiusKm }) ?? [],
      this.highResStacGateway?.scenes({ coordinate, radiusKm }) ?? []
    ]);
    const opticalRegion = nearestByCoordinate(coordinate, world.earthObservations ?? [])?.item ?? null;
    const radarRegion = nearestByCoordinate(coordinate, radarRegions)?.item ?? null;
    const cdseOptical = boundScenes(opticalScenes(opticalRegion), coordinate);
    const earthOptical = boundScenes(earthScenes, coordinate);
    const highResOptical=boundScenes(highResScenes??[],coordinate);
    const optical = uniqueScenes(highResOptical, earthOptical, cdseOptical);
    const radar = boundScenes((radarRegion?.scenes ?? []).map((scene) => ({ ...scene, kind: 'radar', resolutionMeters: scene.resolutionMeters ?? 20 })), coordinate);
    const baselinePair = this.imageryService.observationPair({ lon: coordinate[0], lat: coordinate[1], radiusKm });
    const resolution = resolveObservation({ optical, radar, baseline: [], now: this.clock() });
    const allScenes = [...optical, ...radar].sort((a, b) => Date.parse(b.acquiredAt) - Date.parse(a.acquiredAt));
    const decorate = (scene, scienceRequired=false) => decorateScene(scene, { coordinate, currentImageryService: this.currentImageryService, geoIntegrityService: this.geoIntegrityService, clock: this.clock, scienceRequired });
    const requestedPrimary = primaryId ? allScenes.find((scene)=>String(scene.id)===String(primaryId)) : null;
    const primaryRaw = requestedPrimary ?? resolution.primary;
    const requestedComparable = comparableId ? allScenes.find((scene)=>String(scene.id)===String(comparableId)) : null;
    const comparableRaw = requestedComparable ?? sameGridComparable(primaryRaw, allScenes, resolution.comparable);
    const [primary, comparable, ...timelineValues] = await Promise.all([decorate(primaryRaw,true), decorate(comparableRaw,true), ...allScenes.slice(0, 12).map((scene)=>decorate(scene,false))]);
    const timeline = timelineValues.filter(Boolean);
    const fallbackVisual = primary && !primary?.evidenceBinding?.renderAllowed && primary.acquiredAt
      ? { ...this.currentImageryService.frameDescriptor({ coordinate, date: primary.acquiredAt, radiusKm }), role: 'broad_visual_fallback', linkedSceneId: primary.id }
      : null;
    const visual = visualState(primary, fallbackVisual);
    const changeScreening = changeScreeningState(primary, comparable);
    return {
      generatedAt: this.clock().toISOString(), coordinate, viewportBbox: bboxAround(coordinate, radiusKm), mode: world.meta.mode,
      currentCondition: primary ? (primary.evidenceBinding?.renderAllowed ? resolution.currentCondition : 'metadata_current_pixels_unavailable') : 'unavailable', catalogCondition: resolution.currentCondition, visualState: visual.state, visual,
      primary, comparable, fallbackVisual, timeline, changeScreening,
      selectionReason: requestedPrimary
        ? { selected:[`Pinned to persisted detector evidence ${requestedPrimary.id}.`],rejected:allScenes.filter((scene)=>scene.id!==requestedPrimary.id).slice(0,3).map((scene)=>({sensor:scene.sensor??scene.id,reason:'Not the observation bound to this detector finding.'})) }
        : selectionReason(resolution.primary, allScenes, this.clock()),
      radarFallback: resolution.radarFallback,
      baseline: { ...baselinePair, role: 'historical_baseline', operational: false },
      access: {
        metadata: primary ? 'available' : 'unavailable',
        selectedScenePixels: primary?.evidenceBinding?.renderAllowed && primary?.visualCogUrl ? 'native_cog_verified' : 'unavailable',
        visualInspection: visual.inspection,
        confirmation: 'human_or_higher_confidence_evidence_required'
      },
      sourceLadder: [
        ...(highResOptical.length?[sourceEntry('Configured high-resolution optical', highResOptical, 'sub-10 m visual inspection')]:[]),
        sourceEntry('Earth Search Sentinel-2', earthOptical, 'preferred native COG + browse optical'),
        sourceEntry('Copernicus Data Space Sentinel-2', cdseOptical, 'authoritative catalogue'),
        sourceEntry('Sentinel-1 radar', radar, 'cloud-independent fallback'),
        { source: 'NASA VIIRS', state: 'fallback', role: 'broad visual context' },
        { source: 'Field / camera / drone evidence', state: 'availability_unresolved', role: 'attributable confirmation only after an owned request is acknowledged' }
      ],
      notice: visual.state === 'selected_scene'
        ? (primary?.evidenceBinding?.pixelVerified ? 'Native raster pixels passed CRS/geotransform round-trip verification for the selected coordinate.' : 'Selected pixels have not passed the geographic integrity gate.')
        : visual.state === 'cross_sensor_context'
          ? 'Selected-scene pixels are unavailable. A different sensor is shown only as broad context and cannot confirm a physical hazard.'
          : 'No renderable current observation is available.',
      safety: 'Remote-sensing imagery is decision context. Current physical conditions still require appropriate confirmation.'
    };
  }
}
