import { assertCan, assertIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';
import { consequenceGate } from '../../../../../packages/domain/src/consequence-gate.mjs';
import { nearestByCoordinate } from '../../shared/geo.mjs';
import { recommendNextAction } from './action-engine.mjs';
import { analyseSpreadExposure } from './exposure-analysis.mjs';

export class ResponseService {
  constructor({ worldService, detectionService, exposureService, screeningSpreadProvider, externalSpreadProvider }) {
    this.worldService = worldService; this.detectionService = detectionService; this.exposureService = exposureService;
    this.screeningSpreadProvider = screeningSpreadProvider; this.externalSpreadProvider = externalSpreadProvider;
  }
  async build(actor, id) {
    assertCan(actor, 'run:consequence');assertIncidentScope(actor,id);
    const [world, incident] = await Promise.all([this.worldService.snapshot(), this.detectionService.find(id)]); if (!incident) return null;
    const gate = consequenceGate(incident, { externalProviderConfigured: this.externalSpreadProvider.configured });
    if (!gate.allowed) return { meta: { generatedAt: world.meta.generatedAt, mode: world.meta.mode }, incident, gate, spread: null, exposure: { state: 'not_requested' }, nextAction: { title: 'Get independent confirmation', rationale: gate.reason, steps: ['Request attributable field, camera or thermal evidence'], authority: 'Human-owned evidence workflow' } };
    const riskMatch = nearestByCoordinate(incident.coordinate, world.riskToday ?? []); const weather = incident.weather ?? nearestByCoordinate(incident.coordinate, world.weather ?? [])?.item ?? null;
    let spread;
    if (gate.level === 'operational') {
      spread = await this.externalSpreadProvider.build({ incident, weather, riskLevel: riskMatch?.item?.level ?? 3 });
    } else spread = await this.screeningSpreadProvider.build({ incident, weather, riskLevel: riskMatch?.item?.level ?? 3 });
    return { meta: { generatedAt: world.meta.generatedAt, mode: world.meta.mode, notice: spread.modelNotice }, incident, gate, riskContext: riskMatch ? { ...riskMatch.item, distanceKm: riskMatch.distanceKm } : null, weather, spread, exposure: { state: 'not_requested', endpoint: `/api/v2/consequence/${encodeURIComponent(id)}/exposure` }, nextAction: recommendNextAction({ incident, exposure: null, spread }) };
  }
  async exposure(actor, id) {
    assertCan(actor, 'run:consequence');assertIncidentScope(actor,id);const incident = await this.detectionService.find(id); if (!incident) return null;
    const gate = consequenceGate(incident, { externalProviderConfigured: this.externalSpreadProvider.configured }); if (!gate.allowed) return { state: 'locked', reason: gate.reason };
    const exposure=await this.exposureService.inspect({ lon: incident.coordinate[0], lat: incident.coordinate[1] });
    const world=await this.worldService.snapshot(); const riskMatch=nearestByCoordinate(incident.coordinate,world.riskToday??[]); const weather=incident.weather??nearestByCoordinate(incident.coordinate,world.weather??[])?.item??null;
    const spread=await this.screeningSpreadProvider.build({incident,weather,riskLevel:riskMatch?.item?.level??3});
    return { ...exposure, byEnvelope: analyseSpreadExposure(exposure, spread), spreadModel: spread.model, spreadValidated: Boolean(spread.validated) };
  }
}
