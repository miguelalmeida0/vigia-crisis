import {openSituationDrawer,mountFacilityIntelligence} from "./ui/situation-intelligence.js";
import {installOperationalPicture} from './ui/operational-picture.js';
import {TechnicalDetails} from './ui/measurement-panel.js';
import {facilityTitle} from './ui/facility-detail.js';
import {openIncidentPicker} from './ui/incident-picker.js';
import {installSelectSystem} from './ui/select-runtime.js';
import { envelope, incidentEnvelope, value, canonicalIncidents, incidentId, incidentLabel, timeLabel } from '../canonicalViewModel.js';
import { e, select } from './ui/html.js';
import { rows, sourceFor, baseVM, OperationsViewModel, ReportsViewModel, isReadonly, text, activityVM } from './data/model.js';
import { decisionCategory } from '../routes/reportsAnalytics.js';
import { renderOperations, inspector, protectInspector } from '../routes/operations.js';
import { permittedWorkMarkup } from '../operatorTaskView.js';
import { vigiaApi } from '../vigiaApi.js';
import { intelligenceAnswerMarkup } from './ui/decision-intelligence.js';
import { ActivityFeed, ActivityTimeline } from './ui/activity.js';
import { AskVigia, TrustDrawer } from './ui/operator-answers.js';
import { FacilityDetail, FacilityTable } from './ui/field.js';
import {fieldModel} from './data/field.js';
import {attachPhysical,physicalVM} from './data/physical.js';
import {currentSignals,nationalCurrentMetric} from './data/hierarchy.js';
import {ReadingsDetail} from './ui/trends.js';
import { IntelligenceSources,IntelligencePlace } from './ui/incident-briefing.js';

