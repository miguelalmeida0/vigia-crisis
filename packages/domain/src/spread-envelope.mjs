import { clamp, round } from './math.mjs';
import { ellipsePolygon, normalizeBearing } from './geo.mjs';

function baseRate({ riskLevel, windSpeedKph, humidityPercent, fuelFactor = 1, slopeDeg = 0 }) {
  const danger=clamp((Number(riskLevel??3)-1)/4,0,1),wind=clamp(Number(windSpeedKph??12)/55,0,1),dryness=clamp(1-Number(humidityPercent??48)/100,0,1),slope=clamp(Number(slopeDeg??0)/35,0,1);
  return clamp((.011+danger*.025+wind*.044+dryness*.019+slope*.017)*clamp(Number(fuelFactor??1),.65,1.45),.009,.14);
}
function sensitivityScale(level) { return level === 'low' ? .72 : level === 'high' ? 1.34 : 1; }
function envelope({coordinate,minute,bearing,windSpeedKph,rate,level}) {
  const scale=sensitivityScale(level),downwind=rate*minute*scale,cross=clamp(.58-Number(windSpeedKph??0)/150,.27,.58),rear=clamp(.42-Number(windSpeedKph??0)/220,.18,.42);
  const feature=ellipsePolygon({origin:coordinate,downwindKm:downwind,upwindKm:downwind*rear,crosswindKm:downwind*cross,bearingDeg:bearing});
  feature.properties={minutes:minute,scenario:`${level}_sensitivity`,sensitivity:level,downwindKm:round(downwind,2)}; return feature;
}
export function buildSpreadScenario({coordinate,riskLevel=3,windSpeedKph=12,windDirectionDeg=0,humidityPercent=48,minutes=[15,30,60],fuelFactor=1,slopeDeg=0}) {
  const bearing=normalizeBearing(windDirectionDeg),rate=baseRate({riskLevel,windSpeedKph,humidityPercent,fuelFactor,slopeDeg});
  const envelopes=minutes.map((minute)=>{const low=envelope({coordinate,minute,bearing,windSpeedKph,rate,level:'low'}),central=envelope({coordinate,minute,bearing,windSpeedKph,rate,level:'central'}),high=envelope({coordinate,minute,bearing,windSpeedKph,rate,level:'high'});return{minutes:minute,low,central,high,outer:high};});
  return {model:'deterministic-sensitivity-screen-v1',modelNotice:'Unvalidated deterministic wind/fuel sensitivity screen. Low, central and high parameter scales are not probabilities, quantiles, a wildfire forecast, evacuation order or dispatch instruction.',windDirectionDeg:bearing,windSpeedKph:Number(windSpeedKph??0),rateKmPerMinute:round(rate,4),inputs:{riskLevel:Number(riskLevel??3),humidityPercent:Number(humidityPercent??48),fuelFactor:Number(fuelFactor??1),slopeDeg:Number(slopeDeg??0)},envelopes};
}
