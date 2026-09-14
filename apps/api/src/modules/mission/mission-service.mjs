export class MissionService {
  constructor({ worldService, preventionService, detectionService, commandService }) {
    this.worldService = worldService;
    this.preventionService = preventionService;
    this.detectionService = detectionService;
    this.commandService = commandService;
  }

  async snapshot() {
    const [world, prevention, detection] = await Promise.all([
      this.worldService.snapshot(),
      this.preventionService.snapshot({publicProjection:true}),
      this.detectionService.snapshot({publicProjection:true})
    ]);
    const operatorState = this.commandService.snapshot();
    const operator = {restricted:true,summary:{openEvidenceRequests:(operatorState.evidenceRequests??[]).filter((item)=>!['accepted','rejected','cancelled'].includes(item.state)).length,verifiedHazards:(operatorState.hazards??[]).filter((item)=>item.state==='verified_hazard').length,openInterventions:(operatorState.interventions??[]).filter((item)=>item.state!=='closed').length},notice:'Operator identities, evidence locators, tasks, reviews and audit records require an authenticated scoped endpoint.'};
    return {
      meta: {
        generatedAt: world.meta.generatedAt,
        mode: world.meta.mode,
        region: world.meta.region,
        notice: world.meta.notice,
        safety: 'Decision support only. Official civil-protection instructions always take precedence.'
      },
      sources: world.sources,
      world: {
        fires: world.fires,
        riskToday: world.riskToday,
        riskTomorrow: world.riskTomorrow,
        weather: world.weather,
        warnings: world.warnings,
        earthObservations: world.earthObservations,
        thermalDetections: world.thermalDetections
      },
      prevention,
      detection,
      operator
    };
  }
}
