#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION,
  THERMAL_CANDIDATE_V3_CANDIDATE_VERSION
} from '../packages/domain/src/thermal-candidate-policy.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'data/validation/detection');
const sourcePath=path.join(directory,'portugal-2024-active-fire-corpus.json');
const outputPath=path.join(directory,'portugal-2024-v3-area-time-corpus.json');
const lockPath=path.join(directory,'portugal-2024-v3-policy-lock.json');
const DAY=86_400_000;
const sha=(value)=>createHash('sha256').update(String(value)).digest('hex');
const round=(value,digits=6)=>Number(Number(value).toFixed(digits));
const percentile=(values,p)=>{const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!rows.length)return null;return rows[Math.min(rows.length-1,Math.max(0,Math.ceil(rows.length*p)-1))];};
const siteKey=(coordinate)=>`${Math.floor(coordinate[0]/.005)}:${Math.floor(coordinate[1]/.005)}`;
const dayKey=(value)=>new Date(value).toISOString().slice(0,10);
const geometry=(coordinate)=>({type:'Point',coordinates:coordinate,radiusKm:5,qualification:'Governed 10 km diameter area-time cell; not a fire perimeter.'});
const masked=(item)=>({...item,type:'thermal',at:item.observedAt??item.at,receivedAt:null,hotspotType:null,hotspotClass:null,referenceOnlyFieldsMasked:true});
function assignSubjects(subjects,prefix){
  const ordered=[...subjects].sort((a,b)=>sha(`${prefix}:${a}`).localeCompare(sha(`${prefix}:${b}`)));
  const confirm=Math.max(1,Math.floor(ordered.length*.2)),validation=Math.max(1,Math.floor(ordered.length*.2));
  return new Map(ordered.map((subject,index)=>[subject,index<confirm?'FROZEN_CONFIRMATORY':index<confirm+validation?'VALIDATION':'DEVELOPMENT']));
}
function distanceKm(a,b){const rad=Math.PI/180,dy=(b[1]-a[1])*111.32,dx=(b[0]-a[0])*111.32*Math.cos((a[1]+b[1])/2*rad);return Math.hypot(dx,dy);}
function memory(rows,decisionAt){
  const causal=rows.filter((item)=>Date.parse(item.at??item.observedAt)<=Date.parse(decisionAt)).map(masked).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  if(!causal.length)return{asOf:decisionAt,observationCount:0,distinctObservationDays:0,durationHours:0,stationarityRadiusKm:null,frpP90Mw:null,qualification:'Causal observations at or before the evaluation decision only.'};
  const centroid=[causal.reduce((sum,item)=>sum+item.coordinate[0],0)/causal.length,causal.reduce((sum,item)=>sum+item.coordinate[1],0)/causal.length];
  const first=Date.parse(causal[0].at),last=Date.parse(causal.at(-1).at);
  return{asOf:decisionAt,observationCount:causal.length,distinctObservationDays:new Set(causal.map((item)=>dayKey(item.at))).size,durationHours:round(Math.max(0,last-first)/3_600_000,3),stationarityRadiusKm:round(Math.max(...causal.map((item)=>distanceKm(centroid,item.coordinate))),3),frpP90Mw:round(percentile(causal.map((item)=>Number(item.frpMw)),.9),3),qualification:'Causal observations at or before the evaluation decision only; provider reference class is absent.'};
}
function areaWindow({id,subjectId,split,coordinate,start,label,source,authority,qualification,provenance,observations,history,tags,burnedAreaHa=null,region=null,referenceEvidence=null,eligible}){
  const rows=observations.map(masked).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const end=new Date(Date.parse(start)+DAY).toISOString(),decisionAt=rows.at(-1)?.at??end;
  return{windowId:id,caseId:id,splitAssignmentUnit:subjectId,evaluationSplit:split,confirmatoryCohort:false,geometry:geometry(coordinate),coordinate,timeWindow:{start,end},areaTime:{areaKm2:100,durationDays:1,unit:'100 km² × 1 day'},referenceLabel:label,labelSource:source,labelAuthority:authority,referenceQualification:qualification,referenceEvidence,evidenceProvenance:provenance,evaluationEligibility:{eligible,reason:eligible?'LABELLED_WINDOW_WITH_RETAINED_VIIRS_SIGNAL':'NO_RETAINED_SIGNAL_AND_NO_PROVEN_SWATH_OPPORTUNITY'},observationOpportunity:rows.length?'PROVEN_BY_RETAINED_PIXEL':'UNRESOLVED_NO_SWATH_MASK',sensorCoverage:{viirs:{state:rows.length?'POSITIVE_PIXEL_PRESENT':'OBSERVATION_OPPORTUNITY_UNRESOLVED',observationCount:rows.length},sentinel3:{state:'NOT_EVALUATED'}},burnedAreaHa,region,tags,firstPhysicalAt:rows[0]?.at??null,latestPhysicalAt:rows.at(-1)?.at??null,observations:rows,detectorContext:{thermalMemory:memory(history,decisionAt),providerReferenceTypeAvailable:false,referenceLabelAvailable:false}};
}

