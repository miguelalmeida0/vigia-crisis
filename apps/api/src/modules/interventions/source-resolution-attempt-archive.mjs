import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const rows=value=>Array.isArray(value)?value:[];
const digest=value=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function archiveEntry(job,attempt){
  const contentHash=digest(attempt),archiveId=digest(['source-resolution-attempt-archive-v1',job.jobId,contentHash]);
  return{schemaVersion:'vigia.source-resolution-attempt-archive.v1',archiveId,contentHash,jobId:job.jobId,incidentId:job.incidentId??null,requirementId:job.requirementId??null,completedAt:attempt?.completedAt??attempt?.durableReceipt?.completedAt??null,attempt};
}

export class SourceResolutionAttemptArchive{
  #filePath;#fileLabel;#hotLimit;#initialized=false;#ids=new Set();#counts=new Map();#lastCompletedAt=new Map();
  constructor({filePath,hotLimit=3}={}){
    if(!filePath)throw new Error('source_resolution_attempt_archive_path_required');
    this.#filePath=filePath;this.#fileLabel=path.basename(filePath);this.#hotLimit=Math.max(1,Number(hotLimit)||3);
  }
  async initialize(){
    if(this.#initialized)return this.status();
    try{
      const stream=createReadStream(this.#filePath,{encoding:'utf8'}),lines=readline.createInterface({input:stream,crlfDelay:Infinity});
      for await(const line of lines){
        if(!line.trim())continue;
        const entry=JSON.parse(line),expectedContentHash=digest(entry.attempt),expectedArchiveId=digest(['source-resolution-attempt-archive-v1',entry.jobId,expectedContentHash]);
        if(entry.schemaVersion!=='vigia.source-resolution-attempt-archive.v1'||entry.contentHash!==expectedContentHash||entry.archiveId!==expectedArchiveId)throw new Error('source_resolution_attempt_archive_integrity_failed');
        if(this.#ids.has(entry.archiveId))continue;
        this.#ids.add(entry.archiveId);this.#counts.set(entry.jobId,(this.#counts.get(entry.jobId)??0)+1);if(entry.completedAt)this.#lastCompletedAt.set(entry.jobId,entry.completedAt);
      }
    }catch(error){if(error.code!=='ENOENT')throw error;}
    this.#initialized=true;return this.status();
  }
  status(){return{schemaVersion:'vigia.source-resolution-attempt-archive-status.v1',state:this.#initialized?'READY':'INITIALIZING',file:this.#fileLabel,entries:this.#ids.size,hotLimit:this.#hotLimit};}
  async compact(state={}){
    await this.initialize();const jobs=rows(state.sourceResolutionJobs);let changed=false;const pending=[];
    const compacted=jobs.map(job=>{
      const history=rows(job.attemptHistory);if(history.length<=this.#hotLimit)return job;
      changed=true;const archived=history.slice(0,-this.#hotLimit),retained=history.slice(-this.#hotLimit);
      for(const attempt of archived){const entry=archiveEntry(job,attempt);if(!this.#ids.has(entry.archiveId))pending.push(entry);}
      return{...job,attemptHistory:retained};
    });
    if(pending.length){
      await mkdir(path.dirname(this.#filePath),{recursive:true,mode:0o700});
      await appendFile(this.#filePath,pending.map(entry=>JSON.stringify(entry)).join('\n')+'\n',{encoding:'utf8',mode:0o600,flag:'a'});await chmod(this.#filePath,0o600);
      for(const entry of pending){this.#ids.add(entry.archiveId);this.#counts.set(entry.jobId,(this.#counts.get(entry.jobId)??0)+1);if(entry.completedAt)this.#lastCompletedAt.set(entry.jobId,entry.completedAt);}
    }
    if(!changed)return state;
    return{...state,sourceResolutionJobs:compacted.map(job=>{
      const retained=rows(job.attemptHistory),archivedCount=this.#counts.get(job.jobId)??0,totalRetained=archivedCount+retained.length,attemptCount=Math.max(0,Number(job.attemptCount)||0);
      return{...job,attemptHistoryArchive:{schemaVersion:'vigia.source-resolution-attempt-hot-cold-retention.v1',archiveFile:this.#fileLabel,integrityState:'HASH_VERIFIED',archivedCount,retainedCount:retained.length,totalRetainedAttemptCount:totalRetained,legacyUnretainedAttemptCount:Math.max(0,attemptCount-totalRetained),lastArchivedAt:this.#lastCompletedAt.get(job.jobId)??null}};
    })};
  }
}
