import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from '../../apps/api/src/shared/csv.mjs';
import { firmsDetectionKey, normalizeFirmsRows } from '../../apps/api/src/modules/world/firms-normalizer.mjs';
import { normalizeHistory } from '../../apps/api/src/modules/world/ptdata-normalizers.mjs';
import { haversineKm } from '../../packages/domain/src/geo.mjs';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const iso = (value) => Number.isFinite(Date.parse(value ?? '')) ? new Date(value).toISOString() : null;
const addHours = (value, hours) => new Date(Date.parse(value) + hours * 3_600_000).toISOString();
const leadMinutes = (thermalAt, reportAt) => Date.parse(thermalAt ?? '') < Date.parse(reportAt ?? '') ? Math.round((Date.parse(reportAt) - Date.parse(thermalAt)) / 60_000) : null;
const caseId = (report) => `PT-2024-ICNF-${report.id}`;
const BASELINE_REPORT_IDS = Object.freeze(['59380','59191','59325','58921','59158','59677','58591','59214','58977','59043','58975','58230','58715','109','58116']);

export async function loadRawProducts(root, products) {
  return Promise.all(products.map(async (product) => {
    const absolute = path.join(root, product.file);
    const [buffer, metadata] = await Promise.all([readFile(absolute), stat(absolute)]);
    const payload = product.file.endsWith('.csv') ? parseCsv(buffer.toString('utf8')) : JSON.parse(buffer.toString('utf8'));
    return { ...product, bytes: metadata.size, checksumSha256: sha256(buffer), payload, responseGeneratedAt: product.file.endsWith('.json') ? iso(payload?.meta?.timestamp) : null };
  }));
}

function reportWindow(report) {
  return { start: Date.parse(addHours(report.startedAt, -12)), end: Date.parse(addHours(report.extinctionAt ?? addHours(report.startedAt, 18), 24)) };
}
function assignDetections(reports, detections) {
  const assigned = new Map(reports.map((report) => [report.id, []]));
  for (const detection of detections) {
    const candidates = reports.map((report) => {
      const window = reportWindow(report), distanceKm = haversineKm(report.coordinate, detection.coordinate), at = Date.parse(detection.observedAt);
      return distanceKm <= 12 && at >= window.start && at <= window.end ? { report, match: { detection, distanceKm, at } } : null;
    }).filter(Boolean).sort((a, b) => a.match.distanceKm - b.match.distanceKm || Math.abs(a.match.at - Date.parse(a.report.startedAt)) - Math.abs(b.match.at - Date.parse(b.report.startedAt)));
    if (candidates[0]) assigned.get(candidates[0].report.id).push(candidates[0].match);
  }
  for (const matches of assigned.values()) matches.sort((a, b) => a.at - b.at || a.distanceKm - b.distanceKm);
  return assigned;
}
function thinMatches(matches, limit = 12) {
  const passes = new Map();
  for (const match of matches) { const key = `${match.detection.satellite}:${match.detection.observedAt}`; if (!passes.has(key)) passes.set(key, []); passes.get(key).push(match); }
  const selected = new Map();
  for (const pass of passes.values()) {
    if (pass.length <= limit) { for (const item of pass) selected.set(firmsDetectionKey(item.detection), item); continue; }
    const by = (selector) => [...pass].sort(selector)[0];
    const mustKeep = [
      by((a,b)=>a.distanceKm-b.distanceKm), by((a,b)=>Number(b.detection.frpMw??-Infinity)-Number(a.detection.frpMw??-Infinity)),
      by((a,b)=>a.detection.coordinate[0]-b.detection.coordinate[0]), by((a,b)=>b.detection.coordinate[0]-a.detection.coordinate[0]),
      by((a,b)=>a.detection.coordinate[1]-b.detection.coordinate[1]), by((a,b)=>b.detection.coordinate[1]-a.detection.coordinate[1])
    ];
    for (const item of mustKeep) selected.set(firmsDetectionKey(item.detection), item);
    const ordered = [...pass].sort((a,b)=>a.detection.coordinate[0]-b.detection.coordinate[0]||a.detection.coordinate[1]-b.detection.coordinate[1]);
    for (let index=0; selected.size<limit && index<ordered.length; index+=Math.max(1,Math.floor(ordered.length/limit))) selected.set(firmsDetectionKey(ordered[index].detection),ordered[index]);
  }
  return [...selected.values()].sort((a,b)=>a.at-b.at||a.distanceKm-b.distanceKm);
}
function candidateScore(candidate) {
  return Number(candidate.leadMinutes !== null) * 1_000_000 + new Set(candidate.matches.map((item)=>item.detection.satellite)).size * 100_000 + Math.min(candidate.matches.length,999) * 100 + Math.min(candidate.report.burnedAreaHa??0,99_999)/100;
}

