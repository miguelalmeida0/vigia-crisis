import { button } from '../ui/html.js';
import { fieldModel } from '../data/field.js';
import { FieldBanner,FieldSignals,FieldMap,FieldFeed,FacilityTable,RoadOptions,LocationContext,WhyNow,OfficialNotices } from '../ui/field.js';
import {ResponseCoverage,ResponseSnapshot,AccessApproaches,NearestSupport,AccessConditions,AccessInterpretation} from '../ui/access.js';
import {OperationalSlot} from '../ui/operational-picture.js';
import {MissionSlot} from '../ui/mission-command.js';
export function responseAccess(vm) {
 if(!vm.incident)return `<div class="field-select"><h2>Choose an incident</h2><p>Explore access, surrounding places and mapped response facilities.</p>${button('Choose incident','choose-incident')}</div>`;
 const f=fieldModel(vm),rail=AccessApproaches(f);
 return `<div class="field-page response-priority-page" data-vqa="response-access">${FieldBanner(vm,f,{response:true})}${ResponseCoverage(f)}<div class="field-workspace op-layout"><div class="field-primary">${FieldMap(vm,{response:true})}<div class="op-map-key"><strong>Operational Picture</strong><span>Incident · communities · qualified support · calculated routes</span></div></div><aside class="field-rail" aria-label="Operational support">${MissionSlot()}<details><summary>Operational support and map tools</summary>${OperationalSlot()}</details></aside></div><details class="physical-detail"><summary>Geographic context and other mapped facilities</summary>${NearestSupport(f)}${rail}</details><div class="response-context-row">${AccessConditions(f)}${OfficialNotices(f)}</div>${AccessInterpretation(f)}<div class="response-secondary">${LocationContext(vm,f)}${FieldFeed(f.events,{title:'Recent field & environmental changes',limit:4})}</div></div>`;
}
