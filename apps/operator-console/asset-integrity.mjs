import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const LIMITS=Object.freeze({maxDepth:64,maxEntries:8192,maxFiles:4096,maxFileBytes:16*1024*1024,maxAggregateBytes:128*1024*1024});
const sha256=(value)=>`sha256:${createHash('sha256').update(value).digest('hex')}`;

function lockedBytes(file,relative,limits){let descriptor;try{descriptor=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);const metadata=fstatSync(descriptor);if(!metadata.isFile()||metadata.size>limits.maxFileBytes)throw new Error(`operator_asset_file_invalid:${relative}`);return readFileSync(descriptor);}catch(error){if(error?.code==='ELOOP')throw new Error(`operator_asset_symlink_forbidden:${relative}`);throw error;}finally{if(descriptor!==undefined)closeSync(descriptor);}}

export function computeOperatorAssetTree(root,{limits=LIMITS}={}){
  const base=path.resolve(root),files=[];let entries=0;
  function visit(directory,depth=0){
    if(depth>limits.maxDepth)throw new Error('operator_asset_depth_exceeded');
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      entries+=1;if(entries>limits.maxEntries)throw new Error('operator_asset_entry_count_exceeded');
      const absolute=path.join(directory,entry.name),relative=path.relative(base,absolute).replaceAll(path.sep,'/'),metadata=lstatSync(absolute);
      if(metadata.isSymbolicLink())throw new Error(`operator_asset_symlink_forbidden:${relative}`);
      if(metadata.isDirectory()){visit(absolute,depth+1);continue;}
      if(!metadata.isFile())throw new Error(`operator_asset_entry_invalid:${relative}`);
      if(relative!=='build-manifest.json'){files.push({absolute,relative});if(files.length>limits.maxFiles)throw new Error('operator_asset_file_count_exceeded');}
    }
  }
  visit(base);
  let aggregateBytes=0;const assetEntries=[];
  for(const file of files.sort((left,right)=>left.relative.localeCompare(right.relative))){const bytes=lockedBytes(file.absolute,file.relative,limits);aggregateBytes+=bytes.length;if(aggregateBytes>limits.maxAggregateBytes)throw new Error('operator_asset_aggregate_bytes_exceeded');assetEntries.push({path:file.relative,sha256:sha256(bytes),bytes:bytes.length});}
  return{schemaVersion:'vigia.operator-asset-tree.v1',assetDigest:sha256(assetEntries.map((item)=>`${item.path}\0${item.sha256}`).join('\n')),files:assetEntries.length,bytes:aggregateBytes,entries:assetEntries};
}