export function buildEvidencePool(rawProducts) {
  const thermalProducts=rawProducts.filter((item)=>item.kind==='thermal_active_fire_archive'),reportProducts=rawProducts.filter((item)=>item.kind==='official_fire_report_archive');
  const deduped=new Map();
  for(const product of thermalProducts)for(const detection of normalizeFirmsRows(product.payload,product.sourceKey,{rawSourceProductId:product.id,checksumSha256:product.checksumSha256,providerProductId:product.id,archiveUrl:product.url}))if(detection.hotspotType===0&&detection.observedAt)deduped.set(firmsDetectionKey(detection),detection);
  const detections=[...deduped.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt)),reports=[],reportSourceById=new Map();
  for(const product of reportProducts)for(const report of normalizeHistory(product.payload)){if(!report.coordinate||!report.startedAt||reports.some((item)=>item.id===report.id))continue;reports.push(report);reportSourceById.set(report.id,product);}
  return { thermalProducts, detections, reports, reportSourceById };
}

export function selectCandidates({ reports, detections }, maxCases) {
  const assigned=assignDetections(reports,detections);
  const candidates=reports.map((report)=>{const matches=assigned.get(report.id)??[],association=matches.filter((item)=>item.distanceKm<=2.8),firstThermalAt=association[0]?.detection.observedAt??null,nearestDistanceKm=matches.length?Math.min(...matches.map((item)=>item.distanceKm)):null;return{report,matches,firstThermalAt,leadMinutes:leadMinutes(firstThermalAt,report.startedAt),nearestDistanceKm};})
    .filter((item)=>item.matches.length>=3&&item.nearestDistanceKm<=2.8).sort((a,b)=>candidateScore(b)-candidateScore(a)||Number(b.report.burnedAreaHa)-Number(a.report.burnedAreaHa));
  const selected=[],bestPerDate=new Map();for(const candidate of candidates){const date=candidate.report.startedAt.slice(0,10);if(!bestPerDate.has(date))bestPerDate.set(date,candidate);}
  selected.push(...[...bestPerDate.values()].sort((a,b)=>Date.parse(a.report.startedAt)-Date.parse(b.report.startedAt)));for(const candidate of candidates)if(selected.length<maxCases&&!selected.includes(candidate))selected.push(candidate);selected.sort((a,b)=>candidateScore(b)-candidateScore(a));
  const selectedSet=selected.slice(0,maxCases),baseline=BASELINE_REPORT_IDS.map((id)=>selectedSet.find((item)=>String(item.report.id)===id)).filter(Boolean),remainder=selectedSet.filter((item)=>!BASELINE_REPORT_IDS.includes(String(item.report.id)));
  const output=[...baseline,...remainder].map((candidate)=>({...candidate,archiveMatchCount:candidate.matches.length,matches:thinMatches(candidate.matches,BASELINE_REPORT_IDS.includes(String(candidate.report.id))?12:4)}));
  if(output.length<10)throw new Error(`insufficient_real_incident_candidates:${output.length}`);return output;
}

