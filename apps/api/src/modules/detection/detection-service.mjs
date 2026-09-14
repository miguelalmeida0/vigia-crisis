import { inspectTimestamp } from '../../../../../packages/domain/src/timestamp-firewall.mjs';
import { readFile } from 'node:fs/promises';
import { buildIncidentEvidence } from './evidence-engine.mjs';
import { dedupeOccurrences } from './incident-deduper.mjs';
import { incidentInScope } from '../../../../../packages/domain/src/authorization.mjs';

function freshness(value, clock) {
  const inspected = inspectTimestamp(value, { now: clock() }); if (!inspected.valid) return { state: inspected.reason === 'future' ? 'conflict' : 'unknown', minutes: null, reason: inspected.reason };
  const minutes = Math.round(inspected.ageSeconds / 60); return { state: minutes <= 30 ? 'current' : minutes <= 180 ? 'delayed' : 'stale', minutes, reason: null };
}
function acceptedFieldEvidence(state, occurrence) {
  const targets = new Set([`incident:${occurrence.id}`, ...(occurrence.sourceRecordIds ?? []).map((id) => `incident:${id}`)]);
  const requests = (state.evidenceRequests ?? []).filter((item) => item.state === 'accepted' && targets.has(item.targetId));
  return requests.map((request) => state.evidencePackages.find((item) => item.id === request.evidencePackageId && item.state === 'accepted')).filter(Boolean);
}
function publicEvidence(item,index){
  if(item.source==='operator-review')return null;
  if(item.source==='accepted-field-evidence')return{...item,id:`public-field-evidence-${index+1}`,detail:'Accepted attributable field evidence is present.',observedAt:null,payload:null};
  return item;
}
function publicIncident(incident){
  const evidence=(incident.evidence??[]).map(publicEvidence).filter(Boolean);
  return{...incident,evidence,truth:{...incident.truth,localReview:null},thermalMatch:incident.thermalMatch?{distanceKm:incident.thermalMatch.distanceKm,timeDeltaMinutes:incident.thermalMatch.timeDeltaMinutes,item:{instrument:incident.thermalMatch.item?.instrument??null,observedAt:incident.thermalMatch.item?.observedAt??null}}:null};
}

export class DetectionService {
  constructor({ worldService, repository, clock = () => new Date(), benchmarkFile = '', smallFireOpportunityFile='',physicalSensingHandoffFile='',sentinel3ProductManifestFile='',preventionReviewCorpusFile='' }) { Object.assign(this,{worldService,repository,clock,benchmarkFile,smallFireOpportunityFile,physicalSensingHandoffFile,sentinel3ProductManifestFile,preventionReviewCorpusFile});this.benchmarkPromise=null; }
  async snapshot(options={}) {
    const { publicProjection=false,actor=null,...worldOptions }=options;
    const world = await this.worldService.snapshot(worldOptions); const operator = this.repository.snapshot(); const records = world.fires ?? [];
    let incidents = dedupeOccurrences(records).map((occurrence) => {
      const decision = operator.incidentDecisions[String(occurrence.id)] ?? occurrence.sourceRecordIds?.map((id) => operator.incidentDecisions[String(id)]).find(Boolean) ?? null;
      const fieldEvidence = acceptedFieldEvidence(operator, occurrence);
      const truth = buildIncidentEvidence(occurrence, world, decision, { clock: this.clock, fieldEvidence });
      return { ...occurrence, truthStage: truth.classification.stage, truth: truth.classification, evidence: truth.evidence, thermalMatch: truth.thermalMatch, weather: truth.weather, sourceTimeConflict: truth.sourceTimeConflict, timestampState: truth.timestampState, freshness: freshness(occurrence.updatedAt ?? occurrence.startedAt, this.clock), nextObservation: truth.nextObservation, acceptedEvidenceCount: fieldEvidence.length, authorityNotice: 'VIGIA stages describe evidence quality. Official civil-protection instructions always take precedence.' };
    }).sort((a, b) => {
      const stage = { verified: 4, corroborated: 3, reported: 2, observed: 1, rejected: 0 }; const stageDelta = (stage[b.truthStage] ?? 0) - (stage[a.truthStage] ?? 0); if (stageDelta) return stageDelta;
      const fresh = { current: 3, delayed: 2, unknown: 1, stale: 0, conflict: 0 }; return (fresh[b.freshness.state] ?? 0) - (fresh[a.freshness.state] ?? 0) || Number(b.operatives ?? 0) - Number(a.operatives ?? 0);
    });
    if(actor?.authentication?.authenticated)incidents=incidents.filter((item)=>incidentInScope(actor,item.id));
    if(publicProjection)incidents=incidents.map(publicIncident);
    return { meta: { generatedAt: world.meta.generatedAt, mode: world.meta.mode, notice: 'Public occurrence records remain reported until independent attributable evidence supports a stronger stage.' }, summary: { reportedCount: records.length, uniqueCount: incidents.length, duplicateCount: Math.max(0, records.length - incidents.length), corroboratedCount: incidents.filter((item) => ['corroborated', 'verified'].includes(item.truthStage)).length, verifiedCount: incidents.filter((item) => item.truthStage === 'verified').length, staleCount: incidents.filter((item) => item.freshness.state === 'stale').length, requiringConfirmation: incidents.filter((item) => item.truth.needsIndependentConfirmation).length, sourceTimeConflictCount: incidents.filter((item) => item.sourceTimeConflict || item.freshness.state === 'conflict').length }, incidents };
  }
  async find(id,options={}) { return (await this.snapshot(options)).incidents.find((item) => String(item.id) === String(id)) ?? null; }
  async benchmark(){
    if(this.benchmarkPromise)return structuredClone(await this.benchmarkPromise);
    this.benchmarkPromise=this.#loadBenchmark().catch((error)=>{this.benchmarkPromise=null;throw error;});
    return structuredClone(await this.benchmarkPromise);
  }
  async #loadBenchmark(){
    if(!this.benchmarkFile)throw new Error('detection_benchmark_not_configured');
    const readOptional=async(file)=>{if(!file)return null;try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}};
    const [value,smallFire,physicalSensing,sentinel3,prevention]=await Promise.all([readOptional(this.benchmarkFile),readOptional(this.smallFireOpportunityFile),readOptional(this.physicalSensingHandoffFile),readOptional(this.sentinel3ProductManifestFile),readOptional(this.preventionReviewCorpusFile)]);
    if(!value)throw new Error('detection_benchmark_unavailable');const{results,...summary}=value;
    const compact=(artifact,largeKeys=[])=>{if(!artifact)return null;return Object.fromEntries(Object.entries(artifact).filter(([key])=>!largeKeys.includes(key)));};
    return{...summary,resultCount:results?.length??0,smallFire:compact(smallFire,['cases','granules','errors','sourceArtifacts']),physicalSensing:compact(physicalSensing,['viirs']),physicalSensingViirs:physicalSensing?.viirs?{earthdataPreflight:physicalSensing.viirs.earthdataPreflight,granuleMetrics:physicalSensing.viirs.granuleMetrics,smallFireOpportunityMetrics:physicalSensing.viirs.smallFireOpportunityMetrics,sizeStrata:physicalSensing.viirs.sizeStrata,geographicStrata:physicalSensing.viirs.geographicStrata,signalStrata:physicalSensing.viirs.signalStrata,platformPerformance:physicalSensing.viirs.platformPerformance,stateCounts:physicalSensing.viirs.stateCounts,errorTaxonomy:physicalSensing.viirs.errorTaxonomy}:null,sentinel3:compact(sentinel3,['products']),prevention:compact(prevention,['samples'])};
  }
}
