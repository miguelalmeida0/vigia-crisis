import { createHash } from 'node:crypto';

const finitePoint=(value)=>Array.isArray(value)&&value.length===2&&value.every((item)=>Number.isFinite(Number(item)));
const round=(value,digits=2)=>Number(Number(value).toFixed(digits));
const hash=(value)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

function exteriorRings(geometry={}){
  if(geometry.type==='Polygon')return[geometry.coordinates?.[0]].filter(Array.isArray);
  if(geometry.type==='MultiPolygon')return(geometry.coordinates??[]).map((polygon)=>polygon?.[0]).filter(Array.isArray);
  return[];
}
function ringArea(ring){
  let sum=0;for(let index=0;index<ring.length-1;index+=1)sum+=Number(ring[index][0])*Number(ring[index+1][1])-Number(ring[index+1][0])*Number(ring[index][1]);return Math.abs(sum/2);
}
function centroid(ring){
  const points=ring.filter(finitePoint).slice(0,-1),count=Math.max(1,points.length);return[round(points.reduce((sum,p)=>sum+Number(p[0]),0)/count,7),round(points.reduce((sum,p)=>sum+Number(p[1]),0)/count,7)];
}
function distanceMeters(a,b){
  const lat=(Number(a[1])+Number(b[1]))/2*Math.PI/180,dx=(Number(a[0])-Number(b[0]))*111_320*Math.cos(lat),dy=(Number(a[1])-Number(b[1]))*110_540;return Math.hypot(dx,dy);
}
function componentNodes(ring,index,totalArea){
  const clean=ring.filter(finitePoint).slice(0,-1),center=centroid(ring),stride=Math.max(1,Math.floor(clean.length/4)),anchors=[0,stride,stride*2,stride*3].map((offset)=>clean[Math.min(offset,clean.length-1)]).filter(finitePoint);
  const centerId=`fuel-component:${index}:center`,nodes=[{id:centerId,kind:'FUEL_COMPONENT',geometry:{type:'Point',coordinates:center},physicalBasis:'Sentinel-2 connected-component geometry',continuityEvidence:'PIXEL_VERIFIED',areaShare:totalArea?round(ringArea(ring)/totalArea,4):null}];
  const edges=anchors.map((coordinate,edgeIndex)=>{const id=`fuel-component:${index}:edge:${edgeIndex}`;nodes.push({id,kind:'FUEL_SEGMENT',geometry:{type:'Point',coordinates:coordinate},physicalBasis:'Vertex sampled from the persisted detector polygon'});return{id:`edge:${index}:${edgeIndex}`,from:centerId,to:id,geometry:{type:'LineString',coordinates:[center,coordinate]},distanceMeters:round(distanceMeters(center,coordinate),1),physicalBasis:'Within-component link derived from the persisted detector polygon',continuityEvidence:'GEOMETRY_BOUND_SCREENING'};});
  return{nodes,edges};
}

export function buildFuelConnectivityGraph(finding={}){
  const rings=exteriorRings(finding.geometry).filter((ring)=>ring.length>=4&&ring.every(finitePoint));
  if(!rings.length)throw new Error('fuel_graph_geometry_required');
  const totalArea=rings.reduce((sum,ring)=>sum+ringArea(ring),0),parts=rings.map((ring,index)=>componentNodes(ring,index,totalArea));
  const nodes=parts.flatMap((part)=>part.nodes),edges=parts.flatMap((part)=>part.edges),assetPaths=Math.max(0,Math.round(Number(finding.structuresWithinPolicyRadius??0)));
  const graphCore={findingId:finding.findingId,geometryBinding:finding.reviewContextBinding?.geometrySha256??null,detectorVersion:finding.detectorVersion,sceneProvenance:{currentObservationId:finding.currentObservationId,comparisonObservationId:finding.comparisonObservationId},nodes,edges,physicalBasis:{fuel:'Persisted Sentinel-2 connected-component polygons',barriers:'Geometry-bound mapped road intersections',assets:'Mapped structures within the declared 150 m policy radius'},terrain:finding.terrainContext??{state:'UNMEASURED'},landCoverContext:finding.landCoverContext??{state:'UNMEASURED'},assetRelation:{mappedStructurePaths:assetPaths,nearestStructureMeters:Number.isFinite(Number(finding.nearestStructureM))?Number(finding.nearestStructureM):null,nearestCriticalAssets:finding.roadContext?.nearestCriticalAssets??[]},barriers:{mappedRoadCrossings:Number.isFinite(Number(finding.roadCrossings))?Number(finding.roadCrossings):null,intersectingRoadIds:finding.roadContext?.intersectingRoadIds??[]},quality:{state:finding.sourceQuality?.state??'UNMEASURED',validPixelFraction:finding.sourceQuality?.validPixelFraction??null,qualification:'Component topology is review intelligence, not a fire-behavior or treatment prescription.'}};
  return{schema:'vigia.fuel-connectivity-graph.v1',version:`fuel-graph-v1:${hash(graphCore)}`,...graphCore};
}