export function approvedController({state,onAction,commit,persist,render,navigate,focusIncident,openIncidentWorkspace,showOverlay,syncQuery,setMobileNavigation,activeMap}) {
  installSelectSystem();
  installOperationalPicture({state,activeMap,showOverlay});
  let intelligenceRequest=0;
  const activityItems=()=>rows(value(envelope(state,'commandOverview'),'physicalWorld')?.activity);
  const activityOptions=()=>({type:state.approvedActivityType??'All types',days:state.approvedActivityDays??'7',now:envelope(state,'commandOverview')?.generatedAt,limit:state.approvedActivityLimit??5});
  const updateActivity=()=>{document.querySelectorAll('.activity-feed').forEach(feed=>{feed.outerHTML=ActivityFeed(activityItems(),activityOptions());});};
  const set=(field,parameter,next,fallback='ALL')=>{syncQuery(parameter,next,{defaultValue:fallback});commit(s=>{s[field]=next;if(parameter!=='page'){s.incidentPage=1;}});};
  function change(target){const key=target.dataset.control,v=target.value;if(key==='activity-range'){state.approvedActivityDays=v;updateActivity();document.querySelector('[data-control="activity-range"]')?.focus();return true;}if(key==='region'){void onAction(`global-region-focus:${encodeURIComponent(v)}`);return true;}if(key==='national-type'){void onAction('global-type:'+v);return true;}if(key==='national-layer'){commit(s=>{s.approvedNationalLayer=v;const identity=activeMap()?.dataset.mapSceneIdentity;if(identity)s.mapLayerVisibility={...s.mapLayerVisibility,[identity]:{...s.mapLayerVisibility?.[identity],weather:v==='weather',observations:v==='incidents'}};});return true;}const fields={'incident-status':['incidentStateFilter','status'],'incident-type':['incidentTypeFilter','type'],'incident-priority':['incidentPriority','priority'],'report-period':['reportsRange','range']};if(fields[key]){const [field,param]=fields[key];set(field,param,v,key==='report-period'?'H24':'ALL');return true;}if(key==='context-incident'){document.querySelector('.vigia-dialog [data-dialog-close]')?.click();void onAction(`select-context-incident:${v}`);return true;}return false;}
  async function action(target){const kind=target.dataset.action,id=target.dataset.id;
    const route=String(globalThis.location?.hash??'').replace(/^#\//,'').split('?')[0];
    const physical=()=>value(sourceFor(state,route),'physicalWorld');
    const current=()=>rows(physical()?.incidents).find(i=>String(i.incidentId).replace(/^incident:/,'')===String(state.selectedIncidentId).replace(/^incident:/,''));
    const field=()=>fieldModel(attachPhysical(baseVM(state,route)));
    const briefing=()=>value(sourceFor(state,route),'incidentIntelligence');
    if(kind==='intelligence-sources'){showOverlay('Incident sources and information gaps',IntelligenceSources(briefing()),{kind:'drawer'});return true;}
    if(kind==='intelligence-place'){showOverlay('Place details',IntelligencePlace(briefing(),id),{kind:'drawer'});return true;}
    if(kind?.startsWith('inspect-incident:')){const selectedId=kind.slice('inspect-incident:'.length),vm=baseVM(state,route),incident=rows(vm.incidents).find(item=>item.id===selectedId)??(vm.incident?.id===selectedId?vm.incident:null);if(incident){void focusIncident(selectedId);showOverlay(incident.name,`<div class="incident-map-summary"><p>${e(incident.statusLabel)} · ${e(incident.type)}</p><p>${e(incident.region??'')}</p><p>Incident observed ${e(timeLabel(incident.observedAt))}</p><button class="btn primary" data-action="open-incident" data-id="${e(selectedId)}">Open incident</button></div>`,{kind:'drawer'});}return true;}
    if(kind==='condition-readings'){showOverlay('Conditions over time · readings',ReadingsDetail(field()),{kind:'drawer'});return true;}
    if(kind==='national-notices'){const notices=physical()?.national?.warnings??[];showOverlay('Active weather notices',notices.filter(w=>w.state==='ACTIVE').map(w=>`<article><h3>${e(w.type??w.event??w.title??'Weather notice')} · ${e(w.area??w.areaName??'')}</h3><p>${e(w.text??w.description??w.headline??'')}</p><p>Effective ${e(w.effective)} · Expires ${e(w.expires)} · IPMA</p></article>`).join(''),{kind:'drawer'});return true;}
    if(kind==='data-coverage'){const p=physicalVM(current()),items=['temperature','wind','gust','humidity','rain','fireDanger','thermalTime','warnings','aqCategory'].map(id=>p.metrics[id]).filter(Boolean);showOverlay('Data coverage',`<div class="ux-trust"><p>Check what is measured, where it was measured and what is missing.</p>${items.map(m=>TechnicalDetails(m.label+' · '+(m.available?m.display+' '+m.unit:m.display),TrustDrawer(m))).join('')}</div>`,{kind:'drawer'});return true;}
    if(kind==='all-support'){showOverlay('All mapped support points',FacilityTable(field()),{kind:'drawer'});return true;}
    if(kind==='field-facility-tab'){state.approvedFacilityKind=target.dataset.kind;const table=document.querySelector('.vigia-dialog .field-facilities-panel');if(table)table.outerHTML=FacilityTable(field());else commit(s=>{s.approvedFacilityKind=target.dataset.kind;});document.querySelector(`[data-action="field-facility-tab"][data-kind="${target.dataset.kind}"]`)?.focus();return true;}
    if(kind==='field-facility'||kind?.startsWith('inspect-map-feature:response-facility:')){const selected=kind==='field-facility'?id:kind.slice('inspect-map-feature:response-facility:'.length),response=value(sourceFor(state,'operations'),'responseCapability');const facility=Object.values(response?.facilities??{}).flat().find(f=>f.id===selected||f.canonicalId===selected)??briefing()?.exposure?.relationships?.map(r=>({...r.feature,distanceKm:r.distanceFromPointM/1000})).find(f=>f.id===selected||f.canonicalId===selected);if(facility){showOverlay(facilityTitle(facility),FacilityDetail(facility)+"<div data-facility-intelligence><p>Loading stored access relationships…</p></div>"+(target.closest?.('.vigia-dialog')?'<button type="button" class="btn" data-action="all-support">Back to support points</button>':''),{kind:'drawer'});void mountFacilityIntelligence({state,activeMap,facility,host:document.querySelector('[data-facility-intelligence]')});}return true;}
    if(kind?.startsWith('inspect-community:')){openSituationDrawer({state,showOverlay,activeMap,selectedEntity:kind.slice(18)});return true;}
    if(kind==='ask-vigia'){openSituationDrawer({state,showOverlay,activeMap,question:target.dataset.question});return true;}
    if(kind==='fact-inspect'){
      const p=physical(),c=current(),facts=[...rows(p?.summary),...rows(c?.metrics),...rows(c?.weather?.metrics),...rows(c?.thermal?.metrics),...rows(c?.air?.metrics),c?.status,c?.warnings?.metric,c?.fireDanger,nationalCurrentMetric({source:sourceFor(state,route),generatedAt:sourceFor(state,route)?.generatedAt})];
      showOverlay('Why this reading?',TrustDrawer(facts.find(f=>f?.id===id)??currentSignals(physicalVM(c)).find(f=>f.id===id)),{kind:'drawer'});return true;
    }
    if(kind==='answer-inspect'){
      const a=current()?.questions?.[id];
      showOverlay('Why this answer?',a?`<p>${e(a.primaryAnswer)}</p><ul>${a.limitations.map(l=>`<li>${e(l)}</li>`).join('')}</ul>${a.supportingFacts.map(f=>`<details class="ux-disclosure"><summary>${e(f.label)}</summary><div class="ux-disclosure-body">${TrustDrawer(f)}</div></details>`).join('')}<details class="ux-disclosure"><summary>Question audit reference</summary><p>${e(a.auditRef)}</p><p>Answered as of ${e(a.asOf)}</p></details>`:'<p>This answer has not been returned for the current incident.</p>',{kind:'drawer'});return true;
    }
    if(['intelligence-ask','intelligence-history','intelligence-counterfactual'].includes(kind)){
      const root=target.closest('[data-intelligence-query]')??document.querySelector('[data-intelligence-query]'),answer=root?.querySelector('[data-intelligence-answer]');if(!answer)return true;
      const selected=state.selectedIncidentId,scope=root.dataset?.queryIncident??selected,question=root.querySelector('[name="intelligence-question"]')?.value||'What is blocking verification?',asOf=root.querySelector('[name="intelligence-as-of"]')?.value||null;
      const request=++intelligenceRequest;
      target.disabled=true;answer.textContent='Reading the available observations…';
      try{const result=kind==='intelligence-counterfactual'?await vigiaApi.intelligenceCounterfactual({incidentId:scope,kind:'SOURCE_FAILURE',entityId:id}):await vigiaApi.intelligenceQuery({incidentId:kind==='intelligence-history'?selected:scope,question,asOf,mode:kind==='intelligence-history'?'history':null});
        if(request===intelligenceRequest&&answer.isConnected&&selected===state.selectedIncidentId)answer.innerHTML=intelligenceAnswerMarkup(result);
      }catch(error){if(request===intelligenceRequest&&answer.isConnected&&selected===state.selectedIncidentId)answer.textContent=`Intelligence request unavailable: ${error.message}. No substitute answer was generated.`;}finally{target.disabled=false;}
      return true;
    }
    if(kind==='intelligence-review'){
      const actor=state.runtime?.session?.actor?.id;
      if(!actor)return true;
      const route=String(globalThis.location?.hash??'').replace(/^#\//,'').split('?')[0];
      const source=sourceFor(state,route),changes=[...(value(source,'operationalIntelligence')?.changes??[]),...(value(source,'decisionIntelligence')?.watches??[])];
      commit(s=>{s.intelligenceReviewedChanges={...(s.intelligenceReviewedChanges??{}),[actor]:[...new Set([...(s.intelligenceReviewedChanges?.[actor]??[]),...changes.map(c=>c.id)])].slice(-500)};});
      return true;
    }
    if(kind==='select-region'){const y=globalThis.scrollY??0;await onAction(`global-region-focus:${encodeURIComponent(target.dataset.region)}`);globalThis.requestAnimationFrame?.(()=>{globalThis.scrollTo?.(0,y);document.querySelector('[data-action="select-region"][aria-pressed="true"]')?.focus({preventScroll:true});});return true;}
    if(kind==='reset-national'){state.approvedNationalLayer='incidents';await onAction('map-reset-world');return true;}
    if(kind==='regional-incidents'){const region=state.globalRegion;navigate('incidents');set('incidentRegion','region',region);return true;}
    if(kind==='report-tab'){await onAction(`reports-tab:${target.dataset.tab==='decisions'?'summary':target.dataset.tab}`);return true;}
    if(kind==='compare'){await onAction('reports-compare');return true;}
    if(kind==='export-report'){await onAction('reports-export');return true;}
    if(['report-records','category-detail','category-definitions','quality-definition','outcome-requirements','exercise-history','outcome-records'].includes(kind)){
      const vm=ReportsViewModel(state),facts=items=>`<dl>${items.map(([name,content])=>`<div><dt>${e(name)}</dt><dd>${e(content??'Not reported')}</dd></div>`).join('')}</dl>`;
      let title='Report records',body='';
      if(kind==='report-records'||kind==='category-detail'){const items=rows(vm.decisions).filter(i=>kind!=='category-detail'||decisionCategory(i)===target.dataset.name);body=items.length?`<ol>${items.map(i=>`<li><strong>${e(decisionCategory(i))}</strong><p>${e(text(i.reason??i.decision??i.title))}</p><time>${e(timeLabel(i.at??i.createdAt??i.routedAt))}</time><p>${e(text(i.state??i.workState))}</p>${i.incidentId?`<button class="btn" data-action="open-incident-workspace:${e(i.incidentId)}">Open incident</button>`:''}</li>`).join('')}</ol>`:'<p>No dated records match this period and category.</p>';}
      if(kind==='category-definitions')body='<p>Categories summarize the recorded decision rationale. They do not merge requirements, establish verification, or count a response outcome. Records without a timestamp are excluded from period comparisons.</p>';
      if(kind==='quality-definition'){title='Information quality';body=facts(rows(vm.quality?.dimensions).map(d=>[d.label,`${d.definition} ${d.state==='MEASURED'?`${d.numerator} / ${d.denominator}`:'Not measured'}`]));}
      if(kind==='outcome-requirements'){title='Outcome measurement requirements';body=facts([['Largest blocker',vm.plan?.largestBlocker?.label],['Next step',vm.plan?.largestBlocker?.remediation],['Lineage validated',vm.plan?.lineageValidated],['Last evaluated',timeLabel(vm.plan?.lastEvaluatedAt)],['Boundary','Only eligible live action-to-outcome chains count. Source tasks and exercises are excluded.']]);}
      if(kind==='exercise-history'){title='Isolated exercises and replays';body='<p>These records are excluded from live production truth.</p>'+facts(rows(vm.plan?.certifiedReplay?.stages).map(s=>[s.label,s.count]))+`<details><summary>Retained exercise provenance</summary><pre>${e(JSON.stringify(vm.plan?.certifiedReplay??{state:'Not returned'},null,2))}</pre></details>`;}
      if(kind==='outcome-records'){title='Eligible live outcome records';const items=rows(vm.outcome?.loops).filter(x=>x.universe==='LIVE_PRODUCTION');body=items.length?facts(items.map(i=>[text(i.title??i.label??'Live outcome record'),text(i.state??i.outcomeClassification?.causalProtectionOutcome)])):'<p>No qualifying live outcome records were returned. This does not establish zero impact.</p>';}
      showOverlay(title,body,{kind:'drawer'});return true;
    }
    if(kind==='question'){commit(s=>s.approvedQuestionId=id);return true;}
    if(kind==='task-tab'){commit(s=>{s.approvedTaskTab=target.dataset.tab;s.selectedOperationId=null;});return true;}
    if(kind==='select-task'){commit(s=>s.selectedOperationId=id);return true;}
    if(kind==='task-more'){
      const vm=OperationsViewModel(state),shown=rows(vm.tasks).filter(t=>vm.ui.taskTab==='all'||t.status===vm.ui.taskTab),selected=shown.find(t=>t.id===state.selectedOperationId)??shown[0];
      if(selected)showOverlay(selected.title,permittedWorkMarkup(selected.kind==='protect'?protectInspector(selected.raw):inspector(selected.raw,0,vm.generatedAt,state.runtime.session?.actor,vm.incident?.raw),!isReadonly(vm)),{kind:'drawer'});return true;
    }
    if(kind==='workflow-controls'){
      const template=document.createElement('template');template.innerHTML=renderOperations(state);
      const candidates=[...template.content.querySelectorAll('.operations-period-context,.operations-period-workflow,.operations-route>.technical-details,.operations-route>.executive-disclosure')];
      const controls=candidates.filter(el=>!candidates.some(parent=>parent!==el&&parent.contains(el)));
      showOverlay('Governed workflow controls',controls.map(el=>el.outerHTML).join('')||'<p>No workflow controls are available for this incident and session.</p>',{kind:'drawer'});return true;
    }
    if(kind==='open-incident'){document.querySelector('.vigia-dialog [data-dialog-close]')?.click();await openIncidentWorkspace(id);return true;}
    if(kind==='select-incident'&&id){if(globalThis.matchMedia?.('(max-width: 760px)').matches)state.approvedMobilePreview=true;await focusIncident(id);if(state.approvedMobilePreview){globalThis.scrollTo?.(0,0);document.querySelector('.incident-preview-panel [data-action="open-incident"]')?.focus({preventScroll:true});}return true;}
    if(kind==='incident-preview-open'||kind==='incident-preview-close'){commit(s=>{s.approvedMobilePreview=kind==='incident-preview-open';});document.querySelector(kind==='incident-preview-open'?'.incident-preview-panel [data-action="open-incident"]':'.incident-row[aria-pressed="true"]')?.focus({preventScroll:true});globalThis.scrollTo?.(0,0);return true;}
    if(kind==='page'){set('incidentPage','page',Math.max(1,Number(target.dataset.page)),1);return true;}
    if(kind==='clear-search'){await onAction('clear-incident-search');return true;}
    if(kind==='reset-filters'){Object.assign(state,{incidentPriority:'ALL',incidentRegion:'ALL',incidentSearchDraft:''});syncQuery('priority',null);syncQuery('region',null);await onAction('reset-incident-filters');return true;}
    if(kind==='nav-toggle'){setMobileNavigation(!state.navOpen);return true;}
    if(kind==='nav-close'){setMobileNavigation(false);return true;}
    if(kind==='choose-incident'){openIncidentPicker({incidents:canonicalIncidents(envelope(state,'incidents')),selected:state.selectedIncidentId,showOverlay,onSelect:id=>void onAction('select-context-incident:'+id)});return true;}
    if(kind==='system-info'){const source=envelope(state,'commandOverview'),axes=value(source,'healthAxes');showOverlay('System health',`<dl>${Object.entries(axes??{}).map(([key,item])=>`<div><dt>${e(key.replace(/([A-Z])/g,' $1'))}</dt><dd>${e(item.state??'Not measured')}</dd><dd>${e(item.reason??item.definition??'')}</dd></div>`).join('')}</dl>`,{kind:'drawer'});return true;}
    if(kind==='activity-more'){state.approvedActivityLimit=(state.approvedActivityLimit??5)+5;updateActivity();document.querySelector('[data-action="activity-more"]')?.focus();return true;}
    if(kind==='operator-alert'){const p=value(envelope(state,'commandOverview'),'physicalWorld'),changes=rows(p?.activity).filter(c=>c.material===true&&Date.parse(c.at)>=Date.parse(p.asOf)-3600000),item=changes[Number(id)];if(item)showOverlay('Operator alert',`<p>${e(item.text)}</p><dl><dt>Where</dt><dd>${e(item.where??'Location not supplied')}</dd><dt>Source</dt><dd>${e(item.source??'Not supplied')}</dd><dt>Observed</dt><dd>${e(timeLabel(item.at))}</dd></dl><details class="ux-disclosure"><summary>Source record</summary><pre>${e(JSON.stringify(item,null,2))}</pre></details>`,{kind:'drawer'});return true;}
    if(kind==='activity-filter'){state.approvedActivityType=target.dataset.type;updateActivity();document.querySelector('.activity-filters [data-type="'+CSS.escape(state.approvedActivityType)+'"]')?.focus();return true;}
    if(kind==='activity-view'){const items=activityItems(),item=items[Number(id)];if(item){showOverlay('Activity details',ActivityTimeline(items,{...activityOptions(),selectedKey:String(id)}),{kind:'drawer'});document.querySelector('.timeline-event.is-selected')?.scrollIntoView({block:'nearest'});}return true;}
    if(kind==='activity'||kind==='incident-history'){const items=kind==='incident-history'?rows(value(incidentEnvelope(state,'detail'),'physicalWorld')?.activity):activityItems();showOverlay(kind==='incident-history'?'Incident physical history':'Activity details',ActivityTimeline(items,kind==='incident-history'?{}:activityOptions())+`<details class="ux-disclosure"><summary>Internal audit history</summary>${ActivityTimeline(kind==='incident-history'?rows(value(incidentEnvelope(state,'detail'),'operationalTimeline')):rows(value(envelope(state,'commandOverview'),'commandPresentation')?.activity),{includeInternal:true})}</details>`,{kind:'drawer'});return true;}

    if(kind==='expand-map'||kind==='national-fullscreen'){const panel=activeMap()?.closest('.map-unit');if(panel){if(document.fullscreenElement)await document.exitFullscreen();else await panel.requestFullscreen();}return true;}
    return false;
  }
  return {action,change};
}
