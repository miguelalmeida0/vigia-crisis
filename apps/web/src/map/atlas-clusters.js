import { project } from './map-projection.js';
export function clusterIncidents(features,{detailLevel=1}={}){
  const threshold=detailLevel<1.25?72:detailLevel<1.75?42:22;
  if(detailLevel>=2.25||features.length<=3)return features.map((feature)=>({feature,count:1}));
  const groups=[];
  for(const feature of features){
    if(feature.properties.selected){groups.push({feature,count:1});continue;}
    const[x,y]=project(feature.geometry.coordinates);const group=groups.find((candidate)=>{if(candidate.feature.properties.selected||!['incident','event'].includes(candidate.feature.properties.kind))return false;const[cx,cy]=project(candidate.feature.geometry.coordinates);return Math.hypot(x-cx,y-cy)<threshold;});
    if(group){group.count+=1;if(Number(feature.properties.score)>Number(group.feature.properties.score))group.feature=feature;}else groups.push({feature,count:1});
  }
  return groups;
}
