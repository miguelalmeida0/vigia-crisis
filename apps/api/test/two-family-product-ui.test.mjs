import test from 'node:test';
import assert from 'node:assert/strict';
import { queueItems } from '../../web/src/v2/app/selectors.js';
import { renderQueue } from '../../web/src/v2/components/queue.js';
import { incidentsIntro, incidentsSummary } from '../../web/src/v2/views/incidents.js';
import { associationCard } from '../../web/src/v2/views/event-presenter.js';
import { liveInspector } from '../../web/src/v2/views/live.js';

const event={id:'PT-TWO-FAMILY',label:'Thermal candidate near Beja district',firstSeenAt:'2026-08-13T07:00:00.000Z',lastSeenAt:'2026-08-13T08:00:00.000Z',coordinate:[-7.9,38],evidenceState:'satellite-only',reportState:{sourceActivity:'no_report'},physicalState:{freshness:'stale'},physicalSourceProfile:{families:['viirs','sentinel3_slstr'],familyCount:2,twoPhysicalSourceFamilies:true},fireEvidenceState:{physicalSourceFamilyCount:2,twoPhysicalSourceFamilies:true},actionNeed:{needsRouting:false},observations:[{id:'viirs',type:'thermal',sourceFamily:'viirs',instrument:'VIIRS',at:'2026-08-13T07:00:00.000Z',frpMw:3.1},{id:'s3',type:'thermal',sourceFamily:'sentinel3_slstr',instrument:'SLSTR',at:'2026-08-13T08:00:00.000Z',frpMw:4.2}]};
const bootstrap={actor:{authentication:{authenticated:false}},prevention:{findings:[],candidates:[]},detection:{incidents:[]},operations:{evidenceRequests:[],remediations:[]},outcomes:{loops:[]}};

test('Fire Multisource includes a real two-family physical event without requiring a public report',()=>{
  const state={view:'incidents',filter:'supported',query:'Beja',bootstrap,live:{events:[event]},replay:{cases:[]}};
  const items=queueItems(state),html=renderQueue(items,null);
  assert.equal(items.length,1);
  assert.equal(items[0].id,event.id);
  assert.match(html,/2 physical families/);
  assert.match(html,/VIIRS \+ Sentinel-3/);
});

test('Territory Multisource preserves two-family physical candidates even when observation freshness is delayed',()=>{
  const state={view:'live',filter:'multisource',query:'',bootstrap,live:{events:[event]},territory:{signals:[{resourceKind:'event',resourceId:event.id,type:'THERMAL_FIRE_CANDIDATE'}]}};
  assert.deepEqual(queueItems(state).map((item)=>item.id),[event.id]);
});

test('Fire summary distinguishes two-family physical evidence from generic multisource evidence',()=>{
  const state={live:{summary:{currentReportEvents:2,currentPhysicalEvents:3,twoPhysicalFamilyEvents:1,multisourceEvents:7,needsPhysicalObservation:4,staleOpenEvents:5}}};
  assert.match(incidentsSummary(state),/1<\/strong><span>two-family physical/);
  assert.match(incidentsIntro(state),/1 VIIRS \+ Sentinel-3/);
});

test('Living Fire distinguishes physical-family association from absent public-report association',()=>{
  const html=associationCard(event);
  assert.match(html,/Physical families associated · no public report match/);
  assert.match(html,/VIIRS and Sentinel-3 observations are associated/);
  assert.doesNotMatch(html,/No cross-source association/);
});

test('Living Fire makes the two-family step change impossible to miss without making a current-fire claim',()=>{
  const html=liveInspector({bootstrap:{control:{actors:[]},operations:{evidenceRequests:[]}}},event).content;
  assert.match(html,/TWO INDEPENDENT PHYSICAL FAMILIES/);
  assert.match(html,/VIIRS/);assert.match(html,/SENTINEL-3 \/ SLSTR/);
  assert.match(html,/4\.2 MW/);assert.match(html,/NO PUBLIC REPORT|No public report/);
  assert.match(html,/NOT CURRENT/);assert.match(html,/not presented as a current-fire claim/);
});
