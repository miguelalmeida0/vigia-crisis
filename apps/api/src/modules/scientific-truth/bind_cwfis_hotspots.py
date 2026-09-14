#!/usr/bin/env python3
import argparse,csv,datetime,hashlib,json,math,os,sys,zipfile
from collections import defaultdict

def when(value):
    if not value:return None
    try:
        result=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
        return result if result.tzinfo else result.replace(tzinfo=datetime.timezone.utc)
    except Exception:
        try:return datetime.datetime.strptime(value,'%Y-%m-%d %H:%M:%S').replace(tzinfo=datetime.timezone.utc)
        except Exception:return None

def distance(a,b):
    p=math.pi/180;dlat=(b[1]-a[1])*p;dlon=(b[0]-a[0])*p;q=math.sin(dlat/2)**2+math.cos(a[1]*p)*math.cos(b[1]*p)*math.sin(dlon/2)**2
    return 6371*2*math.atan2(math.sqrt(q),math.sqrt(1-q))

def number(value):
    try:
        result=float(value);return result if math.isfinite(result) else None
    except Exception:return None

def grid_keys(point,radius=1):
    x,y=int(math.floor(point[0])),int(math.floor(point[1]));return [(x+dx,y+dy) for dx in range(-radius,radius+1) for dy in range(-radius,radius+1)]

def lifecycle(incident):
    start=when(incident.get('officialObservedAt'))
    if not start:return None
    ends=[when(incident.get('statusAt')),when((incident.get('finalPerimeter') or {}).get('capturedAt'))]
    end=max([item for item in ends if item] or [start+datetime.timedelta(days=14)])+datetime.timedelta(days=1)
    return start-datetime.timedelta(hours=6),min(end,start+datetime.timedelta(days=30))

