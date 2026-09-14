import{commandSidebar,connectionBanner,incidentHeader}from'./components.js';
import{activeMayday}from'./model.js';
import{accountabilityView,commandTransferView,dispatchView,maydayView}from'./views/specialized.js';
import{divisionView,firefighterView,incidentCommandView,officerView}from'./views/roles.js';
import{afterActionPanel,assignmentsPanel,changesPanel,evacuationPanel,fallbackPanel,fieldnetPanel,handoffPanel,parPanel,peoplePanel,resourcesPanel,timelinePanel,unknownPanel}from'./views/panels.js';
import{ageLabel,escapeHtml,roleLabel,text,timeLabel}from'./format.js';

export function renderFireground(shell,model,{panel='overview',message=null}={}){
  const mayday=activeMayday(model),effectivePanel=panel==='mayday'&&!mayday?'overview':panel;
  shell.dataset.role=model.role;shell.dataset.panel=effectivePanel;shell.dataset.mayday=String(Boolean(mayday));shell.dataset.offline=String(!['CENTRAL_CONFIRMED','CONNECTED'].includes(model.connection.state??model.connection.connectionState));
  shell.innerHTML=`<div class="fg-app-shell">${commandSidebar(model,effectivePanel)}<div class="fg-main-shell">${incidentHeader(model)}${connectionBanner(model)}<div class="fg-content" id="fireground-content" tabindex="-1">${printMetadata(model)}${message?`<div class="fg-message" role="status">${escapeHtml(message)}</div>`:''}${panelContent(model,effectivePanel)}${effectivePanel==='overview'&&model.role==='INCIDENT_COMMAND'?'':manualLinks(model)}</div></div></div>`;
}

function printMetadata(model){const unknowns=model.unknowns.map((item)=>item.rule??item.requiredVerification??item).join(' · ')||'None recorded';return`<section class="fg-print-meta"><strong>VIGIA MANUAL FALLBACK · ${escapeHtml(model.controlled?'SHADOW / CONTROLLED':'ACTIVE OPERATION')}</strong><dl><div><dt>Incident</dt><dd>${escapeHtml(model.incident.name)} · ${escapeHtml(model.incident.incidentId)}</dd></div><div><dt>Generated</dt><dd>${escapeHtml(timeLabel(model.generatedAt))}</dd></div><div><dt>Release</dt><dd>${escapeHtml(text(model.release.releaseId))}</dd></div><div><dt>Last sync</dt><dd>${escapeHtml(timeLabel(model.connection.lastSyncAt))} · ${escapeHtml(ageLabel(model.connection.lastSyncAt))}</dd></div><div><dt>Data age</dt><dd>${escapeHtml(ageLabel(model.generatedAt))}</dd></div><div><dt>Unknowns</dt><dd>${escapeHtml(unknowns)}</dd></div></dl></section>`;}

function panelContent(model,panel){
  if(panel==='people')return model.role==='ACCOUNTABILITY'?accountabilityView(model):peoplePanel(model);
  if(panel==='assignments')return assignmentsPanel(model);
  if(panel==='par')return parPanel(model);
  if(panel==='evacuation')return evacuationPanel(model);
  if(panel==='changes')return changesPanel(model);
  if(panel==='resources')return resourcesPanel(model);
  if(panel==='mayday')return maydayView(model);
  if(panel==='fieldnet')return fieldnetPanel(model);
  if(panel==='timeline')return timelinePanel(model);
  if(panel==='fallback')return fallbackPanel(model);
  if(panel==='handoff')return handoffPanel(model);
  if(panel==='afteraction')return afterActionPanel(model);
  if(panel==='transfer')return commandTransferView(model);
  if(panel!=='overview')return unknownPanel(panel);
  if(model.role==='FIREFIGHTER')return firefighterView(model);
  if(model.role==='COMPANY_OFFICER')return officerView(model);
  if(model.role==='DIVISION_SUPERVISOR')return divisionView(model);
  if(model.role==='DISPATCH_EOC')return dispatchView(model);
  if(model.role==='ACCOUNTABILITY')return accountabilityView(model);
  if(model.role==='MAYDAY_RESCUE')return maydayView(model);
  return incidentCommandView(model);
}

function manualLinks(model){const p0=model.releaseGates.p0Complete===true;return`<footer class="fg-manual-links"><div><span>MANUAL / PAPER FALLBACK</span><strong>Keep radio and paper procedures active</strong></div><button type="button" data-fg-panel="fallback">Open print package</button><button type="button" data-fg-panel="transfer" ${p0?'':'aria-describedby="transfer-deferred"'}>Command transfer</button>${p0?'':'<small id="transfer-deferred">Deferred until P0 gates pass.</small>'}</footer>`;}

export function renderFiregroundLoading(shell){shell.innerHTML='<div class="fg-loading" role="status"><span></span><strong>Loading active incident truth</strong><p>Role projection and FieldNet state are being resolved.</p></div>';}
export function renderFiregroundError(shell,error,incidentId){shell.innerHTML=`<div class="fg-error" role="alert"><span>ACTIVE INCIDENT UNAVAILABLE</span><h1>Command projection could not be loaded</h1><p>${escapeHtml(error?.message??error)}</p><strong>${escapeHtml(incidentId)}</strong><div><button type="button" data-fg-action="retry">Retry</button><a href="#">Return to territory command</a></div></div>`;}
