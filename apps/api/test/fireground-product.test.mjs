import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{controlledFiregroundProjection}from'./fixtures/fireground-controlled-exercise.mjs';
import{commandModel}from'../../web/src/v2/fireground/model.js';
import{controlledHarness}from'../../web/src/v2/fireground/controlled-harness.js';
import{commandSidebar,connectionBanner}from'../../web/src/v2/fireground/components.js';
import{accountabilityView,dispatchView,maydayView}from'../../web/src/v2/fireground/views/specialized.js';
import{divisionView,firefighterView,incidentCommandView,officerView}from'../../web/src/v2/fireground/views/roles.js';
import{assignmentsPanel,changesPanel,evacuationPanel,fallbackPanel,fieldnetPanel,parPanel,peoplePanel,resourcesPanel,timelinePanel}from'../../web/src/v2/fireground/views/panels.js';

const model=(role)=>commandModel(controlledFiregroundProjection(role),role);
const plain=(html)=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const includesAll=(html,values)=>values.every((value)=>plain(html).toLowerCase().includes(value.toLowerCase()));

test('deterministic information-retrieval QA completes all five role tasks with no wrong answer',()=>{
  const cases=[
    ['FIREFIGHTER',firefighterView(model('FIREFIGHTER')),['Open attic and support search','Truck 3','Fire below','Exterior ladder','Evacuate Division 2'],['regional coordination','precision','recall']],
    ['COMPANY_OFFICER',officerView(model('COMPANY_OFFICER')),['Truck 3','SEPARATION ADVISORY','MEMBER NOT CONFIRMED OUTSIDE','FF Duarte'],['scientific proof']],
    ['DIVISION_SUPERVISOR',divisionView(model('DIVISION_SUPERVISOR')),['Division 2','PROGRESS OVERDUE','Relief engine + backup line'],['detector','confidence score']],
    ['INCIDENT_COMMAND',incidentCommandView(model('INCIDENT_COMMAND')),['Firefighter not confirmed outside','Primary water degraded','RIT assigned — not ready','Evacuation acknowledgement incomplete'],['precision','candidate robustness']],
    ['DISPATCH_EOC',dispatchView(model('DISPATCH_EOC')),['Second water tender','12 min','LOW','North access'],['FF Duarte','attic search']]
  ];
  const results=cases.map(([role,html,answers,wrong])=>({role,complete:includesAll(html,answers),wrongAnswer:wrong.some((value)=>plain(html).includes(value))}));
  assert.deepEqual(results.map((item)=>item.complete),[true,true,true,true,true]);
  assert.deepEqual(results.map((item)=>item.wrongAnswer),[false,false,false,false,false]);
  assert.equal(new Set(cases.map(([,html])=>plain(html))).size,5);
});

test('accountability preserves individual truth and never turns uncertain location into an exact point',()=>{
  const html=accountabilityView(model('ACCOUNTABILITY'));
  for(const value of ['FF Martins','FF Duarte','DEVICE ESTIMATED','uncertainty region','REPORTED','NOT CONFIRMED OUTSIDE','MAYDAY'])assert.match(plain(html),new RegExp(value,'i'));
  assert.doesNotMatch(html,/latitude|longitude|coordinates|39\.[0-9]{3,}|-8\.[0-9]{3,}/i);
});

test('acknowledged evacuation remains incomplete until every member is outside, reunited, and PAR-confirmed',()=>{
  const html=incidentCommandView(model('INCIDENT_COMMAND'));
  assert.match(plain(html),/Evacuate Division 2/);
  assert.match(html,/is-current[^>]*>[\s\S]*ACKNOWLEDGED/);
  assert.match(plain(html),/Outside 2 \/ 3/);
  assert.match(plain(html),/PAR INCOMPLETE/);
  assert.match(plain(html),/Acknowledged ≠ action underway ≠ physically complete/);
});

test('Mayday operating state pins the member through rescue workflow and physical recovery',()=>{
  const html=maydayView(model('MAYDAY_RESCUE'));
  for(const value of ['MAYDAY ACTIVE','FF Duarte','PINNED UNTIL PHYSICALLY RECOVERED','LOCATION CONFIRMATION','RESCUE ASSIGNMENT','RESCUE ENTRY','FIRE CONTROL PROTECTION','PHYSICAL RECOVERY','Confirm physical recovery'])assert.match(plain(html),new RegExp(value,'i'));
  assert.doesNotMatch(plain(html),/survival countdown/i);
  assert.match(plain(html),/never predicted survival/i);
});

