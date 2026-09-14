#!/usr/bin/env python3
"""Uncalibrated fuel-continuity change screen using verified native S2 bands + mapped structures.
Never emits a hazard probability or physical-hazard confirmation.
"""
import json, math, sys
from safe_raster_asset import secure_scene
try:
    import numpy as np, rasterio
    from pyproj import Transformer
    from rasterio.enums import Resampling
    from rasterio.transform import from_bounds
    from rasterio.vrt import WarpedVRT
    from rasterio.warp import transform_bounds
    from shapely.geometry import Point, box, mapping
    from shapely.ops import transform as shape_transform, unary_union
except Exception as exc:
    print(json.dumps({"state":"abstained","reason":f"geospatial_runtime_unavailable:{exc}","findings":[]})); raise SystemExit(0)
CLOUD={0,1,3,8,9,10,11}; ALG='fuel_continuity_change_screen_v1'
def emit(x): print(json.dumps(x,separators=(',',':'))); raise SystemExit(0)
def grid(coordinate,radius,asset):
    lon,lat=coordinate; dy=radius/111.32; dx=radius/max(20,111.32*math.cos(math.radians(lat))); bbox=[lon-dx,lat-dy,lon+dx,lat+dy]
    with rasterio.open(asset) as ds:
        w,s,e,n=transform_bounds('EPSG:4326',ds.crs,*bbox,densify_pts=21); return ds.crs,from_bounds(w,s,e,n,256,256),256,256,bbox
def band(asset,g,nearest=False):
    """Read only the target AOI from a remote COG.

    Reading the complete 10 m Sentinel-2 tile before reprojection pulled more
    than one hundred million pixels per band and made a bounded screening run
    look hung. WarpedVRT delegates range/window reads to GDAL, so the detector
    consumes the same native pixels and geospatial transform while transferring
    only the verified analysis window.
    """
    crs,t,w,h,_=g
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif,.tiff'):
      with rasterio.open(asset) as ds:
        if not ds.crs: raise ValueError('band_crs_missing')
        with WarpedVRT(ds,crs=crs,transform=t,width=w,height=h,resampling=Resampling.nearest if nearest else Resampling.bilinear,src_nodata=ds.nodata,nodata=np.nan) as vrt:
          return vrt.read(1,masked=True).filled(np.nan).astype('float32')
def read_scene(scene,g):
    r,n,s=band(scene['red'],g),band(scene['nir'],g),band(scene['swir'],g); scl=band(scene['scl'],g,True) if scene.get('scl') else np.full_like(r,4)
    valid=np.isfinite(r)&np.isfinite(n)&np.isfinite(s)&np.isfinite(scl)&~np.isin(np.rint(scl).astype('int16'),list(CLOUD))
    ndvi=np.divide(n-r,n+r,out=np.full_like(r,np.nan),where=np.abs(n+r)>1e-6); ndmi=np.divide(n-s,n+s,out=np.full_like(r,np.nan),where=np.abs(n+s)>1e-6)
    return valid,ndvi,ndmi
def fuel_arrays(scene_arrays,ndvi_min=.28,ndmi_max=.28):
    valid,ndvi,ndmi=scene_arrays
    return valid&(ndvi>=ndvi_min)&(ndmi<=ndmi_max),valid,ndvi,ndmi
