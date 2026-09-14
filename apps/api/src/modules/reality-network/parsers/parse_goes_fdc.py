#!/usr/bin/env python3
import argparse,json,math,os,sys
import h5py
import numpy as np

FIRE_CODES={10:'GOOD',11:'SATURATED',12:'CLOUD_CONTAMINATED',13:'HIGH',14:'MEDIUM',15:'LOW',30:'TEMPORAL_GOOD',31:'TEMPORAL_SATURATED',32:'TEMPORAL_CLOUD_CONTAMINATED',33:'TEMPORAL_HIGH',34:'TEMPORAL_MEDIUM',35:'TEMPORAL_LOW'}

def scalar(value,default=None):
    try:return float(np.asarray(value).reshape(-1)[0])
    except Exception:return default

def decoded(dataset,index):
    value=scalar(dataset[index])
    if value is None:return None
    fill=scalar(dataset.attrs.get('_FillValue'))
    if fill is not None and value==fill:return None
    scale=scalar(dataset.attrs.get('scale_factor'),1.0);offset=scalar(dataset.attrs.get('add_offset'),0.0)
    result=value*scale+offset
    return result if math.isfinite(result) else None

def coordinate(x,y,projection):
    h=scalar(projection.attrs['perspective_point_height']);req=scalar(projection.attrs['semi_major_axis']);rpol=scalar(projection.attrs['semi_minor_axis']);lon0=math.radians(scalar(projection.attrs['longitude_of_projection_origin']));height=h+req
    a=math.sin(x)**2+math.cos(x)**2*(math.cos(y)**2+(req**2/rpol**2)*math.sin(y)**2)
    b=-2*height*math.cos(x)*math.cos(y);c=height**2-req**2;disc=b*b-4*a*c
    if disc<0:return None
    rs=(-b-math.sqrt(disc))/(2*a);sx=rs*math.cos(x)*math.cos(y);sy=-rs*math.sin(x);sz=rs*math.cos(x)*math.sin(y)
    lon=lon0-math.atan2(sy,height-sx);lat=math.atan((req**2/rpol**2)*sz/math.sqrt((height-sx)**2+sy**2))
    result=[math.degrees(lon),math.degrees(lat)]
    return result if -180<=result[0]<=180 and -90<=result[1]<=90 else None

def text_attr(attrs,name):
    value=attrs.get(name)
    if isinstance(value,bytes):return value.decode('utf-8','replace')
    if isinstance(value,np.ndarray) and value.size:return text_attr({name:value.reshape(-1)[0]},name)
    return str(value) if value is not None else None

def main():
    parser=argparse.ArgumentParser();parser.add_argument('path');parser.add_argument('--max-records',type=int,default=2000);args=parser.parse_args()
    size=os.path.getsize(args.path)
    if size>40*1024*1024:raise ValueError('goes_product_too_large')
    with h5py.File(args.path,'r') as file:
        required=['Mask','Power','Temp','Area','DQF','x','y','goes_imager_projection']
        if any(name not in file for name in required):raise ValueError('goes_schema_missing_required_dataset')
        mask=file['Mask'][:];indices=np.argwhere(np.isin(mask,list(FIRE_CODES)))
        truncated=len(indices)>args.max_records;indices=indices[:args.max_records]
        xset,yset=file['x'],file['y'];xscale=scalar(xset.attrs.get('scale_factor'),1);xoffset=scalar(xset.attrs.get('add_offset'),0);yscale=scalar(yset.attrs.get('scale_factor'),1);yoffset=scalar(yset.attrs.get('add_offset'),0)
        records=[]
        for row,col in indices:
            point=coordinate(float(xset[col])*xscale+xoffset,float(yset[row])*yscale+yoffset,file['goes_imager_projection'])
            if not point:continue
            code=int(mask[row,col]);records.append({'row':int(row),'column':int(col),'coordinate':point,'maskCode':code,'maskClass':FIRE_CODES[code],'frpMw':decoded(file['Power'],(row,col)),'temperatureK':decoded(file['Temp'],(row,col)),'areaM2':decoded(file['Area'],(row,col)),'dqf':int(file['DQF'][row,col])})
        bounds=file['time_bounds'][:] if 'time_bounds' in file else []
        epoch=946728000
        times=[__import__('datetime').datetime.fromtimestamp(epoch+float(v),__import__('datetime').timezone.utc).isoformat().replace('+00:00','Z') for v in bounds]
        output={'schemaVersion':'vigia.goes-fdc-parser.v1','sourcePath':os.path.basename(args.path),'product':text_attr(file.attrs,'dataset_name') or text_attr(file.attrs,'title'),'platform':text_attr(file.attrs,'platform_ID'),'instrument':text_attr(file.attrs,'instrument_type'),'processingLevel':text_attr(file.attrs,'processing_level'),'productVersion':text_attr(file.attrs,'product_version'),'observationStart':text_attr(file.attrs,'time_coverage_start') or (times[0] if times else None),'observationEnd':text_attr(file.attrs,'time_coverage_end') or (times[-1] if times else None),'records':records,'firePixelCount':int(len(np.argwhere(np.isin(mask,list(FIRE_CODES))))),'returnedCount':len(records),'truncated':truncated,'nativeShape':list(mask.shape)}
        print(json.dumps(output,separators=(',',':'),allow_nan=False))

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'error':type(error).__name__,'message':str(error)[:300]}),file=sys.stderr);sys.exit(2)
