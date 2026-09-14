import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { validCoordinate } from '../world/observation-validation.mjs';
import { osmElementToResponseFacility } from '../response-capability/governed-facility-repository.mjs';

const cell=([lon,lat])=>`${Math.floor(lon*4)}:${Math.floor(lat*4)}`;
export class GovernedReferenceInventory {
  constructor({projectRoot}){this.projectRoot=projectRoot;this.cells=new Map();this.sources=[];this.records=0;this.state='UNAVAILABLE';}
  async initialize(){
    try {
      const context=JSON.parse(await readFile(path.join(this.projectRoot,'data/reference/operational-proof/governed-incident-context.json'),'utf8'));
      const metadata=context.sources.openStreetMap,unique=new Map();
      for(const archive of metadata.archives){
        const filename=path.resolve(this.projectRoot,archive.path);
        if(!filename.startsWith(path.resolve(this.projectRoot,'data/reference')+path.sep))throw new Error('reference_path_outside_archive');
        const bytes=await readFile(filename);
        if(bytes.length>20*1024*1024||`sha256:${createHash('sha256').update(bytes).digest('hex')}`!==archive.sha256)throw new Error('reference_archive_integrity_failed');
        const payload=JSON.parse(bytes),receivedAt=archive.retrievedAt??metadata.retrievedAt;
        for(const element of payload.elements??[]){
          const tags=element.tags??{},coordinate=[element.lon??element.center?.lon,element.lat??element.center?.lat];
          if(!validCoordinate(coordinate))continue;
          const facility=osmElementToResponseFacility(element,{provider:metadata.provider,retrievedAt:receivedAt});
          const kind=facility?.kind??(tags.place&&/^(city|town|village|hamlet)$/.test(tags.place)?'SETTLEMENT':/^(motorway|trunk|primary|secondary)$/.test(tags.highway)?'ROAD_REFERENCE':tags.power?'POWER_INFRASTRUCTURE':tags.landuse==='industrial'||tags.amenity==='fuel'?'INDUSTRIAL_FACILITY':null);
          if(!kind)continue;
          const item={id:`osm:${element.type}:${element.id}`,name:facility?.name??tags.name??tags.ref??`Mapped ${kind.toLowerCase().replaceAll('_',' ')}`,kind,
            geometry:{type:'Point',coordinates:coordinate},coordinate,geometryRole:element.type==='node'?'MAPPED_POINT':'FEATURE_CENTRE',
            source:metadata.provider,observedAt:null,receivedAt,sourceRecordId:`${element.type}/${element.id}`,provenanceRef:archive.sha256,
            limitation:kind==='ROAD_REFERENCE'?'Distance to a mapped road feature centre, not to the road edge or an access route.':element.type==='node'?'Mapped presence does not establish operational availability or exposure.':'Mapped feature centre, not its boundary; current availability is unknown.'};
          unique.set(item.id,item);
        }
      }
      for(const item of unique.values()){const key=cell(item.coordinate);if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(item);}
      this.records=unique.size;this.state='CACHED';this.sources=[{id:'governed-osm',name:'Mapped communities, roads and facilities',provider:metadata.provider,categories:['settlements','road_geography','shelters','hospital_location','water_points','response_assets'],status:'healthy',dataClass:'CACHED',freshness:'STATIC_SNAPSHOT',lastObservationAt:null,lastIngestedAt:metadata.retrievedAt,configuration:'configured',coverage:'Checksum-verified mainland Portugal reference archive',limitation:'Archive receipt is not feature observation time. No live closure, capacity or availability claim.'}];
      const terrain=context.sources.terrain;
      if(terrain){let valid=true;try{for(const archive of terrain.archives){const filename=path.resolve(this.projectRoot,archive.path);if(!filename.startsWith(path.resolve(this.projectRoot,'data/reference')+path.sep))throw new Error('invalid_reference_path');const bytes=await readFile(filename);if(bytes.length>20*1024*1024||`sha256:${createHash('sha256').update(bytes).digest('hex')}`!==archive.sha256)throw new Error('invalid_reference_checksum');}}catch{valid=false;}
        this.sources.push({id:'governed-terrain',name:terrain.dataset,provider:terrain.provider,categories:['terrain'],status:valid?'healthy':'unavailable',dataClass:valid?'CACHED':'UNAVAILABLE',freshness:valid?'STATIC_SNAPSHOT':'UNKNOWN',lastObservationAt:null,lastIngestedAt:terrain.retrievedAt,configuration:'configured',limitation:'Static sampled elevation context, not live terrain change or complete incident terrain coverage.'});}
    }catch(error){this.state='UNAVAILABLE';this.error=String(error.message);this.cells.clear();this.records=0;}
    return{state:this.state,records:this.records,error:this.error??null};
  }
  candidates(coordinate,radiusM=25000){
    if(!validCoordinate(coordinate))return{features:[],truncated:false,total:0};
    const [lon,lat]=coordinate,dy=radiusM/110000,dx=dy/Math.max(.1,Math.cos(lat*Math.PI/180)),items=[];
    for(let x=Math.floor((lon-dx)*4);x<=Math.floor((lon+dx)*4);x++)for(let y=Math.floor((lat-dy)*4);y<=Math.floor((lat+dy)*4);y++)items.push(...(this.cells.get(`${x}:${y}`)??[]));
    const ordered=items.sort((a,b)=>((a.coordinate[0]-lon)*Math.cos(lat*Math.PI/180))**2+(a.coordinate[1]-lat)**2-(((b.coordinate[0]-lon)*Math.cos(lat*Math.PI/180))**2+(b.coordinate[1]-lat)**2)||a.id.localeCompare(b.id));
    const counts=new Map(),features=[];
    for(const item of ordered){const count=counts.get(item.kind)??0;if(count<180&&features.length<2000){features.push(item);counts.set(item.kind,count+1);}}
    return{features,truncated:features.length<ordered.length,total:ordered.length,cohortPolicy:'UP_TO_180_NEAREST_POINT_CANDIDATES_PER_CATEGORY'};
  }
}
