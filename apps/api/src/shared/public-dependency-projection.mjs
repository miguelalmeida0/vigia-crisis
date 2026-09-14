const rawErrorKey=/^(?:error|lastError|liveError|parserError|failureMessage|failureReason|avoidanceError)$/i;

function presenceKey(key){return key==='error'?'errorPresent':`${key}Present`;}

export function publicDependencyProjection(value,{maximumDepth=16,maximumEntries=100_000}={}){
  let entries=0;
  const visit=(current,depth)=>{
    if(current===null||typeof current!=='object')return current;
    if(depth>maximumDepth)throw new Error('public_projection_depth_exceeded');
    if(Array.isArray(current))return current.map((item)=>visit(item,depth+1));
    const projected={};
    for(const[key,item]of Object.entries(current)){
      entries+=1;if(entries>maximumEntries)throw new Error('public_projection_capacity_exceeded');
      if(rawErrorKey.test(key)){const flag=presenceKey(key);projected[flag]=Boolean(projected[flag]||item);continue;}
      projected[key]=visit(item,depth+1);
    }
    return projected;
  };
  return visit(value,0);
}