test('FieldNet view keeps essential command actions visible while central truth is stale',()=>{
  const html=fieldnetPanel(model('INCIDENT_COMMAND'));
  for(const value of ['LOCAL INCIDENT STATE','LAST CENTRAL SYNC','SYNC QUEUE','Report status','Submit PAR','Report location','Resource status'])assert.match(plain(html),new RegExp(value,'i'));
  assert.doesNotMatch(plain(html),/network failed/i);
});

test('resource and water view separates pump engagement, verified flow, sustainability, and demand gap',()=>{
  const html=resourcesPanel(model('INCIDENT_COMMAND'));
  for(const value of ['Engine 7','Rescue 2','Tanker 5','Pump','ENGAGED','Water flowing','CONFIRMED FLOW','Sustainable','NOT CONFIRMED','Demand gap','One backup line'])assert.match(plain(html),new RegExp(value,'i'));
});

test('critical field controls meet the 48px floor and responsive role navigation avoids eight equal mobile tabs',async()=>{
  const css=await readFile(new URL('../../web/styles/v2/fireground-responsive.css',import.meta.url),'utf8');
  assert.match(css,/fg-pocket-actions button\{min-height:60px/);
  assert.match(css,/@media\(max-width:440px\)[\s\S]*fg-pocket-actions button\{min-height:64px/);
  assert.match(css,/@media\(max-width:800px\)[\s\S]*fg-nav button\{display:none/);
  assert.match(css,/data-fg-panel="mayday"/);
});

test('runtime controlled harness uses Agent 1 lifecycle states and remains explicitly shadow-only',()=>{
  const raw=controlledHarness('INCIDENT_COMMAND'),view=incidentCommandView(commandModel(raw,'INCIDENT_COMMAND'));
  assert.equal(raw.controlled,true);assert.equal(raw.incident.universe,'SHADOW');assert.match(plain(view),/Alpha Two|Mayday/i);assert.match(plain(view),/pump is engaged but the attack line has no verified flow/i);assert.match(plain(view),/Acknowledgement does not prove every member is outside/i);
  assert.deepEqual([raw.orders[0].state,raw.evacuations[0].state,raw.maydays[0].state],['ACTION_UNDERWAY','CREW_WITHDRAWING','RESCUE_ENTRY']);
});

test('incident command overview exposes the selected compact field-operations hierarchy',()=>{
  const current=commandModel(controlledHarness('INCIDENT_COMMAND'),'INCIDENT_COMMAND'),html=`${commandSidebar(current,'overview')}${connectionBanner(current)}${incidentCommandView(current)}`;
  for(const value of ['fg-command-dashboard','fg-incident-card','fg-actions-card','fg-accountability-card','fg-tactical-card','fg-command-actions','data-fg-tactical-map'])assert.match(html,new RegExp(value));
  for(const value of ['Recover Alpha Two','Confirm water is flowing','Complete PAR','View sync queue','Open print fallback'])assert.match(plain(html),new RegExp(value,'i'));
  assert.match(html,/\/assets\/icons\/flame\.svg/);assert.doesNotMatch(html,/[🔥⚠️✅]/u);
});

test('every incident route uses the same selected command-page grammar and governed controls',()=>{
  const current=model('INCIDENT_COMMAND'),routes=[peoplePanel(current),assignmentsPanel(current),parPanel(current),evacuationPanel(current),changesPanel(current),resourcesPanel(current),fieldnetPanel(current),timelinePanel(current),fallbackPanel(current)];
  for(const html of routes){assert.match(html,/fg-system-page/);assert.match(html,/\/assets\/icons\//);assert.doesNotMatch(html,/[🔥⚠️✅]/u);}
  for(const html of [peoplePanel(current),assignmentsPanel(current),resourcesPanel(current)])assert.match(html,/fg-metric-strip/);
  assert.match(peoplePanel(current),/data-fg-filter="people-search"/);assert.match(assignmentsPanel(current),/data-fg-filter="assignments-search"/);assert.match(resourcesPanel(current),/data-fg-filter="resources-state"/);assert.match(timelinePanel(current),/data-fg-timeline-filter="WATER"/);
});

test('runtime cannot substitute the controlled harness into a production incident route',async()=>{
  const source=await readFile(new URL('../../web/src/v2/fireground/runtime.js',import.meta.url),'utf8');
  assert.match(source,/current\.exercise&&current\.incidentId===CONTROLLED_INCIDENT/);assert.doesNotMatch(source,/catch\([^)]*\)\s*\{\s*return controlledHarness/);
});