function thermalRecord(item,selectedCase,rawByPlatform){const detection=item.detection,raw=rawByPlatform.get(detection.satellite);return{id:`${selectedCase.id}:thermal:${detection.id}`,caseId:selectedCase.id,kind:'thermal',arrivalAt:detection.observedAt,payload:{...detection,id:`${selectedCase.id}:${detection.id}`,replayCaseId:selectedCase.id,distanceToOfficialReportKm:Number(item.distanceKm.toFixed(3)),provenance:{...detection.provenance,rawSourceProductId:raw.id,checksumSha256:raw.checksumSha256,providerProductId:raw.id,archiveUrl:raw.url,evidenceUniverse:'official_archive_replay',timingQualification:'Archive observation time; provider delivery latency was not retained.'}}};}
function reportRecord(report,selectedCase,raw){return{id:`${selectedCase.id}:report:${report.id}:alert`,caseId:selectedCase.id,kind:'report',arrivalAt:report.startedAt,payload:{id:String(report.id),replayCaseId:selectedCase.id,coordinate:report.coordinate,municipality:report.municipality,district:report.district,parish:report.parish,locality:report.locality,status:'historical_official_record',startedAt:report.startedAt,updatedAt:null,fireType:report.fireType,cause:report.cause,causeFamily:report.causeFamily,burnedAreaHa:report.burnedAreaHa,firstResponseAt:report.firstResponseAt,extinctionAt:report.extinctionAt,durationMinutes:report.durationMinutes,weather:report.weather,operatives:null,ground:null,aerial:null,provenance:{synthetic:false,provider:'api.ptdata.org',origin:'ICNF_SGIF_official_archive',authority:'Instituto da Conservação da Natureza e das Florestas (ICNF)',rawSourceProductId:raw.id,checksumSha256:raw.checksumSha256,providerProductId:`ICNF-SGIF:${report.id}`,archiveUrl:raw.url,normalizerVersion:'ptdata-normalizers-v2',evidenceUniverse:'official_archive_replay'}}};}

export function buildCasesAndRecords(selected,pool){const cases=selected.map((candidate,index)=>({id:caseId(candidate.report),officialReportId:candidate.report.id,evaluationSplit:index<15?'baseline_comparable':index<25?'development':'held_out',difficultyTags:[],municipality:candidate.report.municipality,district:candidate.report.district,parish:candidate.report.parish,coordinate:candidate.report.coordinate,fireType:candidate.report.fireType,alertAt:candidate.report.startedAt,firstResponseAt:candidate.report.firstResponseAt,extinctionAt:candidate.report.extinctionAt,burnedAreaHa:candidate.report.burnedAreaHa,firstThermalAt:candidate.firstThermalAt,physicalLeadMinutes:candidate.leadMinutes,physicalLeadBasis:'First assigned VIIRS observation within the production report-association radius (2.8 km) compared with ICNF alert_at.',physicalFirst:candidate.leadMinutes!==null,thermalObservationCount:candidate.matches.length,archiveMatchedThermalCount:candidate.archiveMatchCount,independentPlatforms:[...new Set(candidate.matches.map((item)=>item.detection.satellite))],nearestThermalToReportKm:Number(candidate.nearestDistanceKm.toFixed(3)),maxFrpMw:Math.max(...candidate.matches.map((item)=>item.detection.frpMw).filter(Number.isFinite)),truthQualification:'ICNF SGIF record is an official reported-fire reference, not a pixel-level ignition-time or perimeter label.'}));
  for(const current of cases){const neighbours=cases.filter((other)=>other.id!==current.id&&Math.abs(Date.parse(other.alertAt)-Date.parse(current.alertAt))<=36*3_600_000&&haversineKm(other.coordinate,current.coordinate)<=20);if(neighbours.length)current.difficultyTags.push('nearby_concurrent_fire');if(current.thermalObservationCount>=80)current.difficultyTags.push('large_evolving_support');if(current.physicalFirst)current.difficultyTags.push('physical_first_late_report');}
  const rawByPlatform=new Map(pool.thermalProducts.map((item)=>[item.platform.startsWith('Suomi')?'VIIRS S-NPP':'VIIRS NOAA-20',item])),records=[];for(let index=0;index<selected.length;index+=1){const candidate=selected[index],selectedCase=cases[index];records.push(reportRecord(candidate.report,selectedCase,pool.reportSourceById.get(candidate.report.id)));for(const match of candidate.matches)records.push(thermalRecord(match,selectedCase,rawByPlatform));}records.sort((a,b)=>Date.parse(a.arrivalAt)-Date.parse(b.arrivalAt)||a.id.localeCompare(b.id));return{cases,records};}
