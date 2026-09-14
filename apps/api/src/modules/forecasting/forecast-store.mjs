import { readJson,writeJsonAtomic } from '../../shared/json-file.mjs';

const empty=()=>({schemaVersion:'vigia.forecast-store.v1',forecasts:[],receipts:[],events:[],reports:[],scores:[]});
export class ForecastStore{
  constructor({filePath,maxForecasts=2_000,maxEvents=10_000}={}){if(!filePath)throw new Error('forecast_store_path_required');Object.assign(this,{filePath,maxForecasts,maxEvents});this.state=empty();this.queue=Promise.resolve();}
  async initialize(){const loaded=await readJson(this.filePath,empty());this.state={...empty(),...loaded,scores:loaded.scores??[]};return this.status();}
  status(){return{schemaVersion:this.state.schemaVersion,forecastCount:this.state.forecasts.length,receiptCount:this.state.receipts.length,eventCount:this.state.events.length,reportCount:this.state.reports.length,scoreCount:this.state.scores.length};}
  forecasts({incidentId=null}={}){return structuredClone(this.state.forecasts.filter((item)=>!incidentId||item.incidentId===incidentId));}
  latest(incidentId=null){return this.forecasts({incidentId}).sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt))[0]??null;}
  async append({forecast,receipt,event,report=null}){return this.#serial(async()=>{const prior=this.state.forecasts.find((item)=>item.forecastId===forecast.forecastId);if(prior&&prior.outputHash!==forecast.outputHash)throw new Error('forecast_identity_conflict');if(!prior){this.state.forecasts.push(structuredClone(forecast));this.state.receipts.push(structuredClone(receipt));this.state.events.push(structuredClone(event));if(report)this.state.reports.push(structuredClone(report));}this.state.forecasts=this.state.forecasts.slice(-this.maxForecasts);this.state.receipts=this.state.receipts.slice(-this.maxForecasts);this.state.events=this.state.events.slice(-this.maxEvents);this.state.reports=this.state.reports.slice(-500);await writeJsonAtomic(this.filePath,this.state);return{duplicate:Boolean(prior),forecastId:forecast.forecastId};});}
  async appendScore(score){return this.#serial(async()=>{const prior=this.state.scores.find((item)=>item.scoreId===score.scoreId);if(prior&&prior.scoreHash!==score.scoreHash)throw new Error('forecast_score_identity_conflict');if(!prior)this.state.scores.push(structuredClone(score));this.state.scores=this.state.scores.slice(-this.maxForecasts*5);await writeJsonAtomic(this.filePath,this.state);return{duplicate:Boolean(prior),scoreId:score.scoreId};});}
  #serial(task){const next=this.queue.then(task);this.queue=next.catch(()=>{});return next;}
}
