#!/usr/bin/env python3
import argparse,json,math,os,sys
import rasterio

ELEMENTS={'UGRD':'windU10Ms','VGRD':'windV10Ms','TMP':'temperatureC','DPT':'dewpointC','APCP':'precipitationMm','GUST':'windGustMs'}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('path');parser.add_argument('--longitude',type=float,required=True);parser.add_argument('--latitude',type=float,required=True);args=parser.parse_args()
    if os.path.getsize(args.path)>20*1024*1024:raise ValueError('ecmwf_subset_too_large')
    if not(-180<=args.longitude<=180 and -90<=args.latitude<=90):raise ValueError('invalid_sample_coordinate')
    values={};native=[]
    with rasterio.open(args.path) as dataset:
        if dataset.count>16:raise ValueError('ecmwf_band_limit_exceeded')
        for index in range(1,dataset.count+1):
            tags=dataset.tags(index);element=tags.get('GRIB_ELEMENT');sample=float(next(dataset.sample([(args.longitude,args.latitude)],indexes=index))[0])
            if not math.isfinite(sample):continue
            key=ELEMENTS.get(element,f'unknownBand{index}');values[key]=sample;native.append({'band':index,'element':element,'unit':tags.get('GRIB_UNIT'),'comment':tags.get('GRIB_COMMENT'),'referenceTime':tags.get('GRIB_REF_TIME'),'validTime':tags.get('GRIB_VALID_TIME'),'forecastSeconds':tags.get('GRIB_FORECAST_SECONDS')})
    u=values.get('windU10Ms');v=values.get('windV10Ms')
    if u is not None and v is not None:
        values['windSpeedMs']=math.sqrt(u*u+v*v);values['windDirectionDeg']=(math.degrees(math.atan2(-u,-v))+360)%360
    t=values.get('temperatureC');d=values.get('dewpointC')
    if t is not None and d is not None:values['relativeHumidityPercent']=max(0,min(100,100*math.exp(17.625*d/(243.04+d))/math.exp(17.625*t/(243.04+t))))
    print(json.dumps({'schemaVersion':'vigia.ecmwf-grib-sample.v1','coordinate':[args.longitude,args.latitude],'values':values,'nativeBands':native},separators=(',',':'),allow_nan=False))

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'error':type(error).__name__,'message':str(error)[:300]}),file=sys.stderr);sys.exit(2)
