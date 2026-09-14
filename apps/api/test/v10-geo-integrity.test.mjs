import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoIntegrityService } from '../src/modules/observations/geo-integrity-service.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const python=process.env.VIGIA_GEO_PYTHON??path.join(projectRoot,'.venv/bin/python');
function makeRaster(file,{west=-8.5,north=40.5,pixel=.001}={}){
  const code=`import rasterio, numpy as np\nfrom rasterio.transform import from_origin\np=r'''${file}'''\na=np.ones((100,100),dtype='uint16')\nwith rasterio.open(p,'w',driver='GTiff',width=100,height=100,count=1,dtype='uint16',crs='EPSG:4326',transform=from_origin(${west},${north},${pixel},${pixel})) as d:d.write(a,1)\n`;
  const result=spawnSync(python,['-c',code],{encoding:'utf8'}); if(result.status!==0)throw new Error(result.stderr);
}
function scene(asset){return{id:'s2:integrity',sensor:'Sentinel-2',bbox:[-8.5,40.4,-8.4,40.5],visualCogUrl:asset,redCogUrl:asset,nirCogUrl:asset,swir16CogUrl:asset,sclCogUrl:asset};}

test('V10 proves native raster and every science band at the selected coordinate',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vigia-geo-')); try{
    const raster=path.join(dir,'bound.tif'); makeRaster(raster);
    const service=new GeoIntegrityService({projectRoot,python}); const proof=await service.verifyScene(scene(raster),[-8.45,40.45],{scienceRequired:true});
    assert.equal(proof.state,'pixel_verified'); assert.equal(proof.renderAllowed,true); assert.equal(proof.scientificInferenceAllowed,true); assert.equal(proof.scienceBandsVerified,true);
    assert.ok(proof.proof.visual.pixel.centerOffsetPixels<=.76); assert.match(proof.bindingHash,/^[a-f0-9]{64}$/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('V10 rejects a catalog bbox that lies about where raster pixels actually are',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vigia-geo-wrong-')); try{
    const raster=path.join(dir,'wrong-place.tif'); makeRaster(raster,{west:-1,north:1,pixel:.001});
    const service=new GeoIntegrityService({projectRoot,python}); const proof=await service.verifyScene(scene(raster),[-8.45,40.45],{scienceRequired:true});
    assert.equal(proof.state,'rejected'); assert.equal(proof.renderAllowed,false); assert.equal(proof.scientificInferenceAllowed,false); assert.equal(proof.proof.visual.reason,'selected_coordinate_outside_raster');
  } finally {await rm(dir,{recursive:true,force:true});}
});
