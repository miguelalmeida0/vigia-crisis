#!/usr/bin/env python3
import argparse,json,math,os,sys
import h5py
import numpy as np
from pyproj import CRS,Transformer

FIRE_CODES={10,11,12,13,14,15,30,31,32,33,34,35}
CLOUD_STATES={0:'VALID_CLEAR_OBSERVATION',1:'VALID_PROBABLY_CLEAR_OBSERVATION',2:'PROBABLY_CLOUDY',3:'CLOUDY'}

def scalar(value,default=None):
    try:return float(np.asarray(value).reshape(-1)[0])
    except Exception:return default

def text(value):
    if isinstance(value,bytes):return value.decode('utf-8','replace')
    if isinstance(value,np.ndarray) and value.size:return text(value.reshape(-1)[0])
    return str(value) if value is not None else None

def axis(dataset):
    scale=scalar(dataset.attrs.get('scale_factor'),1);offset=scalar(dataset.attrs.get('add_offset'),0)
    return np.asarray(dataset[:],dtype=float)*scale+offset

def index_of(values,target):
    ordered,target_value=(-values,-target) if values[0]>values[-1] else (values,target)
    index=int(np.searchsorted(ordered,target_value));choices=[max(0,min(len(values)-1,index)),max(0,min(len(values)-1,index-1))]
    return min(choices,key=lambda item:abs(values[item]-target))

def zenith(lon,lat,sub_lon,height,earth_radius):
    phi=math.radians(lat);delta=math.radians(lon-sub_lon);central=math.acos(max(-1,min(1,math.cos(phi)*math.cos(delta))))
    return math.degrees(math.atan2(math.sin(central),math.cos(central)-earth_radius/(earth_radius+height)))

def sample(fdc,acm,point,max_zenith):
    projection=fdc['goes_imager_projection'];height=scalar(projection.attrs['perspective_point_height']);major=scalar(projection.attrs['semi_major_axis']);minor=scalar(projection.attrs['semi_minor_axis']);sub_lon=scalar(projection.attrs['longitude_of_projection_origin'])
    lon,lat=float(point['coordinate'][0]),float(point['coordinate'][1]);view=zenith(lon,lat,sub_lon,height,major)
    result={'candidateId':point['id'],'coordinate':[lon,lat],'localZenithDegrees':view,'maximumUsefulZenithDegrees':max_zenith,'onEarth':False,'row':None,'column':None,'fireMaskCode':None,'fireDqf':None,'qualifyingFire':False,'cloudMaskCode':None,'cloudDqf':None,'state':'UNKNOWN','reason':'Sampling did not complete.'}
    if view>max_zenith:result.update(state='OUTSIDE_USEFUL_VIEW_GEOMETRY',reason='Computed local zenith exceeds the versioned useful-view limit.');return result
    geos=CRS.from_proj4(f'+proj=geos +h={height} +lon_0={sub_lon} +sweep=x +a={major} +b={minor} +units=m +no_defs');transformer=Transformer.from_crs('EPSG:4326',geos,always_xy=True)
    gx,gy=transformer.transform(lon,lat)
    if not math.isfinite(gx) or not math.isfinite(gy):result.update(state='OUTSIDE_COVERAGE',reason='Coordinate is not visible in the native GOES-R fixed grid.');return result
    xs,ys=axis(fdc['x']),axis(fdc['y']);column=index_of(xs,gx/height);row=index_of(ys,gy/height)
    if row<0 or column<0 or row>=fdc['Mask'].shape[0] or column>=fdc['Mask'].shape[1]:result.update(state='OUTSIDE_COVERAGE',reason='Coordinate falls outside the paired product grid.');return result
    fire_mask=int(fdc['Mask'][row,column]);fire_dqf=int(fdc['DQF'][row,column]);cloud_mask=int(acm['ACM'][row,column]);cloud_dqf=int(acm['DQF'][row,column]);qualifying=fire_mask in FIRE_CODES
    result.update(onEarth=True,row=row,column=column,fireMaskCode=fire_mask,fireDqf=fire_dqf,qualifyingFire=qualifying,cloudMaskCode=cloud_mask,cloudDqf=cloud_dqf)
    if cloud_mask==255 or fire_mask==255 or cloud_dqf in [2,255]:result.update(state='NO_DATA',reason='One or both paired products have fill/space/no-data at the target pixel.')
    elif cloud_dqf not in [0]:result.update(state='QUALITY_INSUFFICIENT',reason='Cloud-mask DQF is not good quality.')
    elif cloud_mask in [2,3]:result.update(state=CLOUD_STATES[cloud_mask],reason='ABI cloud mask reports cloud contamination at the target pixel.')
    elif fire_dqf==2:result.update(state='CLOUD_CONTAMINATED',reason='ABI FDC DQF reports opaque-cloud invalidation.')
    elif fire_dqf not in [0,1]:result.update(state='QUALITY_INSUFFICIENT',reason='ABI FDC quality is invalid for fire/free-land classification.')
    elif cloud_mask in CLOUD_STATES:result.update(state=CLOUD_STATES[cloud_mask],reason='Paired ACM and FDC pixels meet the versioned observation-opportunity quality doctrine.')
    else:result.update(state='UNKNOWN',reason='Unrecognized cloud-mask classification.')
    return result

def main():
    parser=argparse.ArgumentParser(description='Sample paired native NOAA ABI FDC/ACM pixels without emitting credentials.');parser.add_argument('fdc');parser.add_argument('acm');parser.add_argument('candidates');parser.add_argument('--max-candidates',type=int,default=200);parser.add_argument('--max-view-zenith',type=float,default=70);args=parser.parse_args()
    for file in [args.fdc,args.acm,args.candidates]:
        if not os.path.isfile(file):raise ValueError('required_input_missing')
    if os.path.getsize(args.fdc)>64*1024*1024 or os.path.getsize(args.acm)>64*1024*1024:raise ValueError('goes_product_too_large')
    points=json.load(open(args.candidates,encoding='utf-8'))[:max(1,min(500,args.max_candidates))]
    with h5py.File(args.fdc,'r') as fdc,h5py.File(args.acm,'r') as acm:
        if any(name not in fdc for name in ['Mask','DQF','x','y','goes_imager_projection']) or any(name not in acm for name in ['ACM','DQF','x','y','goes_imager_projection']):raise ValueError('paired_goes_schema_invalid')
        if fdc['Mask'].shape!=acm['ACM'].shape:raise ValueError('paired_goes_grid_shape_mismatch')
        records=[sample(fdc,acm,point,args.max_view_zenith) for point in points]
        output={'schemaVersion':'vigia.goes-paired-opportunity-parser.v1','fdcProduct':text(fdc.attrs.get('dataset_name') or fdc.attrs.get('title')),'acmProduct':text(acm.attrs.get('dataset_name') or acm.attrs.get('title')),'platform':text(fdc.attrs.get('platform_ID')),'scanStart':text(fdc.attrs.get('time_coverage_start')),'scanEnd':text(fdc.attrs.get('time_coverage_end')),'nativeShape':list(fdc['Mask'].shape),'records':records}
    print(json.dumps(output,separators=(',',':'),allow_nan=False))

if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'error':type(error).__name__,'message':str(error)[:300]}),file=sys.stderr);sys.exit(2)
