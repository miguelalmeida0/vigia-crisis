import path from 'node:path';
import { runGeospatialProcess } from './geospatial-process.mjs';

function sceneInput(scene) { return { id: scene.id, acquiredAt: scene.acquiredAt, red: scene.redCogUrl, nir: scene.nirCogUrl, swir: scene.swir16CogUrl, scl: scene.sclCogUrl }; }
function bandReady(scene) { return Boolean(scene?.redCogUrl && scene?.nirCogUrl && scene?.swir16CogUrl); }
function observationSummary(scene) { return { id:scene.id,acquiredAt:scene.acquiredAt,sensor:scene.sensor,source:scene.source,cloudCover:scene.cloudCover,resolutionMeters:scene.resolutionMeters,previewUrl:scene.imageUrl??null,visualCogUrl:scene.visualCogUrl??null,redCogUrl:scene.redCogUrl??null,nirCogUrl:scene.nirCogUrl??null,swir16CogUrl:scene.swir16CogUrl??null,sclCogUrl:scene.sclCogUrl??null,bindingHash:scene.evidenceBinding?.bindingHash??null,bindingState:scene.evidenceBinding?.state??null }; }
function deadline(promise,ms){return Promise.race([promise,new Promise((resolve)=>setTimeout(()=>resolve(null),ms))]);}
export class GeospatialAnalysisService {
  constructor({ observationFabricService, geoIntegrityService, exposureService = null, projectRoot, python = 'python3', timeoutMs = 35_000 } = {}) {
    this.fabric = observationFabricService; this.integrity = geoIntegrityService; this.exposure = exposureService; this.python = python; this.timeoutMs = timeoutMs; this.script = path.join(projectRoot, 'workers/geospatial/spectral_change.py'); this.fuelScript = path.join(projectRoot, 'workers/geospatial/fuel_continuity.py');
  }
  async screenChange({ coordinate, radiusKm = 9, primaryId = null, comparableId = null }) {
    const observation = await this.fabric.resolve({ coordinate, radiusKm, primaryId, comparableId });
    const scenes=[observation.primary,observation.comparable,...(observation.timeline??[])].filter(Boolean);
    const primary = primaryId ? scenes.find((scene)=>scene.id===primaryId) : observation.primary;
    const comparable = comparableId ? scenes.find((scene)=>scene.id===comparableId) : observation.comparable;
    if (!primary || !comparable) return { state: 'abstained', reason: primaryId || comparableId ? 'Requested observation selection is no longer available.' : 'Two comparable observations are required.', findings: [], calibrationState: 'unvalidated_screening' };
    const [primaryBinding,comparableBinding]=await Promise.all([this.integrity.verifyScene(primary,coordinate,{scienceRequired:true}),this.integrity.verifyScene(comparable,coordinate,{scienceRequired:true})]);
    primary.evidenceBinding={...primary.evidenceBinding,...primaryBinding}; comparable.evidenceBinding={...comparable.evidenceBinding,...comparableBinding};
    if (!primaryBinding.scientificInferenceAllowed || !comparableBinding.scientificInferenceAllowed) return { state: 'abstained', reason: 'Pixel-level geographic integrity has not been proven for every required science band in both observations.', findings: [], calibrationState: 'unvalidated_screening' };
    if (!bandReady(primary) || !bandReady(comparable)) return { state: 'abstained', reason: 'Native Sentinel-2 red/NIR/SWIR bands are required. Browse previews are never used for scientific screening.', findings: [], calibrationState: 'unvalidated_screening' };
    let localizedPrimary,localizedComparable;try{[localizedPrimary,localizedComparable]=await Promise.all([this.integrity.localizeScene(primary,{expectedBindings:primaryBinding.contentBindings}),this.integrity.localizeScene(comparable,{expectedBindings:comparableBinding.contentBindings})]);}catch(error){return{state:'abstained',reason:`Raster transport rejected: ${error.message}`,findings:[],calibrationState:'unvalidated_screening'};}
    const input={ coordinate, radiusKm,assetBrokerOrigin:localizedPrimary.assetBrokerOrigin??localizedComparable.assetBrokerOrigin??null,before: sceneInput(localizedComparable.scene), after: sceneInput(localizedPrimary.scene) };
    const spectralPromise=runGeospatialProcess({ python: this.python, script: this.script, timeoutMs: this.timeoutMs, input });
    const exposurePromise=this.exposure?.inspectStructures?.({lon:coordinate[0],lat:coordinate[1]}).catch(()=>null)??Promise.resolve(null);
    const [spectral,exposure]=await Promise.all([spectralPromise,deadline(exposurePromise,12_000)]);
    if (spectral.ok === false) return { state: 'abstained', reason: spectral.error ?? 'Geospatial worker unavailable.', findings: [], calibrationState: 'unvalidated_screening' };
    const fuel=exposure?.buildingPoints?.length?await runGeospatialProcess({python:this.python,script:this.fuelScript,timeoutMs:this.timeoutMs,input:{...input,buildingPoints:exposure.buildingPoints}}):{state:'abstained',reason:'mapped_structure_points_required',findings:[]};
    let finalPrimary,finalComparable;try{[finalPrimary,finalComparable]=await Promise.all([this.integrity.localizeScene(primary,{expectedBindings:primaryBinding.contentBindings}),this.integrity.localizeScene(comparable,{expectedBindings:comparableBinding.contentBindings})]);}catch(error){return{state:'abstained',reason:`Raster byte continuity rejected: ${error.message}`,findings:[],calibrationState:'unvalidated_screening'};}
    return { ...spectral, validFraction:fuel.validFraction??spectral.validFraction??null,negativeMining:fuel.negativeMining??null,screeningDiagnostics:fuel.screeningDiagnostics??null,findings:[...(spectral.findings??[]),...(fuel.findings??[])], analyses:{spectral:{state:spectral.state,method:spectral.method,findings:spectral.findings?.length??0},fuelContinuity:{state:fuel.state,method:fuel.method??null,findings:fuel.findings?.length??0,reason:fuel.reason??null}}, observations:{current:observationSummary(primary),comparison:observationSummary(comparable)}, exposure:exposure?{state:exposure.state,provider:exposure.provider,buildingCountWithin3Km:exposure.buildingCountWithin3Km,sourceRecordCount:exposure.sourceRecordCount??null,sourceChecksum:exposure.sourceChecksum??null,archivePath:exposure.archivePath??null,assets:exposure.assets??[],limitation:exposure.limitation}:null, integrity: { primary: primary.evidenceBinding.bindingHash, comparable: comparable.evidenceBinding.bindingHash,primaryContent:finalPrimary.contentBindings,comparableContent:finalComparable.contentBindings } };
  }
}