def fuel(scene,g,ndvi_min=.28,ndmi_max=.28): return fuel_arrays(read_scene(scene,g),ndvi_min,ndmi_max)
def components(mask,min_cells=18):
    h,w=mask.shape; seen=np.zeros_like(mask,dtype=bool); groups=[]
    for y in range(h):
      for x in range(w):
       if not mask[y,x] or seen[y,x]: continue
       q=[(y,x)]; seen[y,x]=True; group=[]
       while q:
        cy,cx=q.pop(); group.append((cy,cx))
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
         ny,nx=cy+dy,cx+dx
         if 0<=ny<h and 0<=nx<w and mask[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True; q.append((ny,nx))
       if len(group)>=min_cells: groups.append(group)
    return groups
def cell(r,c,t):
    x1,y1=t*(c,r); x2,y2=t*(c+1,r+1); return box(min(x1,x2),min(y1,y2),max(x1,x2),max(y1,y2))
def prepare(req):
    before,after=req['before'],req['after']; coordinate=[float(v) for v in req['coordinate']]; radius=max(.5,min(15,float(req.get('radiusKm',5)))); buildings=req.get('buildingPoints') or []
    if not buildings: return {'error':{'state':'abstained','reason':'mapped_structure_points_required','findings':[],'calibrationState':'unvalidated_screening'}}
    g=grid(coordinate,radius,after['red']); before_arrays=read_scene(before,g); after_arrays=read_scene(after,g)
    crs,t,w,h,bbox=g; to_crs=Transformer.from_crs('EPSG:4326',crs,always_xy=True); to_wgs=Transformer.from_crs(crs,'EPSG:4326',always_xy=True).transform; pts=[Point(*to_crs.transform(float(p[0]),float(p[1]))) for p in buildings if isinstance(p,list) and len(p)==2]
    return {'before':before_arrays,'after':after_arrays,'grid':g,'coordinate':coordinate,'points':pts,'to_wgs':to_wgs,'bbox':bbox}
def evaluate(req,shared,validation):
  try:
    ndvi_min=max(.20,min(.40,float(validation.get('ndviMin',.28))))
    ndmi_max=max(.18,min(.38,float(validation.get('ndmiMax',.28))))
    min_cells=max(8,min(40,int(validation.get('minimumComponentCells',18))))
    structure_distance=max(75,min(250,float(validation.get('structureDistanceM',150))))
    boundary_cells=max(2,min(8,int(validation.get('boundaryCells',4))))
    g=shared['grid']; bf,bv,_,_=fuel_arrays(shared['before'],ndvi_min,ndmi_max); af,av,ndvi,ndmi=fuel_arrays(shared['after'],ndvi_min,ndmi_max); valid=bv&av
    if float(valid.mean())<.6: return {'state':'abstained','reason':'insufficient_clear_registered_pixels','findings':[],'calibrationState':'unvalidated_screening'}
    crs,t,w,h,bbox=g; to_wgs=shared['to_wgs']; pts=shared['points']
    findings=[]; validation_components=[]; negatives=[]; rejected={}; groups=components(af&valid,min_cells)
    def reject(reason, sample):
      rejected[reason]=rejected.get(reason,0)+1
      if len(negatives)<24: negatives.append({'reason':reason,**sample})
    for group in groups:
      rows,cols=zip(*group); added=sum(1 for r,c in group if not bf[r,c]); added_fraction=added/len(group)
      geom=unary_union([cell(r,c,t) for r,c in group]).simplify(max(abs(t.a),abs(t.e))*.45,preserve_topology=True)
      edge=min(min(rows),h-1-max(rows),min(cols),w-1-max(cols))<=boundary_cells
      near=[p for p in pts if geom.distance(p)<=structure_distance]
      minx,miny,maxx,maxy=geom.bounds; span=math.hypot(maxx-minx,maxy-miny); sample={'areaM2':round(float(geom.area),1),'corridorLengthM':round(span,1),'newFuelFraction':round(added_fraction,3)}
      if req.get('validationMode'):
        validation_components.append({**sample,'geometry':mapping(shape_transform(to_wgs,geom)),'reachesBoundary':edge,'mappedStructureRelationshipAvailable':bool(pts),'nearestMappedStructureM':round(float(min((geom.distance(p) for p in pts),default=float('nan'))),1) if pts else None,'structuresWithinDistance':len(near),'passesNewFuelGate':added_fraction>=.08})
      if added_fraction<.08: reject('PERSISTENT_FUEL_NOT_NEW',sample); continue
      if not edge: reject('HIGH_CHANGE_WITHOUT_CORRIDOR_CONTINUITY',sample); continue
      if not near: reject('HIGH_CHANGE_WITHOUT_STRUCTURE_CONNECTIVITY',sample); continue
      min_dist=min(geom.distance(p) for p in near)
      values=[ndmi[r,c] for r,c in group if np.isfinite(ndmi[r,c])]
      findings.append({'kind':'fuel_continuity_change_candidate','signalStrength':'strong' if added_fraction>=.3 and min_dist<=50 else 'moderate','areaM2':round(float(geom.area),1),'corridorLengthM':round(span,1),'newFuelFraction':round(added_fraction,3),'nearestStructureM':round(float(min_dist),1),'structuresWithin150m':len(near),'medianNdmi':round(float(np.nanmedian(values)),3) if values else None,'geometry':mapping(shape_transform(to_wgs,geom))})
    findings.sort(key=lambda x:(x['structuresWithin150m'],-x['nearestStructureM'],x['areaM2']),reverse=True)
    result={'state':'screened','method':ALG,'calibrationState':'unvalidated_screening','operational':False,'confirmsHazard':False,'resolutionGate':'Sentinel-2 landscape screening only; higher-resolution or human evidence required for physical confirmation.','viewportBbox':[round(v,8) for v in bbox],'validFraction':round(float(valid.mean()),4),'findings':findings[:20],'negativeMining':{'candidateComponents':len(groups),'rejectedComponents':sum(rejected.values()),'reasonCounts':rejected,'samples':negatives,'limitations':['Agriculture, forestry operations and clearing are not labelled without authoritative land-cover/activity data.','Cloud and shadow are masked by SCL; residual edge artifacts still require review.']},'screeningDiagnostics':{'validPixelFraction':round(float(valid.mean()),4),'fuelPixelFraction':round(float((af&valid).mean()),4),'mappedStructurePoints':len(pts),'acceptedComponents':len(findings)},'provenance':{'algorithmVersion':ALG,'bands':['red','nir','swir16','scl'],'fuelScreen':{'ndviMin':ndvi_min,'ndmiMax':ndmi_max},'minimumComponentCells':min_cells,'structureDistanceM':structure_distance,'boundaryCells':boundary_cells,'parameterOverride':bool(validation),'connectivityGate':'component reaches analysis boundary and mapped structure policy radius','calibrated':False}}
    if req.get('validationMode'): result['validationComponents']=validation_components[:100]
    return result
  except Exception as exc: return {'state':'abstained','reason':f'analysis_failed:{type(exc).__name__}:{exc}','findings':[],'calibrationState':'unvalidated_screening'}
def main():
  try:
    req=json.load(sys.stdin); req['before']=secure_scene(req['before'],req.get('assetBrokerOrigin')); req['after']=secure_scene(req['after'],req.get('assetBrokerOrigin')); shared=prepare(req)
    if shared.get('error'): emit(shared['error'])
    batch=req.get('validationParameterBatch')
    if isinstance(batch,list) and batch:
      emit({'state':'batch','method':ALG,'results':[{'id':str(item.get('id') or index),'parameters':item.get('parameters') or {},'result':evaluate(req,shared,item.get('parameters') or {})} for index,item in enumerate(batch)]})
    emit(evaluate(req,shared,req.get('validationParameters') or {}))
  except Exception as exc: emit({'state':'abstained','reason':f'analysis_failed:{type(exc).__name__}:{exc}','findings':[],'calibrationState':'unvalidated_screening'})
if __name__=='__main__': main()
