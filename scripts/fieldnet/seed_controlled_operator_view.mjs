import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../packages/domain/src/fieldnet/contracts.mjs';
import { signFieldRequest } from '../../packages/domain/src/fieldnet/request-auth.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const base=String(process.env.FIELDNET_BASE_URL??'http://127.0.0.1:4288').replace(/\/$/,'');
const pkg=JSON.parse(await readFile(path.join(root,'data/validation/fieldnet/real-incident-package.json'),'utf8'));
const incidentId=pkg.incidentId, coordinate=pkg.incidentState.coordinate, actor='Miguel Almeida · Shadow Operator';
const controlKey=process.env.FIELDNET_CONTROL_KEY,controlKeyId=process.env.FIELDNET_CONTROL_KEY_ID??'field-operator';
const request=async(route,value)=>{
  const body=JSON.stringify(value),headers={'content-type':'application/json',...signFieldRequest({method:'POST',path:new URL(route,'http://fieldnet.local').pathname,keyId:controlKeyId,key:controlKey,body:value})};
  const response=await fetch(`${base}${route}`,{method:'POST',headers,body});
  const payload=await response.json();
  if(!response.ok)throw new Error(`${route}:${response.status}:${payload.error}`);
  return payload;
};

const devices=[
  {deviceId:'field-device:operator-view:a',deviceType:'PHONE',hardwareIdentity:'controlled-exercise:operator-view:a',ownerOperator:actor,capabilities:['FIELD_REPORT','TASK_ACK','CAMERA_EVIDENCE'],calibrationStatus:'NOT_APPLICABLE',timeQuality:'SYNCED',locationQuality:'CONTROLLED_EXERCISE_GEOLOCATION',trustQualification:'CONTROLLED_EXERCISE'},
  {deviceId:'field-device:operator-view:b',deviceType:'PHONE',hardwareIdentity:'controlled-exercise:operator-view:b',ownerOperator:'Shadow Observer B',capabilities:['FIELD_REPORT'],calibrationStatus:'NOT_APPLICABLE',timeQuality:'SYNCED',locationQuality:'CONTROLLED_EXERCISE_GEOLOCATION',trustQualification:'CONTROLLED_EXERCISE'}
];
for(const device of devices)await request('/api/fieldnet/devices',{device,actor});
const task=await request('/api/fieldnet/tasks',{actor,task:{taskId:'field-task:operator-view:north-approach',incidentId,subject:{kind:'ACCESS_ROUTE',label:'Northern approach',geometry:{type:'Point',coordinates:[coordinate[0]-.006,coordinate[1]+.005]}},requiredAction:'Verify access from the eastern corridor and preserve geolocated evidence.',owner:actor,priority:'P1_COMMAND',requiredEvidence:['INDEPENDENT_FIELD_CHECK','GEOLOCATED_EVIDENCE','OBSERVER_IDENTITY']}});
const observedAt=new Date().toISOString();
const common={incidentId,observedAt,receivedAt:observedAt,deviceClockQuality:'SYNCED',horizontalUncertaintyM:12,observationType:'ACCESS_CONDITION',causalMetadata:{clientId:'fieldnet-1-1-operator-view',clientSequence:1},verificationOwner:actor};
const first=await request('/api/fieldnet/observations',{actor,observation:{...common,observationId:'field-observation:operator-view:passable',deviceId:devices[0].deviceId,observerIdentity:actor,sourceIdentity:{kind:'HUMAN',exercise:true},geometry:{type:'Point',coordinates:[coordinate[0]-.0062,coordinate[1]+.005]},payload:{subjectKey:'access:northern-approach',claimField:'accessState',claimValue:'PASSABLE',place:'Northern approach',exerciseMode:'CONTROLLED_FIELD_EXERCISE'},evidenceReference:{kind:'CONTROLLED_EXERCISE_REPORT'},rawEvidenceHash:sha256('fieldnet-1-1:operator-view:passable')}});
const second=await request('/api/fieldnet/observations',{actor:'Shadow Observer B',observation:{...common,observationId:'field-observation:operator-view:blocked',deviceId:devices[1].deviceId,observerIdentity:'Shadow Observer B',sourceIdentity:{kind:'HUMAN',exercise:true},geometry:{type:'Point',coordinates:[coordinate[0]-.006,coordinate[1]+.0052]},payload:{subjectKey:'access:northern-approach',claimField:'accessState',claimValue:'BLOCKED',place:'Northern approach',exerciseMode:'CONTROLLED_FIELD_EXERCISE'},evidenceReference:{kind:'CONTROLLED_EXERCISE_REPORT'},rawEvidenceHash:sha256('fieldnet-1-1:operator-view:blocked')}});
const conflict=second.conflicts?.[0];
if(conflict)await request(`/api/fieldnet/incidents/${encodeURIComponent(incidentId)}/evidence-debt`,{actor,item:{id:`debt:fieldnet:${conflict.conflictId}`,question:'Is the northern approach passable now?',currentState:'OPEN',whyUnknown:'Two controlled field reports disagree.',whyItMatters:'Operator routing depends on a safe current answer.',howWeCanKnow:['Independent observation from the eastern corridor'],whatVigiaIsDoing:'VERIFICATION_TASK_ASSIGNED',closesWhen:'Independent attributable evidence resolves accessState or proves a time-dependent change.',linkedConflictId:conflict.conflictId,currentDenominator:0,targetDenominator:1,systemResolvable:false,fieldRequired:true}});
process.stdout.write(`${JSON.stringify({ok:true,scope:'CONTROLLED_EXERCISE_ONLY',incidentId,taskId:task.task.taskId,observations:[first.observation.observationId,second.observation.observationId],conflictId:conflict?.conflictId??null})}\n`);
