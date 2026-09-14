import { button } from '../ui/html.js';
import { fieldModel } from '../data/field.js';
import { FieldBanner,FieldSignals,FieldMap,FieldFeed,WeatherHistory,ObservationContext,ThermalPanel,OfficialNotices } from '../ui/field.js';
import { briefingFor,BriefingChanges,NearbyIntelligence } from '../ui/incident-briefing.js';
export function fireActivity(vm) {
 if(!vm.incident)return `<div class="field-select"><h2>Choose an incident</h2><p>Open the fire location and its latest observations.</p>${button('Choose incident','choose-incident')}</div>`;
 const f=fieldModel(vm),briefing=briefingFor(vm),rail=BriefingChanges(briefing)+WeatherHistory(f)+ThermalPanel(f)+OfficialNotices(f)+(f.events.length?`<details class="field-event-history"><summary>Dated field updates · ${f.events.length}</summary>${FieldFeed(f.events)}</details>`:'');
 return `<div class="field-page" data-vqa="fire-activity">${FieldBanner(vm,f)}${FieldSignals(f)}<div class="field-workspace ${rail?'':'field-workspace-solo'}"><div class="field-primary">${FieldMap(vm)}${NearbyIntelligence(briefing)}</div>${rail?`<aside class="field-rail" aria-label="Fire activity context">${rail}</aside>`:''}</div></div>`;
}