export function buildInterventionCandidate(finding={},graph=buildFuelConnectivityGraph(finding)){
  const ranked=[...graph.edges].sort((a,b)=>a.distanceMeters-b.distanceMeters||a.id.localeCompare(b.id)),edge=ranked[0];
  if(!edge)return null;
  const beforePaths=graph.assetRelation.mappedStructurePaths,reducedPaths=beforePaths?Math.max(1,Math.ceil(beforePaths/Math.max(2,graph.edges.length))):0,afterPaths=Math.max(0,beforePaths-reducedPaths),beforeArea=Number(finding.affectedAreaHa??0),afterArea=beforePaths?beforeArea*(afterPaths/beforePaths):beforeArea;
  const connectivityReduction=beforePaths?reducedPaths/beforePaths:0,proximity=Number.isFinite(Number(finding.nearestStructureM))?Math.max(0,1-Number(finding.nearestStructureM)/150):null,assets=Math.min(1,beforePaths/5),access=Number.isFinite(Number(finding.roadCrossings))?Math.min(1,Number(finding.roadCrossings)/3):null,quality=Number.isFinite(Number(finding.sourceQuality?.validPixelFraction))?Number(finding.sourceQuality.validPixelFraction):null;
  const factors={modeledConnectivityReduction:connectivityReduction,mappedAssetPaths:assets,structureProximity:proximity,roadAccessContext:access,sourceQuality:quality},weights={modeledConnectivityReduction:.34,mappedAssetPaths:.24,structureProximity:.18,roadAccessContext:.1,sourceQuality:.14};
  const measured=Object.entries(factors).filter(([,value])=>value!==null),weight=measured.reduce((sum,[key])=>sum+weights[key],0),score=weight?Math.round(measured.reduce((sum,[key,value])=>sum+value*weights[key],0)/weight*100):null;
  const candidateCore={findingId:finding.findingId,graphVersion:graph.version,geometry:edge.geometry,candidateBreakLocation:edge.geometry.coordinates[0],affectedAssetPaths:{before:beforePaths,after:afterPaths,modeledReduction:reducedPaths},connectivity:{before:{connectedFuelAreaHa:round(beforeArea),assetConnectedPaths:beforePaths,pathRedundancy:Math.max(0,graph.edges.length-1),corridorSpanMeters:round(Number(finding.corridorLengthM??0),1)},after:{connectedFuelAreaHa:round(afterArea),assetConnectedPaths:afterPaths,pathRedundancy:Math.max(0,graph.edges.length-2),corridorSpanMeters:round(Math.max(0,Number(finding.corridorLengthM??0)-edge.distanceMeters),1)},modeledConnectivityReduction:round(connectivityReduction,4)},supportingPhysicalEvidence:{edgeId:edge.id,physicalBasis:edge.physicalBasis,sceneProvenance:graph.sceneProvenance},structuresAssetsInfluenced:{mappedStructuresWithin150m:beforePaths,nearestCriticalAssets:graph.assetRelation.nearestCriticalAssets.slice(0,5)},terrain:graph.terrain,roadsAccessContext:graph.barriers,sourceQuality:graph.quality,reviewPriority:{name:'INTERVENTION_REVIEW_PRIORITY',score,factors,weights,measuredWeight:round(weight,3)},uncertainty:['Graph represents observed component topology, not fire behavior','Mapped asset completeness varies','Candidate geometry requires expert and field review'],whySelected:`This ${Math.round(edge.distanceMeters)} m graph segment is the narrowest sampled connection in the observed component topology and controls ${reducedPaths} of ${beforePaths} modeled mapped-structure path${beforePaths===1?'':'s'}.`,requiresExpertVerification:['Confirm the original fuel-continuity finding','Confirm the segment corresponds to a meaningful physical corridor','Assess ownership, ecology, access, safety and legal constraints before any field action'],claimBoundary:'Modeled physical connectivity reduction only. This is not fire-risk reduction and not a clearing recommendation.'};
  return{schema:'vigia.intervention-candidate.v1',version:`intervention-candidate-v1:${hash(candidateCore)}`,...candidateCore};
}
