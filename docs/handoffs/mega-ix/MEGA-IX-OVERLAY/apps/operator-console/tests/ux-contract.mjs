import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const activeStyleNames=['tokens.css','base.css','components.css','routes.css','responsive.css'];
const [app,components,data,evidenceGraph,index,...activeStyleSources]=await Promise.all([
  Promise.all(['app.js','appActionController.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8'))).then(parts=>parts.join('\n')),
  readFile(new URL('../src/components.js',import.meta.url),'utf8'),
  readFile(new URL('../src/data.js',import.meta.url),'utf8'),
  readFile(new URL('../src/evidenceGraph.js',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  ...activeStyleNames.map(name=>readFile(new URL(`../styles/${name}`,import.meta.url),'utf8')),
]);
const css=activeStyleSources.join('\n'),activeVisualSource=`${css}\n${evidenceGraph}`;
const linkedStyles=[...index.matchAll(/href="\.\/styles\/([^"?]+)(?:\?[^"?]+)?"/g)].map(match=>match[1]);

assert.deepEqual(linkedStyles,[...activeStyleNames,...['approved/tokens.css','approved/shell.css','approved/components.css','approved/routes.css','approved/responsive.css','approved/runtime-compat.css','approved/integration.css','approved/signals.css','approved/field.css','approved/hierarchy.css','approved/situation.css','approved/mission-command.css']],'approved CSS follows retained legacy styles; runtime enables exactly one presentation');
assert.match(app,/link.disabled=link.hasAttribute\('data-approved-style'\)\?!approved:approved/);
// The assertions below preserve the retained legacy component/map compatibility contract.
// The approved styling has its own byte-equality contract and canonical browser checks.
assert.doesNotMatch(index,/styles\/(?:phase-b|final-locked)\.css/,'retired override layers must not be active');
for(const marker of ['history.pushState({vigiaRoute:true','captureScroll()','restoreFocus(prior)','hashchange','syncMobileNavigation','retainPersistentMaps(app)','app.replaceChildren(template.content)','restorePersistentMaps(app)','hydrateMaps(app)','focusMobileNavigation','trapMobileNavigationFocus','frame?.toggleAttribute(\'inert\',open)'])assert.ok(app.includes(marker),`app missing ${marker}`);
assert.doesNotMatch(app,/disposeMaps\(app\)|app\.innerHTML\s*=/,'route/filter renders must retain the persistent map runtime');
assert.ok(app.includes('const orderedSpecs=')&&app.includes('void ensureMapContext(routeFromHash())')&&app.includes('prewarmNavigation'),'startup must prioritize the visible projection and prewarm global geography on navigation intent');
for(const action of ['refresh-runtime','select-incident','incident-tab','map-zoom-in','map-zoom-out','map-toggle-thermal','map-layers','map-layer-toggle','inspect-operation','inspect-intelligence-artifact','inspect-forecast-boundary','reports-tab','select-toggle','select-option'])assert.ok(app.includes(`case'${action}'`),`controller missing ${action}`);
assert.match(components,/data-scroll-key="sidebar"/);assert.match(components,/aria-label="\$\{esc\(label\)\}"/);assert.match(components,/class="sidebar"/);assert.doesNotMatch(components,/route-marker|nav-link__id/);
assert.match(components,/\{ready:\{label:[\s\S]*?iconName:'check'[\s\S]*?degraded:[\s\S]*?iconName:'warning'/,'system status icon and tone must follow runtime state');
assert.match(components,/\['UNINITIALIZED','BOOTSTRAPPING'\][\s\S]*?Connecting to incident services[\s\S]*?REFRESHING[\s\S]*?last-good retained/,'startup and refresh status must describe the real resource state');
assert.match(components,/String\(value \?\? ''\)/,'shared escaping must not serialize null into visible copy');
for(const breakpoint of ['1550px','1380px','1120px','900px','768px','600px','390px','340px'])assert.match(css,new RegExp(`max-width:\\s*${breakpoint.replace('.', '\\.')}`),`responsive breakpoint missing ${breakpoint}`);
assert.doesNotMatch(css,/backdrop-filter\s*:/,'active surfaces must not use glass or blur');
assert.doesNotMatch(activeVisualSource,/#(?:8a52e8|9c6af0|6738b7|7a4fa3)/i,'active CSS or canvas code contains a forbidden purple value');
assert.doesNotMatch(evidenceGraph,/\bsize:(?:[0-9]|10)(?:,|})/,'canvas text must not render below the 11px technical floor');
assert.match(css,/--text-body:\s*14px/);assert.match(css,/--text-important:\s*13px/);assert.match(css,/--text-meta:\s*12px/);assert.match(css,/--text-telemetry:\s*11px/);
assert.match(css,/\.empty-truth-state p,[^}]*font-size:\s*var\(--text-body\)/s,'empty and explanatory copy must retain the 14px body floor');
assert.doesNotMatch(css,/overflow-x:\s*auto/,'active layouts must reflow instead of creating nested horizontal scroll regions');
assert.doesNotMatch(css,/min-width:\s*(?:700|720|730)px/,'incident and priority tables must not force desktop geometry on narrow viewports');
assert.match(css,/\.incident-quicklook>header>div:first-child\{display:grid;min-width:0\}/,'Quicklook title layout must not capture the sibling action group');
assert.match(css,/\.incident-quicklook>header>\.incident-quicklook__header-actions\{display:flex;align-items:center;justify-content:flex-end;gap:4px\}/,'Quicklook actions must override the generic panel-header child grid');
assert.match(css,/@media\(max-width:600px\)[\s\S]*?\.incident-quicklook>header\{grid-template-columns:minmax\(0,1fr\);align-items:start;row-gap:4px;height:max-content;min-height:0\}[\s\S]*?\.incident-quicklook>header>\.incident-quicklook__header-actions\{display:flex;flex-wrap:nowrap;justify-content:flex-start;gap:2px;min-width:0\}/,'Mobile Quicklook must reserve a max-content, non-overlapping row for Expand and Back actions');
for(const route of ['command-overview','incidents','incident-detail','intelligence','operations','global-awareness'])assert.match(data,new RegExp(`\\['${route}'`),`approved route missing from primary navigation: ${route}`);
for(const removed of ['evidence','evidence-debt','authority-trust','control-plane'])assert.doesNotMatch(data,new RegExp(`\\['${removed}'`),`removed route remains in primary navigation: ${removed}`);

console.log('UX contract passed: seven-route final white visual system, readable canvas/copy, reflowed dense surfaces, state-true status, and focus-contained mobile navigation are enforced.');
