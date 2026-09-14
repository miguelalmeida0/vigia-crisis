#!/usr/bin/env python3
import argparse,hashlib,json,math,os,sys
import numpy as np
import rasterio

def sample_grid(array,nodata,size=9):
    rows=np.linspace(0,array.shape[0]-1,size).astype(int);cols=np.linspace(0,array.shape[1]-1,size).astype(int);values=[]
    for row in rows:
        values.append([None if (nodata is not None and array[row,col]==nodata) or not np.isfinite(array[row,col]) else round(float(array[row,col]),4) for col in cols])
    return values

def main():
    parser=argparse.ArgumentParser(description='Create bounded scientific summaries from retained GeoTIFF context objects.');parser.add_argument('manifest');args=parser.parse_args();manifest=json.load(open(args.manifest,encoding='utf-8'));packs=[]
    for item in manifest:
        path=item['path']
        if not os.path.isfile(path) or os.path.getsize(path)>32*1024*1024:raise ValueError('context_raster_input_invalid')
        with rasterio.open(path) as source:
            raw=source.read(1).astype(float);nodata=source.nodata;valid=np.isfinite(raw)&(raw!=nodata if nodata is not None else True);coverage=float(valid.sum()/raw.size);base={'incidentId':item['incidentId'],'coordinate':item['coordinate'],'rawProduct':item['rawProduct'],'dataset':item['dataset'],'nativeSourceResolution':item['nativeSourceResolution'],'extraction':{'shape':list(raw.shape),'crs':source.crs.to_string() if source.crs else None,'transform':list(source.transform)[:6],'nodata':nodata,'validFraction':round(coverage,6)},'boundedSamples':sample_grid(raw,nodata)}
            if item['kind']=='fuel':
                values,counts=np.unique(raw[valid].astype(int),return_counts=True) if valid.any() else ([],[]);base['fuel']={'centerCode':int(raw[raw.shape[0]//2,raw.shape[1]//2]) if valid[raw.shape[0]//2,raw.shape[1]//2] else None,'classCounts':{str(int(value)):int(count) for value,count in zip(values,counts)}}
            else:
                lat=float(item['coordinate'][1]);xmetres=max(1,abs(source.transform.a)*111320*math.cos(math.radians(lat)));ymetres=max(1,abs(source.transform.e)*110540);filled=np.where(valid,raw,np.nan);dy,dx=np.gradient(filled,ymetres,xmetres);slope=np.degrees(np.arctan(np.sqrt(dx*dx+dy*dy)));aspect=(np.degrees(np.arctan2(-dx,dy))+360)%360;svalid=np.isfinite(slope)&valid
                centre=(raw.shape[0]//2,raw.shape[1]//2);base['terrain']={'elevationM':round(float(raw[centre]),3) if valid[centre] else None,'minimumElevationM':round(float(np.nanmin(filled)),3) if valid.any() else None,'maximumElevationM':round(float(np.nanmax(filled)),3) if valid.any() else None,'meanSlopeDegrees':round(float(np.nanmean(np.where(svalid,slope,np.nan))),4) if svalid.any() else None,'meanAspectDegrees':round(float(np.nanmean(np.where(svalid,aspect,np.nan))),4) if svalid.any() else None,'slopeSamples':sample_grid(slope,None),'aspectSamples':sample_grid(aspect,None)}
            base['transformationHash']='sha256:'+hashlib.sha256(json.dumps({'version':'vigia.context-raster-transform.v1','extraction':base['extraction'],'samples':base['boundedSamples']},sort_keys=True).encode()).hexdigest();packs.append(base)
    print(json.dumps({'schemaVersion':'vigia.context-raster-packs.v1','packs':packs},separators=(',',':'),allow_nan=False))

if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'error':type(error).__name__,'message':str(error)[:400]}),file=sys.stderr);sys.exit(2)