const active=JSON.parse(await readFile(sourcePath,'utf8'));
const positives=active.cases.filter((item)=>item.referenceLabel==='FIRE_POSITIVE');
const negatives=active.cases.filter((item)=>item.referenceLabel==='NON_WILDFIRE_NEGATIVE');
const positiveSplits=assignSubjects(new Set(positives.map((item)=>item.caseId)),'fire-subject-v3');
const negativeRows=negatives.flatMap((item)=>item.observations.map((observation)=>({observation,item,site:siteKey(observation.coordinate)})));
const negativeSplits=assignSubjects(new Set(negativeRows.map((item)=>item.site)),'static-site-v3');
const windows=[];
for(const item of positives){
  const anchor=item.firstPhysicalAt??item.alertAt;
  const start=new Date(Date.UTC(new Date(anchor).getUTCFullYear(),new Date(anchor).getUTCMonth(),new Date(anchor).getUTCDate())).toISOString();
  const rows=item.observations.filter((observation)=>Date.parse(observation.at)>=Date.parse(start)&&Date.parse(observation.at)<Date.parse(start)+DAY);
  windows.push(areaWindow({id:`v3:fire:${item.caseId}`,subjectId:`fire:${item.caseId}`,split:positiveSplits.get(item.caseId),coordinate:item.geometry.coordinates,start,label:'FIRE_POSITIVE',source:item.labelSource,authority:item.labelAuthority,qualification:item.referenceQualification,provenance:item.evidenceProvenance,observations:rows,history:item.observations,tags:[...item.tags,'V3_DAILY_FIRE_WINDOW'],burnedAreaHa:item.burnedAreaHa,region:item.region,referenceEvidence:{caseId:item.caseId,alertAt:item.alertAt},eligible:rows.length>0}));
}
const bySiteDay=new Map(),historyBySite=new Map();
for(const entry of negativeRows){
  const day=dayKey(entry.observation.at),key=`${entry.site}:${day}`;
  if(!bySiteDay.has(key))bySiteDay.set(key,{site:entry.site,day,rows:[],cases:[]});
  bySiteDay.get(key).rows.push(entry.observation);bySiteDay.get(key).cases.push(entry.item);
  if(!historyBySite.has(entry.site))historyBySite.set(entry.site,[]);historyBySite.get(entry.site).push(entry.observation);
}
for(const [key,entry] of bySiteDay){
  const rows=entry.rows,firstCase=entry.cases[0],coordinate=[round(rows.reduce((sum,item)=>sum+item.coordinate[0],0)/rows.length),round(rows.reduce((sum,item)=>sum+item.coordinate[1],0)/rows.length)];
  windows.push(areaWindow({id:`v3:negative:${sha(key).slice(0,24)}`,subjectId:`static-site:${entry.site}`,split:negativeSplits.get(entry.site),coordinate,start:`${entry.day}T00:00:00.000Z`,label:'NON_WILDFIRE_NEGATIVE',source:firstCase.tags.includes('OFFSHORE_HEAT')?'NASA FIRMS VIIRS Type 3 offshore reference':'NASA FIRMS VIIRS Type 2 static-land reference',authority:'NASA LANCE FIRMS VIIRS standard active-fire archive; label withheld from policy inputs',qualification:'Provider adjudication is used only as independent reference truth after ICNF conflict exclusion. Site identity, type, and label are unavailable to the policy.',provenance:firstCase.evidenceProvenance,observations:rows,history:historyBySite.get(entry.site),tags:[...new Set([...entry.cases.flatMap((item)=>item.tags),'HARD_THERMAL_NEGATIVE','SUBJECT_EXCLUSIVE_STATIC_SITE'])],referenceEvidence:{providerClassAvailableToPolicy:false,sourceCases:[...new Set(entry.cases.map((item)=>item.caseId))]},eligible:true}));
}
windows.sort((a,b)=>a.windowId.localeCompare(b.windowId));
const confirmNegatives=windows.filter((item)=>item.evaluationSplit==='FROZEN_CONFIRMATORY'&&item.referenceLabel==='NON_WILDFIRE_NEGATIVE');
const confirmPositives=windows.filter((item)=>item.evaluationSplit==='FROZEN_CONFIRMATORY'&&item.referenceLabel==='FIRE_POSITIVE'&&item.evaluationEligibility.eligible).sort((a,b)=>sha(`balanced:${a.windowId}`).localeCompare(sha(`balanced:${b.windowId}`))).slice(0,confirmNegatives.length);
for(const item of [...confirmNegatives,...confirmPositives])item.confirmatoryCohort=true;
const datasetHash=`sha256:${sha(JSON.stringify(windows))}`,lockedAt=new Date().toISOString();
const corpus={schema:'vigia.area-time-detection-corpus.v3',generatedAt:lockedAt,datasetHash,region:'Portugal mainland and adjacent offshore FIRMS coverage',year:2024,samplingUnit:'100 km² × 1 day',selectionPolicy:{positives:'All official ICNF 2024 fire references; eligibility requires a retained matched VIIRS pixel in the fixed one-day window.',negatives:'Every unique day/site represented by conflict-checked NASA FIRMS Type 2/3 archive observations; provider type is withheld from policy inputs.',splits:'Subject-exclusive deterministic stratification: reference fire ID for positives and fixed 500 m thermal site cell for negatives. No subject may cross development, validation, or frozen confirmation.',confirmatoryCohort:'All frozen negative daily windows plus an equal-size deterministic hash sample of eligible frozen positive windows, selected before predictions.',coverage:'A retained pixel proves signal. Absence remains unknown unless an independent swath-opportunity model proves coverage.'},referenceIndependence:{referenceLabelsAvailableToPolicy:false,providerTypeAvailableToPolicy:false,providerClassAvailableToPolicy:false,subjectOverlapAcrossSplits:false},inventory:{windows:windows.length,positive:windows.filter((item)=>item.referenceLabel==='FIRE_POSITIVE').length,negative:windows.filter((item)=>item.referenceLabel==='NON_WILDFIRE_NEGATIVE').length,negativeSubjects:new Set(windows.filter((item)=>item.referenceLabel==='NON_WILDFIRE_NEGATIVE').map((item)=>item.splitAssignmentUnit)).size,eligible:windows.filter((item)=>item.evaluationEligibility.eligible).length,splits:Object.fromEntries(['DEVELOPMENT','VALIDATION','FROZEN_CONFIRMATORY'].map((split)=>[split,{windows:windows.filter((item)=>item.evaluationSplit===split).length,eligiblePositive:windows.filter((item)=>item.evaluationSplit===split&&item.referenceLabel==='FIRE_POSITIVE'&&item.evaluationEligibility.eligible).length,negative:windows.filter((item)=>item.evaluationSplit===split&&item.referenceLabel==='NON_WILDFIRE_NEGATIVE').length,negativeSubjects:new Set(windows.filter((item)=>item.evaluationSplit===split&&item.referenceLabel==='NON_WILDFIRE_NEGATIVE').map((item)=>item.splitAssignmentUnit)).size}])),frozenBalancedCohort:{positive:confirmPositives.length,negative:confirmNegatives.length}},limitations:['Daily reference windows are stratified evidence, not population-weighted territorial exposure.','Provider Type 2/3 is an independent reference label, not a named-facility registry.','The signal archive does not provide a complete VIIRS swath mask.','Repeated daily windows from one site are correlated; the frozen split is site-exclusive to prevent leakage.'] ,sourceArtifacts:[{path:path.relative(root,sourcePath),checksumSha256:sha(await readFile(sourcePath))}],windows};
const lock={schema:'vigia.area-time-policy-lock.v3',lockedAt,corpusDatasetHash:datasetHash,confirmatoryOutcomeInspectedBeforeLock:false,candidate:{policyVersion:THERMAL_CANDIDATE_V3_CANDIDATE_VERSION,thresholdVersion:THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION,featureSet:['causal observation count','distinct observation days','elapsed history','stationarity radius','FRP p90','Portugal land-context compatibility'],thresholds:{minimumObservationCount:4,minimumDistinctDays:4,minimumDurationHours:336,maximumStationarityRadiusKm:1.5,maximumFrpP90Mw:4},referenceDataVersion:'ICNF-SGIF-2024-full + FIRMS-2024-standard-archive'},promotionRule:'On the balanced site-exclusive frozen cohort: specificity >= 0.75, FPR <= 0.25, balanced accuracy >= 0.80, MCC >= 0.60, and eligible-fire recall >= 0.95.'};
await mkdir(directory,{recursive:true});
await writeFile(outputPath,`${JSON.stringify(corpus)}\n`);
await writeFile(lockPath,`${JSON.stringify(lock,null,2)}\n`);
console.log(JSON.stringify({outputPath,lockPath,datasetHash,inventory:corpus.inventory,confirmatoryOutcomes:'NOT_EVALUATED_BY_THIS_COMMAND'},null,2));
