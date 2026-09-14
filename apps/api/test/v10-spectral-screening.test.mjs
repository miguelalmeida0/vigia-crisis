import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoIntegrityService } from '../src/modules/observations/geo-integrity-service.mjs';
import { GeospatialAnalysisService } from '../src/modules/observations/geospatial-analysis-service.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const python=process.env.VIGIA_GEO_PYTHON??path.join(projectRoot,'.venv/bin/python');
function buildScenes(dir){
  const code=`import rasterio, numpy as np, sys, os\nfrom pyproj import Transformer\nfrom rasterio.transform import from_origin\nout=sys.argv[1]; lon,lat=-8.0,40.0\nx,y=Transformer.from_crs('EPSG:4326','EPSG:32629',always_xy=True).transform(lon,lat)\nt=from_origin(x-1600,y+1600,10,10); shape=(320,320)\ndef w(name,a):\n p=os.path.join(out,name); d=rasterio.open(p,'w',driver='GTiff',width=320,height=320,count=1,dtype='uint16',crs='EPSG:32629',transform=t); d.write(a.astype('uint16'),1); d.close(); return p\nred=np.full(shape,1000); nir=np.full(shape,5000); swir=np.full(shape,2000); scl=np.full(shape,4)\nfor prefix in ('before','after'):\n rr=red.copy(); nn=nir.copy(); ss=swir.copy()\n if prefix=='after': rr[0:185,145:175]=1000; nn[0:185,145:175]=3500; ss[0:185,145:175]=3000\n for name,a in [('red',rr),('nir',nn),('swir',ss),('scl',scl)]: w(prefix+'-'+name+'.tif',a)\n`;
  const result=spawnSync(python,['-c',code,dir],{encoding:'utf8'}); if(result.status!==0)throw new Error(result.stderr);
  const make=(prefix,at)=>({id:`s2:${prefix}`,sensor:'Sentinel-2',acquiredAt:at,bbox:[-8.03,39.97,-7.97,40.03],visualCogUrl:path.join(dir,`${prefix}-red.tif`),redCogUrl:path.join(dir,`${prefix}-red.tif`),nirCogUrl:path.join(dir,`${prefix}-nir.tif`),swir16CogUrl:path.join(dir,`${prefix}-swir.tif`),sclCogUrl:path.join(dir,`${prefix}-scl.tif`)});
  return{before:make('before','2026-07-20T10:00:00Z'),after:make('after','2026-08-08T10:00:00Z')};
}

test('V10 server screening emits geospatial polygons without invented confidence',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vigia-spectral-')); try{
    const {before,after}=buildScenes(dir); const coordinate=[-8,40]; const integrity=new GeoIntegrityService({projectRoot,python});
    let resolvedInput=null;const fabric={resolve:async(input)=>{resolvedInput=input;return{primary:after,comparable:before,timeline:[]};}}; const service=new GeospatialAnalysisService({observationFabricService:fabric,geoIntegrityService:integrity,projectRoot,python});
    const result=await service.screenChange({coordinate,radiusKm:.8,primaryId:after.id,comparableId:before.id});
    assert.equal(resolvedInput.primaryId,after.id);assert.equal(resolvedInput.comparableId,before.id);
    assert.equal(result.state,'screened'); assert.equal(result.operational,false); assert.equal(result.calibrationState,'unvalidated_screening'); assert.ok(result.findings.length>=1);
    assert.equal(result.findings[0].geometry.type==='Polygon'||result.findings[0].geometry.type==='MultiPolygon',true); assert.ok(result.findings[0].areaM2>1000);
    assert.equal(JSON.stringify(result).includes('confidence'),false); assert.equal(result.provenance.calibrated,false); assert.ok(result.integrity.primary&&result.integrity.comparable);
  } finally {await rm(dir,{recursive:true,force:true});}
});


test('V10 fuel-continuity specialist finds only a screening candidate near mapped structures',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vigia-fuel-')); try{
    const {before,after}=buildScenes(dir); const coordinate=[-8,40]; const integrity=new GeoIntegrityService({projectRoot,python});
    const fabric={resolve:async()=>({primary:after,comparable:before,timeline:[]})}; const exposure={inspectStructures:async()=>({state:'current',buildingPoints:[[-8,40]]})};
    const service=new GeospatialAnalysisService({observationFabricService:fabric,geoIntegrityService:integrity,exposureService:exposure,projectRoot,python}); const result=await service.screenChange({coordinate,radiusKm:.8});
    const finding=result.findings.find((item)=>item.kind==='fuel_continuity_change_candidate'); assert.ok(finding); assert.ok(finding.structuresWithin150m>=1); assert.equal(result.analyses.fuelContinuity.state,'screened');
    assert.equal(result.operational,false); assert.equal(JSON.stringify(finding).includes('confidence'),false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
