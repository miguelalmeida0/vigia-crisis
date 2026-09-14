import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { phaseBFixture } from './phase-b-fixture.mjs';
import { renderApprovedRoute } from '../src/approved/index.js';
import { displayMetric } from '../src/approved/data/physical.js';

const m={id:'gust',label:'Wind gusts',value:54,unit:'km/h',asOf:'2026-09-08T11:50:00Z',source:'IPMA',freshness:'CURRENT',staleAfterMs:10800000};
function fixture(){const state=phaseBFixture(),world={incidents:[{incidentId:state.selectedIncidentId,metrics:[m]}],summary:[m]};for(const c of Object.values(state.runtime.canonical.globals))c.value.data.physicalWorld={state:'READY',value:world};for(const c of Object.values(state.runtime.canonical.incidents[state.selectedIncidentId]))c.value.data.physicalWorld={state:'READY',value:world};return state;}
test('all six routes expose real gusts without altering the approved shell',()=>{for(const route of ['command-overview','incidents','incident-detail','intelligence','operations','global-awareness']){const html=renderApprovedRoute(route,fixture());assert.match(html,/54/);assert.match(html,/Wind gusts/);assert.match(html,/km\/h/);if(route!=='incidents')assert.ok(html.indexOf('54')<html.indexOf('Why Vigia believes this')||!html.includes('Why Vigia believes this'));}});
test('missing metrics are explicitly unavailable, never illustrative numbers',()=>{const html=renderApprovedRoute('incident-detail',phaseBFixture());assert.match(html,/data-metric="gust"/);assert.match(html,/Unknown/);assert.doesNotMatch(html,/54 km|27\.4/);});
test('freshness ages again at display time and cannot remain Current overnight',()=>{const d=displayMetric(m,Date.parse('2026-09-09T00:00:00Z'));assert.match(d.freshnessLabel,/Stale/);assert.equal(d.display,'54');});
test('attribution and warning text are escaped',()=>{const state=fixture();state.runtime.canonical.incidents[state.selectedIncidentId].detail.value.data.physicalWorld.value.incidents[0].metrics[0]={...m,source:'<img onerror=bad>'};const html=renderApprovedRoute('incident-detail',state);assert.doesNotMatch(html,/<img onerror/);assert.match(html,/&lt;img/);});
test('approved map runtime is untouched and new disclosures are native keyboard controls',async()=>{const html=renderApprovedRoute('intelligence',fixture());assert.match(html,/<details class="physical-detail"/);assert.match(html,/<summary>/);const source=await readFile(new URL('../src/approved/ui/physical.js',import.meta.url),'utf8');assert.doesNotMatch(source,/Date\.now|Math\.|distanceKm\(|fetch\(|new Map/);});
