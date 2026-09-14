import { readFile } from 'node:fs/promises';
import { SHADOW_ALERT_POLICIES } from '../../../../../packages/domain/src/alert-domain.mjs';
import { assertGlobalIncidentScope, incidentInScope } from '../../../../../packages/domain/src/authorization.mjs';

const ASSET_TYPES = Object.freeze({
  THERMAL_POWER: 'POWER_GENERATION', DIRECT_HIGH_TEMPERATURE_INDUSTRIAL: 'HIGH_TEMPERATURE_INDUSTRIAL',
  WASTE_PROCESSING: 'WASTE_PROCESSING', INDUSTRIAL_WORKS: 'INDUSTRIAL_WORKS', INDUSTRIAL_LANDUSE: 'INDUSTRIAL_SITE', QUARRY: 'QUARRY'
});
function representativePoint(feature) {
  const coordinates = (feature.paths ?? []).flat().filter((point) => Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite));
  if (!coordinates.length) return null;
  return { type: 'Point', coordinates: [coordinates.reduce((sum, point) => sum + point[0], 0) / coordinates.length, coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length] };
}
function sourceId(value) { return String(value ?? '').replaceAll('/', ':'); }

export class MonitoredTerritoryService {
  constructor({ store, referenceFile, operatorActorId = null, operatorConfigured = false, operatorIncidentScopes = [], clock = () => new Date(), assetLimit = 1000 } = {}) {
    Object.assign(this, { store, referenceFile, operatorActorId, operatorConfigured, operatorIncidentScopes, clock, assetLimit }); this.registry = null; this.persistencePromise = null; this.persistence = { state: 'NOT_INITIALIZED', lastError: null, lastPersistedAt: null };
  }
  async initialize() {
    const reference = JSON.parse(await readFile(this.referenceFile, 'utf8'));
    if (reference.portugalBoundary?.type !== 'MultiPolygon') throw new Error('invalid_monitored_territory_boundary');
    const territory = {
      id: 'territory:portugal-shadow', name: 'Portugal Mainland Shadow Territory', mode: 'SHADOW', geometry: reference.portugalBoundary,
      administrativeReference: { countryCode: 'PT', scope: 'Portugal mainland and source-boundary islands present in the reference' },
      source: reference.schema ?? 'vigia.portugal-thermal-context', ownerActorId: this.operatorConfigured ? this.operatorActorId : null, active: true,
      provenance: { datasetHash: reference.datasetHash, generatedAt: reference.generatedAt, qualification: reference.referenceQualification, sources: reference.provenance }
    };
    const zones=[{id:'zone:portugal-shadow-watch',name:'Portugal Shadow Watch Zone',geometry:reference.portugalBoundary,source:territory.source,provenance:territory.provenance,active:true}];
    const groups = Object.entries(ASSET_TYPES).map(([contextClass, assetType]) => ({ id: `asset-group:${contextClass.toLowerCase()}`, name: contextClass.replaceAll('_', ' ').toLowerCase(), assetType }));
    const assets = (reference.features ?? []).map((feature) => {
      const geometry = representativePoint(feature), assetType = ASSET_TYPES[feature.contextClass];
      if (!geometry || !assetType) return null;
      return {
        id: `monitored-asset:${sourceId(feature.id)}`, groupId: `asset-group:${feature.contextClass.toLowerCase()}`,
        name: String(feature.name ?? `${feature.contextClass} ${feature.id}`), assetType, geometry,
        source: 'OpenStreetMap thermal-context reference', sourceId: feature.id,
        provenance: { datasetHash: reference.datasetHash, referenceGeneratedAt: reference.generatedAt, originalContextClass: feature.contextClass },
        metadata: { tags: feature.tags ?? {}, geometryRepresentation: 'derived_representative_point_from_attributable_osm_paths' }, active: true
      };
    }).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id)).slice(0, this.assetLimit);
    const policies = SHADOW_ALERT_POLICIES.map((policy) => ({ ...policy, enabled: true, radiusMeters: 5000, channels: ['IN_APP', 'BROWSER_NOTIFICATION', 'WEBHOOK', 'EMAIL'] }));
    const actors=[
      {actorId:'shadow:operator-primary',displayName:'Shadow Operator',actorRole:'OPERATOR',availability:'AVAILABLE',channels:['IN_APP','BROWSER_NOTIFICATION'],source:'VIGIA_LOCAL_SHADOW_ROSTER',provenance:{syntheticOperationalEvidence:false,identityQualification:'EXPLICIT_NON_PERSON_SHADOW_IDENTITY'}},
      {actorId:'shadow:supervisor-duty',displayName:'Shadow Supervisor',actorRole:'SUPERVISOR',availability:'AVAILABLE',channels:['IN_APP','BROWSER_NOTIFICATION'],source:'VIGIA_LOCAL_SHADOW_ROSTER',provenance:{syntheticOperationalEvidence:false,identityQualification:'EXPLICIT_NON_PERSON_SHADOW_IDENTITY'}},
      {actorId:'shadow:prevention-reviewer',displayName:'Shadow Prevention Reviewer',actorRole:'PREVENTION_REVIEWER',availability:'UNAVAILABLE',channels:['IN_APP'],source:'VIGIA_LOCAL_SHADOW_ROSTER',provenance:{syntheticOperationalEvidence:false,identityQualification:'EXPLICIT_NON_PERSON_SHADOW_IDENTITY'}},
      {actorId:'shadow:admin',displayName:'Shadow Admin',actorRole:'ADMIN',availability:'UNAVAILABLE',channels:['IN_APP'],source:'VIGIA_LOCAL_SHADOW_ROSTER',provenance:{syntheticOperationalEvidence:false,identityQualification:'EXPLICIT_NON_PERSON_SHADOW_IDENTITY'}}
    ];
    const assignments=[
      {territoryId:territory.id,actorId:'shadow:operator-primary',assignmentRole:'PRIMARY_OPERATOR',escalationLevel:0},
      {territoryId:territory.id,actorId:'shadow:supervisor-duty',assignmentRole:'DUTY_SUPERVISOR',escalationLevel:1},
      {territoryId:territory.id,actorId:'shadow:prevention-reviewer',assignmentRole:'PREVENTION_REVIEW',escalationLevel:0},
      {territoryId:territory.id,actorId:'shadow:admin',assignmentRole:'PLATFORM_ADMIN',escalationLevel:2}
    ];
    this.registry = { territory,zones, groups, assets, policies,actors,assignments, importedAt: this.clock().toISOString(), sourceFeatureCount: reference.features?.length ?? 0 };
    try { await this.ensurePersisted(); }
    catch (error) { if(error?.statusCode!==503)throw error; }
    return this.snapshot();
  }
  async ensurePersisted() {
    if(!this.registry)return this.snapshot();
    const before=this.store.status?.()??{};
    if(this.persistence.state==='READY'&&before.state==='ready'&&this.persistence.connectionAt===before.lastSuccessfulConnectionAt)return this.snapshot();
    if(this.persistencePromise)return this.persistencePromise;
    this.persistencePromise=(async()=>{
      try { await this.store.recoverIfNeeded?.(); await this.store.seedTerritory(this.registry); await this.store.seedRoster({actors:this.registry.actors,assignments:this.registry.assignments}); const after=this.store.status?.()??{};this.persistence={state:'READY',lastError:null,lastPersistedAt:this.clock().toISOString(),connectionAt:after.lastSuccessfulConnectionAt??null}; }
      catch(error){this.persistence={state:'DEGRADED',lastError:error?.code??String(error.message??error),lastPersistedAt:this.persistence.lastPersistedAt};throw error;}
      return this.snapshot();
    })();
    try{return await this.persistencePromise;}finally{this.persistencePromise=null;}
  }
  snapshot() { return this.registry ? { state: this.persistence.state, territoryId: this.registry.territory.id,zoneCount:this.registry.zones.length, assetCount: this.registry.assets.length, policyCount: this.registry.policies.length,rosterCount:this.registry.actors.length, sourceFeatureCount: this.registry.sourceFeatureCount, importedAt: this.registry.importedAt,persistence:{...this.persistence} } : { state: 'NOT_INITIALIZED',zoneCount:0, assetCount: 0, policyCount: 0,rosterCount:0,persistence:{...this.persistence} }; }
  context(event) { return this.store.territoryContext(event?.coordinate); }
  listTerritories(actor) { assertGlobalIncidentScope(actor);return this.store.listTerritories(); }
  listAssets(options,actor) { assertGlobalIncidentScope(actor);return this.store.listAssets(options); }
  listRoster(options) { return this.store.listRoster(options); }
  recipients({ territoryContext, eventId = null, channels = ['IN_APP', 'BROWSER_NOTIFICATION', 'WEBHOOK', 'EMAIL'] } = {}) {
    const inTerritory = territoryContext?.territories?.some((item) => item.id === this.registry?.territory.id);
    if (!inTerritory) return [];
    if(this.operatorConfigured&&this.operatorActorId){if(!incidentInScope({incidentScopes:this.operatorIncidentScopes},eventId))return[];return channels.map((channel) => ({ actorId: this.operatorActorId, actorRole: 'operator', channel, escalationLevel: 0, routingReason: 'MONITORED_TERRITORY_POLICY_MATCH' }));}
    const shadow=this.registry?.actors?.find((actor)=>actor.actorRole==='OPERATOR'&&actor.availability==='AVAILABLE'&&actor.active!==false);
    return shadow?(shadow.channels??[]).filter((channel)=>channels.includes(channel)).map((channel)=>({actorId:shadow.actorId,actorRole:'shadow_operator',channel,escalationLevel:0,routingReason:'MONITORED_TERRITORY_SHADOW_ROSTER_MATCH'})):[];
  }
}
