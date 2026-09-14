import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const activeStyleNames=['tokens.css','base.css','components.css','routes.css','responsive.css'];
const [incidents,operations,evidence,command,evidenceGraph,...activeStyleSources]=await Promise.all([
  readFile(new URL('../src/routes/incidents.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/operations.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/evidenceDebt.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/commandOverview.js',import.meta.url),'utf8'),
  readFile(new URL('../src/evidenceGraph.js',import.meta.url),'utf8'),
  ...activeStyleNames.map(name=>readFile(new URL(`../styles/${name}`,import.meta.url),'utf8')),
]);
const styles=activeStyleSources.join('\n');

assert.match(incidents,/incidentEnvelope\(state,'detail'\)/,'Incidents must bind its selected inspector to the selected incident detail projection');
assert.match(incidents,/scope:'INCIDENTS'/,'Incidents must identify its own route-specific scene');
assert.match(incidents,/All statuses/,'Incidents must expose the full canonical status population through its filter');
assert.match(operations,/inventory=canonicalIncidents\(envelope\(state,'incidents'\)\)[\s\S]*?incidentContextSwitcher\(\{state,incidents:inventory,incident,source\}\)/,'Operations must give the shared incident switcher the authorized incident inventory');
assert.match(operations,/incidentEnvelope\(state,'operations'\)/,'Operations must remain bound to the selected incident operations projection');
assert.doesNotMatch(operations,/Array\.from\(\{length:Math\.max\(0,5-actions\.length\)/,'Operations must not fabricate a fifth action card');
assert.doesNotMatch(evidence,/Array\.from\(\{length:6\}/,'Evidence must not fabricate empty media slots');
assert.equal((evidence.match(/relationship legend/gi)??[]).length,0,'Evidence must not expose duplicate relationship legends in accessibility labels');
assert.match(command,/backendMetrics\.activeIncidents\?\.label\?\?'Verified current'/,'Command telemetry must use the governed verified-current label');
assert.match(command,/healthAxes=value\(source,'healthAxes'\)/,'Command health must use independent governed health axes');
assert.match(styles,/\.incidents-map[^}]*min-height:/s,'the selected-incident map must retain measurable height');
assert.match(styles,/@media\(max-width:1120px\)[\s\S]*?\.incident-detail-workspace\{grid-template-columns:minmax\(0,1fr\)\}/,'responsive Incident Detail must recompose to a single readable work column');
assert.match(styles,/@media\(max-width:768px\)[\s\S]*?\.incident-table tr,\.operations-table tr\{display:grid/,'mobile dense tables must recompose into readable cards');
assert.doesNotMatch(styles,/overflow-x:\s*auto/,'active responsive surfaces must reflow instead of inheriting retired horizontal-scroll geometry');
assert.doesNotMatch(styles,/min-width:\s*(?:700|720|730)px/,'active incident tables must not preserve retired desktop minimum widths');
assert.doesNotMatch(evidenceGraph,/\bsize:(?:[0-9]|10)(?:,|})/,'active evidence canvas labels must respect the 11px technical floor');

console.log('Rejected-delivery regressions passed: route-scoped truth, active responsive CSS, readable evidence canvas labels, and non-scrolling dense surfaces are enforced.');
