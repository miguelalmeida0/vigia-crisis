import { randomUUID } from 'node:crypto';
import { assertCan, assertIncidentScope, canonicalIncidentId, can } from '../../../../../packages/domain/src/authorization.mjs';
import { canonical, groupKey, verify, open, digest, delivery } from '../../../../../packages/domain/src/fieldnet/team-protocol.mjs';
import { SERVICES, REPORT_TYPES, validPoint, missionCatalog, evaluateMission, importantReports,reportMatches } from '../../../../../packages/domain/src/fieldnet/mission-command.mjs';
import { operationalConsequences } from '../../../../../packages/domain/src/consequences/operational-consequences.mjs';
import {controlledFieldContext} from './controlled-field-exercise.mjs';
const fail=(text,statusCode=400)=>{throw Object.assign(Error(text),{statusCode});};
const text=(v,max=240)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():fail('Enter a valid name or short description.');
const time=v=>Number.isFinite(Date.parse(v))?new Date(v).toISOString():fail('Enter a valid time.');
const member=(g,id)=>g.members.some(m=>m.id===id&&!m.revokedAt);
const plainGroup=g=>({...g,key:undefined});
const iso=clock=>clock().toISOString();
export class TeamService {
  constructor({store,situation,clock=()=>new Date()}){Object.assign(this,{store,situation,clock});this.tail=Promise.resolve();this.stats={evaluations:0,lastEvaluationMs:0};}
  authorize(actor,incidentId,{write=false}={}){
    if(!actor?.id)fail('Sign in to use your team.',401);
    if(!(can(actor,'read:incident_command')||can(actor,'submit:evidence')))fail('This account cannot access field teams.',403);
    if(write&&!can(actor,'command:incident'))fail('Only an incident commander can manage team objectives.',403);
    return assertIncidentScope(actor,incidentId);
  }
  group(actor,id){const g=this.store.get('group',id);if(!g||!member(g,actor.id))fail('This team is not available to your account.',403);this.authorize(actor,g.incidentId);return g;}
  async enroll(actor,input){
    this.authorize(actor,input.incidentId);
    const id=text(input.deviceId,80),key=input.publicKey;
    if(!key||key.kty!=='EC'||key.crv!=='P-256'||key.d)fail('A public device signing key is required.');
    await crypto.subtle.importKey('jwk',key,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    const prior=this.store.get('device',id);
    if(prior&&(prior.owner!==actor.id||prior.revokedAt||canonical(prior.publicKey)!==canonical(key)))fail('This device cannot be registered again.',403);
    const device=prior??{id,owner:actor.id,name:actor.displayName??actor.name??actor.id,publicKey:key,canCommand:can(actor,'command:incident'),registeredAt:iso(this.clock)};
    this.store.put('device',id,device);return {deviceId:id,senderId:actor.id,name:device.name};
  }
  async createGroup(actor,input){
    const incidentId=this.authorize(actor,input.incidentId,{write:true});
    if(input.memberIds&&!Array.isArray(input.memberIds))fail('Member IDs must be a list.');
    const members=[...new Set([actor.id,...(input.memberIds??[]).map(id=>text(id,100))])];if(members.length>32)fail('A team supports up to 32 people.');
    if(input.lane&&!['OPERATIONAL','CONTROLLED_FIELD_TEST'].includes(input.lane))fail('Unknown workspace.');
    const g={id:randomUUID(),name:text(input.name,120),incidentId,lane:input.lane??'OPERATIONAL',epoch:1,key:await groupKey(),owner:actor.id,createdAt:iso(this.clock),members:members.map(id=>({id,name:this.store.list('device').find(d=>d.owner===id)?.name??id}))};
    this.store.transaction(()=>{this.store.put('group',g.id,g);if(g.lane==='CONTROLLED_FIELD_TEST')this.store.put('test-context',g.id,controlledFieldContext(this.clock()));});return g;
  }
  revoke(actor,groupId,input){const work=this.tail.then(()=>this.revokeOne(actor,groupId,input));this.tail=work.catch(()=>{});return work;}
  async revokeOne(actor,groupId,{memberId,deviceId}){
    const g=this.group(actor,groupId);this.authorize(actor,g.incidentId,{write:true});
    if(deviceId){const d=this.store.get('device',deviceId);if(!d||!member(g,d.owner))fail('Device not in this team.');this.store.put('device',d.id,{...d,revokedAt:iso(this.clock)});}
    else {if(memberId===actor.id||!member(g,memberId))fail('Choose another current team member.');g.members=g.members.map(m=>m.id===memberId?{...m,revokedAt:iso(this.clock)}:m);}
    g.epoch++;g.key=await groupKey();this.store.put('group',g.id,g);return plainGroup(g);
  }
  groups(actor,incidentId){const id=this.authorize(actor,incidentId);return {senderId:actor.id,canManage:can(actor,'command:incident'),groups:this.store.list('group').filter(g=>g.incidentId===id&&member(g,actor.id))};}
  async context(group){
    if(group.lane==='CONTROLLED_FIELD_TEST')return this.store.get('test-context',group.id)??{catalog:[],restrictions:[],sourceValidUntil:null};
    let result;try{result=await this.situation.snapshot(group.incidentId);}catch{return this.store.get('context',group.id)??{catalog:[],restrictions:[],sourceValidUntil:null};}const s=result.snapshot;
    if(s){const context={catalog:missionCatalog(s,iso(this.clock)),restrictions:s.roadReports??[],sourceValidUntil:s.roadCoverage?.validUntil,knownAt:s.knownAt,incident:s.incident,notices:(s.notices??[]).filter(n=>n.state==='ACTIVE'&&n.applicabilityBasis&&Date.parse(n.expiresAt??n.expires)>this.clock().getTime()).map(n=>({...n,text:(n.type??'Official weather notice')+' · '+(n.area??'incident area')})),snapshotId:s.id};this.store.put('context',group.id,context);return context;}
    return this.store.get('context',group.id)??{catalog:[],restrictions:[],sourceValidUntil:null};
  }
  records(kind,group){return this.store.list(kind,group.id);}
  async refreshIncident(incidentId){for(const group of this.store.list('group').filter(g=>g.incidentId===canonicalIncidentId(incidentId)&&g.lane==='OPERATIONAL'))this.evaluate(group,await this.context(group));}
  evaluate(group,context){
    const started=performance.now(),at=iso(this.clock),reports=this.records('report',group),confirmations=this.records('confirmation',group);
    let recalculated=0;const missions=this.records('mission',group).map(m=>{
      const subject=context.catalog.find(c=>c.id===m.subjectId),routes=subject?.services.find(s=>s.id===m.service)?.routes??[];
      // Retain the originally selected route for causal explanation even after
      // qualification/route expiry removes it from the current catalog.
      const baseline=routes.some(r=>r.id===m.currentRouteId)?routes:[...routes,...m.savedRoutes.map(r=>({...r,qualified:false}))];
      const activeReports=reports.filter(r=>Date.parse(r.observedAt)<=Date.parse(at)&&Date.parse(r.validUntil)>Date.parse(at)&&baseline.some(route=>r.facilityId===route.facilityId||reportMatches(r,route))),ids=new Set(activeReports.map(r=>r.id));
      const inputKey=canonical([m,baseline,baseline.map(r=>Date.parse(r.validUntil)>Date.parse(at)),activeReports,confirmations.filter(c=>ids.has(c.reportId)),context.restrictions,(context.restrictions??[]).map(r=>Date.parse(r.validUntil??context.sourceValidUntil)>Date.parse(at)),context.notices,Date.parse(context.sourceValidUntil)>Date.parse(at),Date.parse(m.endAt)<=Date.parse(at),Date.parse(m.startAt)>Date.parse(at)]),cached=this.store.get('mission-projection',m.id);
      if(cached?.inputKey===inputKey)return {...cached.value,lastCheckedAt:at};recalculated++;
      const next=evaluateMission(m,{routes:baseline,reports,confirmations,restrictions:context.restrictions,sourceValidUntil:context.sourceValidUntil,notices:context.notices??[],at});
      this.store.put('mission-projection',m.id,{inputKey,value:next});
      const old=this.store.get('mission-state',m.id),signature=canonical([next.state,next.reason,next.currentRoute?.id,next.currentRoute?.minutes,next.fallback?.id,next.fallback?.minutes,next.relevantReports.map(r=>[r.id,r.verification.state])]);
      if(old?.signature!==signature){this.store.put('timeline',randomUUID(),{groupId:group.id,missionId:m.id,at,text:`${m.subjectName} · ${SERVICES[m.service]}: ${next.reason}`,previous:old?.summary??null,current:{state:next.state,minutes:next.currentRoute?.minutes??null,alternativeMinutes:next.fallback?.minutes??null}});this.store.put('mission-state',m.id,{signature,summary:{state:next.state,minutes:next.currentRoute?.minutes??null,alternativeMinutes:next.fallback?.minutes??null}});}
      return next;
    });
    this.stats.evaluations+=recalculated;this.stats.lastEvaluationMs=performance.now()-started;
    // Derived, never stored: consequences are reconstructed from the same
    // canonical records on every evaluation, so they cannot drift from them.
    const consequences=operationalConsequences({catalog:context.catalog,missions,reports,confirmations,restrictions:context.restrictions??[],sourceValidUntil:context.sourceValidUntil,at,incidentId:group.incidentId,snapshotId:context.snapshotId??null});
    this.stats.lastConsequenceMs=consequences.generationMs;
    return {missions,consequences,reports:importantReports(reports,missions,confirmations).map(r=>({...r,routeUses:context.catalog.flatMap(p=>p.services.flatMap(s=>s.routes.filter(route=>r.facilityId===route.facilityId||reportMatches(r,route)).map(route=>({place:p.name,service:SERVICES[s.id],facility:route.name,roads:route.roads,minutes:route.minutes,direction:route.direction}))))})),confirmations};
  }
  async snapshot(actor,groupId){
    const group=this.group(actor,groupId),context=await this.context(group),data=this.evaluate(group,context),receipts=this.records('receipt',group),messages=this.records('message',group).filter(m=>m.senderId===actor.id||m.recipients.includes(actor.id));
    this.store.put('connection',group.id+':'+actor.id,{groupId:group.id,senderId:actor.id,lastSeenAt:iso(this.clock)});
    const people=group.members.filter(m=>!m.revokedAt).map(m=>{const p=this.records('presence',group).filter(p=>p.senderId===m.id).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt))[0],seen=this.store.get('connection',group.id+':'+m.id)?.lastSeenAt??p?.receivedAt;return {...m,lastSeenAt:seen??null,status:p?.status??null,location:p?.shareLocation===true?p.location:null,online:Boolean(seen&&this.clock().getTime()-Date.parse(seen)<120000)};});
    return {group,senderId:actor.id,at:iso(this.clock),context,...data,messages:messages.map(m=>({...m,relayedBy:(m.relayedBy??[]).map(id=>this.store.get('device',id)?.owner??id),delivery:delivery(m.envelope,receipts,{accepted:true,relayedBy:m.relayedBy??[]})})),receipts,requests:this.records('request',group).map(r=>({...r,delivery:delivery(this.store.get('envelope',r.id).envelope,receipts,{accepted:true})})),people,timeline:this.records('timeline',group).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,100),envelopes:this.records('envelope',group).filter(e=>e.envelope.recipients.includes(actor.id)).map(e=>({envelope:e.envelope,hash:e.hash,receivedAt:e.receivedAt})),hub:{state:'LOCAL_VIGIA_ACTIVE',localPeople:people.filter(p=>p.online).length,centralConfigured:Boolean(this.centralTransport),lastCentralSync:null,...this.store.get('hub-sync',group.id)},stats:this.stats};
  }
  accept(actor,envelope,via=[]){const work=this.tail.then(()=>this.acceptOne(actor,envelope,via));this.tail=work.catch(()=>{});return work;}
  async acceptOne(actor,envelope,via){
    const group=this.group(actor,envelope.groupId),device=this.store.get('device',envelope.deviceId),receivedAt=iso(this.clock);
    if(!device||device.revokedAt||device.owner!==envelope.senderId||!member(group,envelope.senderId))fail('Sender or device is no longer authorized.',403);
    if(envelope.lane!==group.lane||envelope.incidentId!==group.incidentId||envelope.epoch!==group.epoch||envelope.recipients.some(id=>!member(group,id)))fail('Team membership changed. Reconnect before sending.',409);
    if(via.length>8||new Set(via).size!==via.length||via.some(id=>{const relay=this.store.get('device',id);return !relay||relay.revokedAt||!member(group,relay.owner);}))fail('Invalid relay path.');
    const existing=this.store.get('envelope',envelope.id),hash=await digest(envelope);
    await verify(envelope,device.publicKey,{now:this.clock(),allowExpired:Boolean(existing)});
    if(existing){if(existing.hash!==hash||existing.groupId!==group.id)fail('Message ID was reused with different content.',409);return {id:envelope.id,accepted:true,duplicate:true,receivedAt:existing.receivedAt};}
    if(this.records('envelope',group).length>=10000)fail('Team storage is full. Export or archive this incident before continuing.',507);
    const payload=await open(envelope,group.key);
    if(['MISSION','MISSION_END','MISSION_UPDATE'].includes(envelope.kind)&&!can(actor,'command:incident'))fail('Only a commander can change objectives.',403);
    // Administrative relay requires BOTH the admitting command account and the
    // original device's server-issued command grant. Revocation is checked first.
    if(['MISSION','MISSION_END','MISSION_UPDATE'].includes(envelope.kind)&&!device.canCommand)fail('Mission author is not authorized to command this incident.',403);
    const context=await this.context(group);
    return this.store.transaction(()=>{
      const common={id:envelope.id,groupId:group.id,incidentId:group.incidentId,lane:group.lane,senderId:envelope.senderId,senderName:device.name,createdAt:envelope.createdAt,receivedAt};
      const event=label=>this.store.put('timeline',randomUUID(),{groupId:group.id,at:receivedAt,text:label,reportId:envelope.kind==='REPORT'?envelope.id:payload.reportId??null,observedAt:payload.observedAt??null});
      if(envelope.kind==='MESSAGE'){
        const body=text(payload.text,2000);this.store.put('message',envelope.id,{...common,text:body,recipients:envelope.recipients,envelope,relayedBy:via});
      }else if(envelope.kind==='ACK'){
        const original=this.store.get('envelope',payload.messageId);
        if(!original||original.groupId!==group.id||original.hash!==payload.messageHash||!original.envelope.recipients.includes(envelope.senderId)||original.envelope.kind==='ACK')fail('Receipt does not belong to this recipient or message.');
        const recipientReceivedAt=time(payload.recipientReceivedAt);
        if(Date.parse(recipientReceivedAt)<Date.parse(original.envelope.createdAt)-60000||Date.parse(recipientReceivedAt)>Date.parse(receivedAt)+60000)fail('Receipt clock is invalid.');
        const id=payload.messageId+':'+envelope.senderId,prior=this.store.get('receipt',id);
        if(!prior)this.store.put('receipt',id,{...common,messageId:payload.messageId,messageHash:payload.messageHash,recipientId:envelope.senderId,recipientReceivedAt});
      }else if(envelope.kind==='REPORT'){
        if(!REPORT_TYPES[payload.type]||!validPoint(payload.coordinate)||!Number.isFinite(payload.accuracyM)||payload.accuracyM<0||payload.accuracyM>10000)fail('Choose a report type and explicit location accuracy.');
        const observedAt=time(payload.observedAt);if(Date.parse(observedAt)>Date.parse(receivedAt)+60000||Date.parse(observedAt)>Date.parse(envelope.createdAt)+60000)fail('Observation time cannot be in the future.');
        const media=(payload.media??[]);if(!Array.isArray(media)||media.length>2||media.some(m=>!['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/ogg'].includes(m.type)||typeof m.data!=='string'||m.data.length>550000||!/^[A-Za-z0-9+/]*={0,2}$/.test(m.data)))fail('Attach up to two supported photos or voice notes, 400 KB each.');
        const report={...common,type:payload.type,coordinate:payload.coordinate,accuracyM:payload.accuracyM,locationName:text(payload.locationName),note:payload.note?text(payload.note,1200):'',facilityId:payload.facilityId??null,observedAt,validUntil:new Date(Date.parse(observedAt)+3600000).toISOString(),media};
        if(report.facilityId&&!context.catalog.some(c=>c.services.some(s=>s.routes.some(r=>r.facilityId===report.facilityId))))fail('Choose a facility from this incident.');
        this.store.put('report',report.id,report);event(`${device.name} reported ${REPORT_TYPES[report.type].toLowerCase()} at ${report.locationName}.`);
      }else if(envelope.kind==='CONFIRMATION'||envelope.kind==='REQUEST_CONFIRMATION'){
        const report=this.store.get('report',payload.reportId);if(!report||report.groupId!==group.id)fail('Report not found in this team.');
        if(envelope.kind==='REQUEST_CONFIRMATION'){this.store.put('request',envelope.id,{...common,reportId:report.id,recipients:envelope.recipients});event(`${device.name} asked the team to check ${report.locationName}.`);}
        else {
          if(report.senderId===envelope.senderId)fail('A second responder must check this report.');
          if(!['CONFIRM','NOT_BLOCKED','PARTIALLY_BLOCKED','CANT_VERIFY'].includes(payload.answer))fail('Choose a confirmation response.');
          const observedAt=time(payload.observedAt);if(Date.parse(observedAt)>Date.parse(receivedAt)+60000)fail('Observation time cannot be in the future.');
          this.store.put('confirmation',envelope.id,{...common,reportId:report.id,answer:payload.answer,observedAt});event(`${device.name}: ${{CONFIRM:'confirmed the report',NOT_BLOCKED:'reported not blocked',PARTIALLY_BLOCKED:'reported partially blocked',CANT_VERIFY:'could not verify'}[payload.answer]} at ${report.locationName}.`);
        }
      }else if(envelope.kind==='MISSION'){
        if(this.records('mission',group).length>=100)fail('This team has reached 100 retained objectives.',507);
        const subject=context.catalog.find(c=>c.id===payload.subjectId),service=subject?.services.find(s=>s.id===payload.service);if(!subject||!service)fail('Choose a stored place and protected service.');
        const startAt=time(payload.startAt),endAt=time(payload.endAt);if(Date.parse(endAt)<=Date.parse(startAt)||Date.parse(endAt)-Date.parse(startAt)>7*86400000)fail('Mission end must follow start, within seven days.');
        const selected=service.routes.find(r=>r.id===payload.currentRouteId)??service.routes[0];
        const mission={...common,objective:text(payload.objective),subjectId:subject.id,subjectName:subject.name,service:service.id,startAt,endAt,currentRouteId:selected?.id??null,facilityIds:service.routes.map(r=>r.facilityId),importantRoads:[...new Set(service.routes.flatMap(r=>r.roads))],savedRoutes:service.routes,watchers:[envelope.senderId]};
        this.store.put('mission',mission.id,mission);event(`${device.name} started watching ${subject.name} · ${SERVICES[service.id]}.`);
      }else if(envelope.kind==='MISSION_UPDATE'){
        const m=this.store.get('mission',payload.missionId);if(!m||m.groupId!==group.id)fail('Mission not found.');
        const routes=context.catalog.find(s=>s.id===m.subjectId)?.services.find(s=>s.id===m.service)?.routes??[],route=routes.find(r=>r.id===payload.currentRouteId);
        if(!route)fail('Choose a current stored route.');
        this.store.put('mission',m.id,{...m,currentRouteId:route.id,savedRoutes:routes,facilityIds:routes.map(r=>r.facilityId),importantRoads:[...new Set(routes.flatMap(r=>r.roads))]});event(`${device.name} selected ${route.name} via ${route.roads.join(', ')} for ${m.subjectName}.`);
      }else if(envelope.kind==='WATCH'){
        const m=this.store.get('mission',payload.missionId);if(!m||m.groupId!==group.id)fail('Mission not found.');this.store.put('mission',m.id,{...m,watchers:payload.watching===false?m.watchers.filter(id=>id!==envelope.senderId):[...new Set([...m.watchers,envelope.senderId])]});
      }else if(envelope.kind==='MISSION_END'){
        const m=this.store.get('mission',payload.missionId);if(!m||m.groupId!==group.id)fail('Mission not found.');this.store.put('mission',m.id,{...m,endAt:receivedAt});event(`${device.name} ended “${m.objective}”.`);
      }else if(envelope.kind==='PRESENCE'){
        const location=payload.shareLocation===true?payload.location:null;if(location&&(!validPoint(location.coordinate)||!location.name))fail('Explicit shared location is required.');
        this.store.put('presence',group.id+':'+envelope.senderId,{...common,status:payload.status?text(payload.status,160):null,shareLocation:payload.shareLocation===true,location:location?{coordinate:location.coordinate,name:text(location.name),observedAt:time(location.observedAt)}:null});
      }else fail('Unsupported team action.');
      this.store.put('envelope',envelope.id,{...common,envelope,hash,relayedBy:via});this.evaluate(group,context);
      return {id:envelope.id,accepted:true,duplicate:false,receivedAt};
    });
  }
}
