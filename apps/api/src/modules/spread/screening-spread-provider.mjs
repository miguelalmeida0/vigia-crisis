import { buildSpreadScenario } from '../../../../../packages/domain/src/spread-envelope.mjs';
import { windDirectionFromId } from '../../../../../packages/domain/src/geo.mjs';

export class ScreeningSpreadProvider {
  constructor(){this.id='deterministic-sensitivity-screen-v1';this.validated=false;}
  async build({incident,weather,riskLevel}) {
    const from=windDirectionFromId(weather?.windDirectionId)??0;
    const fuelFactor=Math.max(.7,Math.min(1.35,.82+Number(riskLevel??3)*.08+(100-Number(weather?.humidityPercent??48))*.002));
    const scenario=buildSpreadScenario({coordinate:incident.coordinate,riskLevel,windSpeedKph:weather?.windSpeedKph??12,windDirectionDeg:(from+180)%360,humidityPercent:weather?.humidityPercent??48,minutes:[15,30,60],fuelFactor});
    return{...scenario,provider:this.id,validated:false,modelNotice:scenario.modelNotice};
  }
}
