import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { commandOperationalSnapshot, operatorEventProjection } from './event-routes.mjs';
import { bindEventProjection, buildCanonicalIncidentIndex } from '../../../../../packages/domain/src/event-fabric/canonical-incident-index.mjs';
import path from 'node:path';

export class OperationalEventService {
  #cached = null;
  #cachedAt = 0;
  #inflight = null;
  #generation = 0;
  #projection = null;
  constructor({ fireEventService, evidenceNeedService, projectionFile = '', incidentIndexFile = '', clock = () => new Date(), cacheMs = 30_000,onProjectionChanged=()=>{} }) {
    this.fireEventService = fireEventService;
    this.evidenceNeedService = evidenceNeedService;
    this.projectionFile = projectionFile;
    this.incidentIndexFile = incidentIndexFile || (projectionFile ? path.join(path.dirname(projectionFile), 'canonical-incident-index.production.json') : '');
    this.clock = clock;
    this.cacheMs = Math.max(0, Number(cacheMs) || 0);
    this.onProjectionChanged=onProjectionChanged;
  }

  async initialize(){this.#projection=this.projectionFile?await readJson(this.projectionFile,null):null;return{state:this.#projection?'ready':'empty',generatedAt:this.#projection?.generatedAt??null};}
  async compatibilitySnapshot(){return{generatedAt:this.#projection?.generatedAt??null,events:structuredClone(this.#projection?.operatorEvents??[])};}
  async commandSnapshot(){
    // The scheduled physical-intelligence cycle owns refresh. A read must not
    // start the expensive canonical rebuild and block sibling command routes.
    if(this.#projection?.command)return structuredClone(this.#projection.command);
    void this.snapshot().catch(()=>{});
    return{state:'loading',meta:{mode:'production',generatedAt:this.clock().toISOString(),region:'Portugal mainland',notice:'Retained event projections are loading while provider acquisition continues in the background.'},summary:{},alerts:[],clocks:{},sources:{},thermal:{state:'loading',providers:[],replaySlots:[]},events:[],eventInventory:{total:null,returned:0,truncated:false,projection:'command-summary',state:'loading'}};
  }
  async operatorEvent(id){const event=this.#projection?.operatorEvents?.find((item)=>String(item.id)===String(id));if(!event)return null;return{meta:this.#projection.meta,clocks:this.#projection.clocks,event:structuredClone(event)};}

  async snapshot({ force = false } = {}) {
    if (!force && this.#cached) {
      // Provider cycles own canonical refresh. A forensic/operator read must
      // never start the CPU-heavy association build or block command traffic.
      return structuredClone(this.#cached);
    }
    return structuredClone(await this.#refresh());
  }
  invalidate(){this.#generation+=1;this.#cached=null;this.#cachedAt=0;this.#projection=null;}

  async #refresh() {
    const requestedGeneration=this.#generation;
    if(this.#inflight){await this.#inflight;if(requestedGeneration!==this.#generation||!this.#cached)return this.#refresh();return this.#cached;}
    const buildGeneration=this.#generation;
    this.#inflight = this.#build(buildGeneration).finally(() => { this.#inflight = null; });
    return this.#inflight;
  }

  async #build(generation) {
    await this.evidenceNeedService.ingestAcceptedEvidence();
    const snapshot = await this.fireEventService.snapshot();
    await this.evidenceNeedService.sync(snapshot.events ?? []);
    const enriched = this.evidenceNeedService.enrich(snapshot);
    const projection=bindEventProjection({schema:'vigia.event-projections.v1',generatedAt:this.clock().toISOString(),meta:enriched.meta,clocks:enriched.clocks,command:commandOperationalSnapshot(enriched),operatorEvents:(enriched.events??[]).map(operatorEventProjection)}),incidentIndex=buildCanonicalIncidentIndex(projection);
    this.#projection=projection;if(this.projectionFile){await writeJsonAtomic(this.projectionFile,projection);if(this.incidentIndexFile)await writeJsonAtomic(this.incidentIndexFile,incidentIndex);}this.onProjectionChanged({incidentIds:projection.operatorEvents.map((item)=>item.id),compatibilityEvents:structuredClone(projection.operatorEvents)});
    if(generation===this.#generation){this.#cached = structuredClone(enriched);this.#cachedAt = this.clock().getTime();}
    return enriched;
  }
}
