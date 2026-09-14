import { scoreIssuedForecast } from '../../../../../packages/domain/src/forecasting/index.mjs';

export class ForecastScoringController{
  constructor({store}={}){if(!store)throw new Error('forecast_scoring_store_required');this.store=store;}
  async observe({incidentId,observation}={}){const forecasts=this.store.forecasts({incidentId}).filter((item)=>item.state==='ISSUED'&&Date.parse(item.issuedAt)<Date.parse(observation.observedAt)),scores=[],excluded=[];for(const forecast of forecasts){try{const score=scoreIssuedForecast({forecast,observation});await this.store.appendScore(score);scores.push(score);}catch(error){excluded.push({forecastId:forecast.forecastId,reason:String(error.message??error)});}}return{schemaVersion:'vigia.forecast-scoring-update.v1',incidentId,observationId:observation.id,eligibleForecasts:forecasts.length,scores,excluded};}
}