def main():
    parser=argparse.ArgumentParser(description='Stream and bind acquired CWFIS hotspot ZIPs without extracting them.');parser.add_argument('corpus');parser.add_argument('acquisition_state');parser.add_argument('--max-observations-per-incident',type=int,default=80);parser.add_argument('--maximum-distance-km',type=float,default=12);args=parser.parse_args()
    corpus=json.load(open(args.corpus,encoding='utf-8'));state=json.load(open(args.acquisition_state,encoding='utf-8'));products=list((state.get('products') or {}).values())
    incidents={};index=defaultdict(list)
    for item in corpus.get('incidents',[]):
        geometry=item.get('geometry') or {};coordinate=geometry.get('coordinates') if geometry.get('type')=='Point' else None;life=lifecycle(item)
        if not coordinate or not life or not item.get('id','').startswith('CA-AB-202'):continue
        year=life[0].year;record={'id':item['id'],'coordinate':coordinate[:2],'start':life[0],'end':life[1],'officialObservedAt':item.get('officialObservedAt'),'rawProductId':(item.get('lineage') or {}).get('locationRawProductId')};incidents[item['id']]=record
        for key in grid_keys(record['coordinate']):index[(year,*key)].append(record)
    sequences=defaultdict(list);seen=set();stats={'parsed':0,'withinJurisdiction':0,'deduplicatedRepublications':0,'bound':0,'ambiguous':0,'rejectedNoCandidate':0,'rejectedTemporal':0}
    archives=[]
    for product in products:
        if not str(product.get('sourceId','')).startswith('cwfis:hotspot-archive:'):continue
        relative=product.get('originalUriOrObjectKey');archive=os.path.join(os.path.dirname(args.acquisition_state),'bronze',relative) if relative else None
        if archive and os.path.isfile(archive):archives.append((archive,product))
    for archive,product in sorted(archives):
        with zipfile.ZipFile(archive) as zipped:
            for name in zipped.namelist():
                with zipped.open(name) as binary:
                    text=(line.decode('utf-8','replace') for line in binary);reader=csv.DictReader(text)
                    for row in reader:
                        stats['parsed']+=1;lat=number(row.get('lat'));lon=number(row.get('lon'));observed=when(row.get('rep_date'))
                        if lat is None or lon is None or observed is None or not (48<=lat<=61 and -122<=lon<=-108):continue
                        stats['withinJurisdiction']+=1;point=[lon,lat];identity=f"{row.get('satellite')}|{row.get('sensor')}|{row.get('source')}|{observed.isoformat()}|{lat:.4f}|{lon:.4f}"
                        physical_id='cwfis-hotspot:'+hashlib.sha256(identity.encode()).hexdigest()
                        if physical_id in seen:stats['deduplicatedRepublications']+=1;continue
                        seen.add(physical_id);spatial_by_incident={}
                        for key in grid_keys(point):
                            for incident in index.get((observed.year,*key),[]):
                                gap=distance(point,incident['coordinate'])
                                if gap<=args.maximum_distance_km and (incident['id'] not in spatial_by_incident or gap<spatial_by_incident[incident['id']][0]):spatial_by_incident[incident['id']]=(gap,incident)
                        spatial=list(spatial_by_incident.values())
                        if not spatial:stats['rejectedNoCandidate']+=1;continue
                        temporal=sorted((gap,item) for gap,item in spatial if item['start']<=observed<=item['end'])
                        if not temporal:stats['rejectedTemporal']+=1;continue
                        if len(temporal)>1 and temporal[1][0]-temporal[0][0]<3:stats['ambiguous']+=1;continue
                        gap,incident=temporal[0];record={'id':physical_id,'observedAt':observed.isoformat().replace('+00:00','Z'),'coordinate':point,'distanceKm':round(gap,4),'platform':row.get('satellite') or None,'instrument':row.get('sensor') or None,'source':row.get('source') or None,'frpMw':number(row.get('frp')),'quality':{'fwi':number(row.get('fwi'))},'providerDerivedContext':{'fuelType':row.get('fuel') or None,'elevationM':number(row.get('elev')),'slopeDegrees':number(row.get('slope')),'aspectDegrees':number(row.get('aspect'))},'causalFamily':f"{row.get('source')}:{row.get('satellite') or row.get('sensor')}",'rawObject':{'id':product.get('id'),'sha256':'sha256:'+str(product.get('checksumSha256')),'sourceTimestamp':product.get('sourceTimestamp'),'receivedAt':product.get('receivedAt')},'originalObservationIdentity':identity}
                        if len(sequences[incident['id']])<max(1,min(500,args.max_observations_per_incident)):sequences[incident['id']].append(record)
                        stats['bound']+=1
    bindings=[]
    for incident_id,observations in sorted(sequences.items()):
        observations.sort(key=lambda item:(item['observedAt'],item['id']));families=sorted(set(item['causalFamily'] for item in observations));times=sorted(set(item['observedAt'] for item in observations));bindings.append({'incidentId':incident_id,'officialObservedAt':incidents[incident_id]['officialObservedAt'],'coordinate':incidents[incident_id]['coordinate'],'observations':observations,'observationCount':len(observations),'uniqueObservationTimes':len(times),'causalFamilies':families,'multiFamilySupport':len(families)>=2,'lineage':{'officialIncidentRawProductId':incidents[incident_id]['rawProductId'],'hotspotRawProductIds':sorted(set(item['rawObject']['id'] for item in observations))}})
    output={'schemaVersion':'vigia.canada-hotspot-binding-worker.v1','doctrine':{'version':'vigia.canada-cwfis-binding.v1','maximumDistanceKm':args.maximum_distance_km,'startToleranceHours':6,'maximumLifecycleDays':30,'ambiguityDistanceMarginKm':3,'forcedJoins':False,'republicationIndependence':False},'archives':[{'id':p.get('id'),'sha256':'sha256:'+str(p.get('checksumSha256')),'bytes':p.get('byteLength')} for _,p in archives],'stats':stats,'bindings':bindings}
    print(json.dumps(output,separators=(',',':'),allow_nan=False))

if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'error':type(error).__name__,'message':str(error)[:400]}),file=sys.stderr);sys.exit(2)
